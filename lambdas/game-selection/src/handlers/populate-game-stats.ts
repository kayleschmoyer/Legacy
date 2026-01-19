import { EventBridgeEvent } from 'aws-lambda';
import { PublicSchema } from '@legacy-sports/db-client';
import {
  getGameBattingStats,
  getGameFieldingStats,
  getGamePitchingStats,
} from '@legacy-sports/bref-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  addBreadcrumb,
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/sentry';
import { and, eq, exists, not } from 'drizzle-orm';
import { withDb } from '../utils/db';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

export type PopulateGameStatsEvent = EventBridgeEvent<
  'populate-game-stats',
  Record<string, never>
>;

const basePopulateGameStatsHandler = async (
  event: PopulateGameStatsEvent,
): Promise<Record<string, never>> => {
  addBreadcrumb('Processing populate game stats event', {
    eventSource: event.source,
    detailType: event['detail-type'],
  });

  LOGGER.debug('Processing populate game stats event', { event });

  try {
    return await withDb(async (db) => {
      const battingGamesToLoad = await db
        .select()
        .from(PublicSchema.matchupPlayerGames)
        .innerJoin(
          PublicSchema.matchupPlayers,
          eq(
            PublicSchema.matchupPlayers.id,
            PublicSchema.matchupPlayerGames.matchupPlayerId,
          ),
        )
        .innerJoin(
          PublicSchema.matchups,
          eq(PublicSchema.matchups.id, PublicSchema.matchupPlayers.matchupId),
        )
        .innerJoin(
          PublicSchema.leagueWeekPlayerSeasons,
          and(
            eq(
              PublicSchema.leagueWeekPlayerSeasons.leagueId,
              PublicSchema.matchups.leagueId,
            ),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.weekNumber,
              PublicSchema.matchups.weekNumber,
            ),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.playerId,
              PublicSchema.matchupPlayers.playerId,
            ),
          ),
        )
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.matchupPlayers.playerId, PublicSchema.players.id),
        )
        .where(
          not(
            exists(
              db
                .select()
                .from(PublicSchema.gameBatting)
                .where(
                  and(
                    eq(
                      PublicSchema.gameBatting.playerId,
                      PublicSchema.matchupPlayers.playerId,
                    ),
                    eq(
                      PublicSchema.gameBatting.gameNum,
                      PublicSchema.matchupPlayerGames.battingGameNum,
                    ),
                    eq(
                      PublicSchema.gameBatting.season,
                      PublicSchema.leagueWeekPlayerSeasons.season,
                    ),
                  ),
                ),
            ),
          ),
        );

      const pitchingGamesToLoad = await db
        .select()
        .from(PublicSchema.matchupPlayerGames)
        .innerJoin(
          PublicSchema.matchupPlayers,
          eq(
            PublicSchema.matchupPlayers.id,
            PublicSchema.matchupPlayerGames.matchupPlayerId,
          ),
        )
        .innerJoin(
          PublicSchema.matchups,
          eq(PublicSchema.matchups.id, PublicSchema.matchupPlayers.matchupId),
        )
        .innerJoin(
          PublicSchema.leagueWeekPlayerSeasons,
          and(
            eq(
              PublicSchema.leagueWeekPlayerSeasons.leagueId,
              PublicSchema.matchups.leagueId,
            ),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.weekNumber,
              PublicSchema.matchups.weekNumber,
            ),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.playerId,
              PublicSchema.matchupPlayers.playerId,
            ),
          ),
        )
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.matchupPlayers.playerId, PublicSchema.players.id),
        )
        .where(
          not(
            exists(
              db
                .select()
                .from(PublicSchema.gamePitching)
                .where(
                  and(
                    eq(
                      PublicSchema.gamePitching.playerId,
                      PublicSchema.matchupPlayers.playerId,
                    ),
                    eq(
                      PublicSchema.gamePitching.gameNum,
                      PublicSchema.matchupPlayerGames.pitchingGameNum,
                    ),
                    eq(
                      PublicSchema.gamePitching.season,
                      PublicSchema.leagueWeekPlayerSeasons.season,
                    ),
                  ),
                ),
            ),
          ),
        );

      const fieldingGamesToLoad = await db
        .select()
        .from(PublicSchema.matchupPlayerGames)
        .innerJoin(
          PublicSchema.matchupPlayers,
          eq(
            PublicSchema.matchupPlayers.id,
            PublicSchema.matchupPlayerGames.matchupPlayerId,
          ),
        )
        .innerJoin(
          PublicSchema.matchups,
          eq(PublicSchema.matchups.id, PublicSchema.matchupPlayers.matchupId),
        )
        .innerJoin(
          PublicSchema.leagueWeekPlayerSeasons,
          and(
            eq(
              PublicSchema.leagueWeekPlayerSeasons.leagueId,
              PublicSchema.matchups.leagueId,
            ),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.weekNumber,
              PublicSchema.matchups.weekNumber,
            ),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.playerId,
              PublicSchema.matchupPlayers.playerId,
            ),
          ),
        )
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.matchupPlayers.playerId, PublicSchema.players.id),
        )
        .where(
          not(
            exists(
              db
                .select()
                .from(PublicSchema.gameFielding)
                .where(
                  and(
                    eq(
                      PublicSchema.gameFielding.playerId,
                      PublicSchema.matchupPlayers.playerId,
                    ),
                    eq(
                      PublicSchema.gameFielding.gameNum,
                      PublicSchema.matchupPlayerGames.fieldingGameNum,
                    ),
                    eq(
                      PublicSchema.gameFielding.season,
                      PublicSchema.leagueWeekPlayerSeasons.season,
                    ),
                  ),
                ),
            ),
          ),
        );

      for (const game of battingGamesToLoad) {
        if (game.matchup_player_games.battingGameNum !== null) {
          LOGGER.debug(
            `Loading Batting game ${game.matchup_player_games.battingGameNum} from ${game.league_week_player_seasons.season} for ${game.players.brefId}`,
          );

          const battingStats = await getGameBattingStats(
            game.players,
            game.league_week_player_seasons.season,
            game.matchup_player_games.battingGameNum,
          );

          if (battingStats !== null) {
            await db
              .insert(PublicSchema.gameBatting)
              .values(battingStats)
              .onConflictDoNothing();
          }
        }
      }

      for (const game of fieldingGamesToLoad) {
        if (game.matchup_player_games.fieldingGameNum !== null) {
          LOGGER.debug(
            `Loading Fielding game ${game.matchup_player_games.fieldingGameNum} at ${game.matchup_player_games.fieldingGamePos} from ${game.league_week_player_seasons.season} for ${game.players.brefId}`,
          );

          const fieldingStats = await getGameFieldingStats(
            game.players,
            game.league_week_player_seasons.season,
            game.matchup_player_games.fieldingGameNum,
            game.matchup_player_games.fieldingGamePos,
          );

          if (fieldingStats !== null) {
            await db
              .insert(PublicSchema.gameFielding)
              .values(fieldingStats)
              .onConflictDoNothing();
          }
        }
      }

      for (const game of pitchingGamesToLoad) {
        if (game.matchup_player_games.pitchingGameNum !== null) {
          LOGGER.debug(
            `Loading Pitching game ${game.matchup_player_games.pitchingGameNum} from ${game.league_week_player_seasons.season} for ${game.players.brefId}`,
          );

          const pitchingStats = await getGamePitchingStats(
            game.players,
            game.league_week_player_seasons.season,
            game.matchup_player_games.pitchingGameNum,
          );

          if (pitchingStats !== null) {
            await db
              .insert(PublicSchema.gamePitching)
              .values(pitchingStats)
              .onConflictDoNothing();
          }
        }
      }

      return {};
    });
  } catch (error) {
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: {
        lambda: 'game-selection-populate-stats',
        operation: 'populateGameStats',
      },
      extra: {
        event: event,
      },
    });
    throw error;
  }
};

export const handler = withSentry(basePopulateGameStatsHandler);
