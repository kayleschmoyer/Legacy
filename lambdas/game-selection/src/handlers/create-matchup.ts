import {
  createMatchupRecord,
  getMatchup,
  getMissingMatchupRecords,
  getPublicDbConnection,
  getSeasonBattingStatsForPlayer,
  PublicDb,
  PublicSchema,
} from '@legacy-sports/db-client';
import { and, eq } from 'drizzle-orm';
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
 * Season selection is now managed in league_week_player_seasons table at the league-week level
 * This allows free agents to have projections and ensures consistent seasons across matchups
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

  // Get matchup league and week for season selection
  if (!matchup.leagueId || !matchup.weekNumber) {
    LOGGER.error(`Matchup ${matchup.id} missing leagueId or weekNumber`);
    return;
  }

  for (const player of missingRecords) {
    let season: number;

    if (selectedSeason) {
      // Use the matchup's selected season for all players
      season = selectedSeason;
    } else {
      // Check if season already selected for this league/week/player
      const existingSeason = await db
        .select()
        .from(PublicSchema.leagueWeekPlayerSeasons)
        .where(
          and(
            eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, matchup.leagueId),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.weekNumber,
              matchup.weekNumber,
            ),
            eq(PublicSchema.leagueWeekPlayerSeasons.playerId, player.id),
          ),
        )
        .limit(1);

      if (existingSeason.length > 0) {
        season = existingSeason[0].season;
      } else {
        // Select a random season from available seasons
        const seasons = await getSeasonBattingStatsForPlayer(db, player.id);
        if (seasons.length === 0) {
          LOGGER.error(
            `Player ${player.id} has no available seasons. Skipping.`,
          );
          continue;
        }
        const seasonIdx = Math.floor(Math.random() * seasons.length);
        season = seasons[seasonIdx].season;

        // Insert season selection into league_week_player_seasons
        await db
          .insert(PublicSchema.leagueWeekPlayerSeasons)
          .values({
            leagueId: matchup.leagueId,
            weekNumber: matchup.weekNumber,
            playerId: player.id,
            season: season,
          })
          .onConflictDoNothing();
      }
    }

    // Create matchup player record (without season - that's in league_week_player_seasons now)
    const record = {
      matchupId: matchup.id,
      playerId: player.id,
      teamId: 0, // TODO: Get actual teamId from team_members or matchup context
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
