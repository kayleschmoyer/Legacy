import {
  CreateMatchupPlayer,
  createMatchupRecord,
  getMatchup,
  getMissingMatchupRecords,
  getPublicDbConnection,
  PublicDb,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import {
  addBreadcrumb,
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/sentry';
import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

interface CreateMatchupEvent {
  league: number;
  week: number;
}

/**
 * Create matchup player records for a matchup
 * Uses per-player season assignments from league_week_player_seasons table.
 * @param db - Database connection
 * @param event - CreateMatchupEvent containing league and week information
 */
async function createMatchup(
  db: PublicDb,
  event: CreateMatchupEvent,
): Promise<void> {
  const matchup = await getMatchup(db, event.league, event.week);

  if (matchup === null) {
    throw new Error('Matchup has not been created');
  }

  // Note: Matchups no longer have selectedSeason field.
  // Seasons are assigned per-player via league_week_player_seasons table.
  LOGGER.info(
    `Creating matchup players for matchup ${matchup.id}. Seasons are assigned per-player.`,
  );

  const missingRecords = await getMissingMatchupRecords(db, matchup.id);

  LOGGER.debug(
    `Found ${missingRecords.length} players needing matchup records`,
  );

  for (const player of missingRecords) {
    // Note: Season selection is now handled by league_week_player_seasons
    // This function just creates the matchup_players records
    const record: CreateMatchupPlayer = {
      matchupId: matchup.id,
      playerId: player.id,
      teamId: player.teamId,
    };

    LOGGER.debug(
      `Creating matchup record: matchup=${matchup.id}, player=${player.id}`,
    );

    await createMatchupRecord(db, record);
  }

  LOGGER.info(
    `Successfully created ${missingRecords.length} matchup player records for matchup ${matchup.id}`,
  );
}

const baseCreateMatchupHandler = async (
  event: SQSEvent,
): Promise<SQSBatchResponse> => {
  addBreadcrumb(`Processing ${event.Records.length} create matchup messages`, {
    recordCount: event.Records.length,
  });

  const options = getDbOptions();
  const db = getPublicDbConnection(options);

  const failures: SQSBatchItemFailure[] = [];

  try {
    await db.initialize();

    for (const record of event.Records) {
      try {
        const matchup = JSON.parse(record.body) as CreateMatchupEvent;

        addBreadcrumb('Processing create matchup message', {
          messageId: record.messageId,
          league: matchup.league,
          week: matchup.week,
        });

        await createMatchup(db.db, matchup);
      } catch (err) {
        failures.push({ itemIdentifier: record.messageId });
        LOGGER.error(err instanceof Error ? err.message : String(err));

        captureError(err instanceof Error ? err : new Error(String(err)), {
          tags: {
            lambda: 'game-selection-create-matchup',
            operation: 'createMatchup',
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
  return await withSentry(baseCreateMatchupHandler)(event);
};
