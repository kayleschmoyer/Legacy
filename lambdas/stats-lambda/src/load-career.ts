import { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import memoizeOne from 'memoize-one';
import { loadCareerStats } from '@legacy-sports/data-loaders';
import { LOGGER } from '@legacy-sports/logging';
import { 
  getDbOptions, 
  getSentryConfigFromEnv, 
  initSentry, 
  withSentry, 
  captureError,
  addBreadcrumb 
} from '@legacy-sports/utils';
import {
  getDbConnection,
  getPlayerByBrefId,
  PublicSchema,
} from '@legacy-sports/db-client';
import { BaseDbConnection } from 'lib/db-client/src/lib/client/abstract/BaseDbClient';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

const getDb = memoizeOne(async () => {
  const opts = getDbOptions();
  const connection = getDbConnection(opts, PublicSchema);

  await connection.initialize();

  return connection;
});

async function loadPlayer(
  dbClient: BaseDbConnection<typeof PublicSchema>,
  brefId: string,
): Promise<void> {
  LOGGER.debug(`Importing ${brefId}`);

  const player = await getPlayerByBrefId(dbClient.db, brefId);

  if (!player) {
    throw new Error(`Could not find player ${brefId}`);
  }

  await loadCareerStats(dbClient.db, player.brefId);
}

const baseHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  LOGGER.debug(JSON.stringify(event));
  addBreadcrumb(`Processing ${event.Records.length} SQS records`);

  const dbClient = await getDb();
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
        const error = new Error(`Failed to parse message body for record ${record.messageId}`);
        LOGGER.error(error.message, parseError as Error);
        captureError(error, { 
          messageId: record.messageId, 
          messageBody: record.body,
          originalError: parseError 
        });
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      if (!brefId || typeof brefId !== 'string') {
        const error = new Error(`Invalid brefId in record ${record.messageId}: ${brefId}`);
        LOGGER.error(error.message);
        captureError(error, { 
          messageId: record.messageId, 
          brefId: brefId 
        });
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      // Process the player
      addBreadcrumb(`Loading player stats for brefId: ${brefId}`);
      await loadPlayer(dbClient, brefId);
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
          operation: 'load_career_stats'
        },
        extra: {
          messageId: record.messageId,
          messageBody: record.body,
          brefId: errorBrefId, // Include brefId if we could parse it
          sqsMessageAttributes: record.messageAttributes
        }
      });
      
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  // Note: Don't close the database connection in Lambda
  // The connection is memoized and should be reused across invocations
  // Lambda containers handle cleanup when the container is terminated

  LOGGER.debug(
    `Processed ${event.Records.length} records, ${batchItemFailures.length} failures`,
  );
  addBreadcrumb(`Completed processing with ${batchItemFailures.length} failures`);

  return {
    batchItemFailures,
  };
};

// Export the Sentry-wrapped handler
export const handler = withSentry(baseHandler);
