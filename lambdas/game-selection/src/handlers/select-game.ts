import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  addBreadcrumb,
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/sentry';
import { getDb } from '../utils/db';
import { selectGamesForMatchup } from '../services/season-game-selector';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

interface SelectGameEvent {
  matchupId: number;
  game: number;
}

/**
 * Handler for selecting games for matchups
 * Triggered by SQS messages containing matchupId and game number
 * Uses the matchup's selected_season to determine which season to select games from
 */
const baseSelectGameHandler = async (
  event: SQSEvent,
): Promise<SQSBatchResponse> => {
  addBreadcrumb(`Processing ${event.Records.length} select game messages`, {
    recordCount: event.Records.length,
  });

  LOGGER.info('Processing SQS event', {
    recordCount: event.Records.length,
  });

  const db = await getDb();

  const failures: SQSBatchItemFailure[] = [];

  try {
    for (const record of event.Records) {
      try {
        const matchup = JSON.parse(record.body) as SelectGameEvent;

        addBreadcrumb('Processing select game message', {
          messageId: record.messageId,
          matchupId: matchup.matchupId,
          game: matchup.game,
        });

        LOGGER.info('Selecting games for matchup', {
          matchupId: matchup.matchupId,
          gameNumber: matchup.game,
        });

        // Use the new season-game-selector service which automatically
        // uses the matchup's selected_season field
        await selectGamesForMatchup(db.db, matchup.matchupId, matchup.game);

        LOGGER.info('Successfully selected games for matchup', {
          matchupId: matchup.matchupId,
          gameNumber: matchup.game,
        });
      } catch (err) {
        failures.push({ itemIdentifier: record.messageId });
        LOGGER.error('Error processing record', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });

        captureError(err instanceof Error ? err : new Error(String(err)), {
          tags: {
            lambda: 'game-selection-select-game',
            operation: 'selectGamesForMatchup',
          },
          extra: {
            messageId: record.messageId,
            recordBody: record.body,
          },
        });
      }
    }
  } finally {
    await db.close();
  }

  return {
    batchItemFailures: failures,
  };
};

// Export the Sentry-wrapped handler with explicit Promise wrapper
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  return await withSentry(baseSelectGameHandler)(event);
};
