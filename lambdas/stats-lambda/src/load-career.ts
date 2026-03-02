import { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { loadCareerStats } from '@legacy-sports/data-loaders';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import {
  addBreadcrumb,
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/sentry';
import {
  getPlayerByBrefId,
  PublicDb,
  refreshPlayerEligiblePositions,
  runWithPublicClient,
} from '@legacy-sports/db-client';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

async function loadPlayer(db: PublicDb, brefId: string): Promise<void> {
  LOGGER.debug(`Importing ${brefId}`);

  const player = await getPlayerByBrefId(db, brefId);

  if (!player) {
    throw new Error(`Could not find player ${brefId}`);
  }

  await loadCareerStats(db, player.brefId);
}

const baseHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  LOGGER.debug(JSON.stringify(event));
  addBreadcrumb(`Processing ${event.Records.length} SQS records`);

  return await runWithPublicClient(getDbOptions(), async (db) => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    // Process each record individually to handle partial failures
    for (const record of event.Records) {
      try {
        addBreadcrumb(`Processing record ${record.messageId}`);

        // Validate message format
        if (!record.body) {
          const error = new Error(`Record ${record.messageId} has no body`);
          LOGGER.error(error.message);
          captureError(error, { messageId: record.messageId });
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        // Parse and validate brefId
        let brefId: string;
        try {
          brefId = JSON.parse(record.body) as string;
        } catch (parseError) {
          const error = new Error(
            `Failed to parse message body for record ${record.messageId}`,
          );
          LOGGER.error(error.message, parseError as Error);
          captureError(error, {
            messageId: record.messageId,
            messageBody: record.body,
            originalError:
              parseError instanceof Error
                ? parseError
                : new Error(String(parseError)),
          });
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        if (!brefId || typeof brefId !== 'string') {
          const error = new Error(
            `Invalid brefId in record ${record.messageId}: ${brefId}`,
          );
          LOGGER.error(error.message);
          captureError(error, {
            messageId: record.messageId,
            brefId: brefId,
          });
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        // Process the player
        addBreadcrumb(`Loading player stats for brefId: ${brefId}`);
        await loadPlayer(db, brefId);
        LOGGER.debug(
          `Successfully processed record ${record.messageId} for player ${brefId}`,
        );
        addBreadcrumb(`Successfully processed player ${brefId}`);
      } catch (error) {
        const errorMessage = `Failed to process record ${record.messageId}`;
        LOGGER.error(errorMessage, error as Error);

        // Try to extract brefId from parsed body for error context
        let errorBrefId: string | undefined;
        try {
          errorBrefId = JSON.parse(record.body) as string;
        } catch {
          // Ignore parsing errors in error handler
        }

        // Capture error with full context for debugging
        captureError(error as Error, {
          tags: {
            lambda: 'stats-lambda',
            operation: 'load_career_stats',
          },
          extra: {
            messageId: record.messageId,
            messageBody: record.body,
            brefId: errorBrefId, // Include brefId if we could parse it
            sqsMessageAttributes: record.messageAttributes,
          },
        });

        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    // Refresh the materialized view once per SQS batch so the draft picker
    // sees up-to-date eligibility data without forcing a per-player refresh.
    const successCount = event.Records.length - batchItemFailures.length;
    if (successCount > 0) {
      try {
        addBreadcrumb('Refreshing player_eligible_positions materialized view');
        await refreshPlayerEligiblePositions(db);
        LOGGER.debug('player_eligible_positions materialized view refreshed');
      } catch (refreshError) {
        // Non-fatal: log and continue — stale eligibility data is better than
        // losing the batch result.
        LOGGER.error(
          'Failed to refresh player_eligible_positions:',
          refreshError as Error,
        );
        captureError(refreshError as Error, {
          tags: { operation: 'refresh_player_eligible_positions' },
        });
      }
    }

    LOGGER.debug(
      `Processed ${event.Records.length} records, ${batchItemFailures.length} failures`,
    );
    addBreadcrumb(
      `Completed processing with ${batchItemFailures.length} failures`,
    );

    return {
      batchItemFailures,
    };
  });
};

// Export the Sentry-wrapped handler with explicit Promise wrapper
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  return await withSentry(baseHandler)(event);
};
