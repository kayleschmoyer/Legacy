import {
  CreateMatchupPlayer,
  createMatchupRecord,
  getMatchup,
  getMissingMatchupRecords,
  getPublicDbConnection,
  getSeasonBattingStatsForPlayer,
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
 * Uses the matchup's selected_season if set, otherwise randomly selects a season
 * Note: In the new matchup system with selected_season, all players in a matchup
 * should use the same season (the matchup's selected_season).
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

  // Get the matchup's selected season
  const selectedSeason = matchup.selectedSeason;

  if (!selectedSeason) {
    LOGGER.warn(
      `Matchup ${matchup.id} does not have a selected_season. Using random season selection for backward compatibility.`,
    );
  } else {
    LOGGER.info(
      `Creating matchup player records for matchup ${matchup.id} using selected season ${selectedSeason}`,
    );
  }

  const missingRecords = await getMissingMatchupRecords(db, matchup.id);

  LOGGER.debug(
    `Found ${missingRecords.length} players needing matchup records`,
  );

  for (const player of missingRecords) {
    let season: number;

    if (selectedSeason) {
      // Use the matchup's selected season for all players
      season = selectedSeason;
    } else {
      // Fallback to random season selection (for backward compatibility)
      const seasons = await getSeasonBattingStatsForPlayer(db, player.id);
      if (seasons.length === 0) {
        LOGGER.error(`Player ${player.id} has no available seasons. Skipping.`);
        continue;
      }
      const seasonIdx = Math.floor(Math.random() * seasons.length);
      season = seasons[seasonIdx].season;
    }

    // TODO: This code needs to be updated to include teamId
    // The schema requires teamId but getMissingMatchupRecords doesn't return it
    // This handler may need to be refactored or deprecated
    const record: CreateMatchupPlayer = {
      matchupId: matchup.id,
      playerId: player.id,
      teamId: 0, // FIXME: Need to determine correct team for player
      // season: season, // Field removed from schema
    };

    LOGGER.debug(
      `Creating matchup record: matchup=${matchup.id}, player=${player.id}, season=${season}`,
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
