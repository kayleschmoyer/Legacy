import { and, eq } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import {
  getAllGameBattingStats,
  getAllGameFieldingStats,
  getAllGamePitchingStats,
} from '@legacy-sports/bref-client';
import type { WebSocketNotificationService } from '@legacy-sports/aws-utils';

import type {
  LoadMatchupStatsMessage,
  RetryableError,
} from './load-game-types';
import { isRateLimitError, isRetryableError } from './retry-strategy';
import {
  purgeStaleStats,
  selectAndAssignGameIdentifiers,
} from './game-state-manager';

export async function loadPlayerGameStats(
  db: PublicDb,
  player: LoadMatchupStatsMessage['players'][0],
  matchupId: number,
  leagueId: number | null,
  notificationService: WebSocketNotificationService | null,
): Promise<void> {
  const { playerId, brefId, season, fieldingGamePos } = player;

  LOGGER.info(
    `Loading stats for player ${playerId} (${brefId}), season ${season}`,
  );

  const playerObj: {
    id: number;
    firstName: string;
    lastName: string;
    brefId: string;
    statsLastFetchedAt: Date;
    allStarSelections: number;
    goldGloves: number;
    silverSluggers: number;
    mvpAwards: number;
    cyYoungAwards: number;
    worldSeriesRings: number;
    hallOfFame: boolean;
    rookieOfTheYear: boolean;
    totalGames: number;
  } = {
    id: playerId,
    firstName: '',
    lastName: '',
    brefId,
    statsLastFetchedAt: new Date(),
    allStarSelections: 0,
    goldGloves: 0,
    silverSluggers: 0,
    mvpAwards: 0,
    cyYoungAwards: 0,
    worldSeriesRings: 0,
    hallOfFame: false,
    rookieOfTheYear: false,
    totalGames: 0,
  };

  try {
    // Purge stale stats with empty game_identifier (from pre-refactor scrapes)
    await purgeStaleStats(db, playerId, season);

    // Load batting stats - check if ANY game exists for this player/season, if not load ALL games
    LOGGER.debug(
      `Checking if batting stats exist for player ${playerId}, season ${season}`,
    );
    const existingBatting = await db
      .select()
      .from(PublicSchema.gameBatting)
      .where(
        and(
          eq(PublicSchema.gameBatting.playerId, playerId),
          eq(PublicSchema.gameBatting.season, season),
        ),
      )
      .limit(1);

    if (existingBatting.length === 0) {
      LOGGER.info(
        `No batting stats cached for player ${playerId} season ${season}, loading ALL games from Baseball Reference`,
      );
      const allBattingStats = await getAllGameBattingStats(playerObj, season);
      if (allBattingStats && allBattingStats.length > 0) {
        await db
          .insert(PublicSchema.gameBatting)
          .values(allBattingStats)
          .onConflictDoNothing();
        LOGGER.info(
          `Loaded ${allBattingStats.length} batting game records for player ${playerId}`,
        );
      }
    } else {
      LOGGER.debug(
        `Batting stats already cached for player ${playerId}, season ${season} (${existingBatting.length} games found)`,
      );
    }

    // Load pitching stats - same pattern
    LOGGER.debug(
      `Checking if pitching stats exist for player ${playerId}, season ${season}`,
    );
    const existingPitching = await db
      .select()
      .from(PublicSchema.gamePitching)
      .where(
        and(
          eq(PublicSchema.gamePitching.playerId, playerId),
          eq(PublicSchema.gamePitching.season, season),
        ),
      )
      .limit(1);

    if (existingPitching.length === 0) {
      LOGGER.info(
        `No pitching stats cached for player ${playerId} season ${season}, loading ALL games from Baseball Reference`,
      );
      const allPitchingStats = await getAllGamePitchingStats(playerObj, season);
      if (allPitchingStats && allPitchingStats.length > 0) {
        await db
          .insert(PublicSchema.gamePitching)
          .values(allPitchingStats)
          .onConflictDoNothing();
        LOGGER.info(
          `Loaded ${allPitchingStats.length} pitching game records for player ${playerId}`,
        );
      }
    } else {
      LOGGER.debug(
        `Pitching stats already cached for player ${playerId}, season ${season}`,
      );
    }

    // Load fielding stats - same pattern
    LOGGER.debug(
      `Checking if fielding stats exist for player ${playerId}, season ${season}`,
    );
    const existingFielding = await db
      .select()
      .from(PublicSchema.gameFielding)
      .where(
        and(
          eq(PublicSchema.gameFielding.playerId, playerId),
          eq(PublicSchema.gameFielding.season, season),
        ),
      )
      .limit(1);

    if (existingFielding.length === 0) {
      LOGGER.info(
        `No fielding stats cached for player ${playerId} season ${season}, loading ALL games from Baseball Reference`,
      );
      const allFieldingStats = await getAllGameFieldingStats(
        playerObj,
        season,
        fieldingGamePos,
      );
      if (allFieldingStats && allFieldingStats.length > 0) {
        await db
          .insert(PublicSchema.gameFielding)
          .values(allFieldingStats)
          .onConflictDoNothing();
        LOGGER.info(
          `Loaded ${allFieldingStats.length} fielding game records for player ${playerId}`,
        );
      }
    } else {
      LOGGER.debug(
        `Fielding stats already cached for player ${playerId}, season ${season}`,
      );
    }

    LOGGER.info(`Successfully loaded all stats for player ${playerId}`);

    // After loading all games, select N random unique game identifiers
    // and update matchup_player_games
    if (player.matchupPlayerId) {
      await selectAndAssignGameIdentifiers(
        db,
        player.matchupPlayerId,
        playerId,
        season,
      );

      // Mark this player's game as completed
      await db
        .update(PublicSchema.matchupPlayerGames)
        .set({ statsLoadingStatus: 'completed' })
        .where(
          eq(
            PublicSchema.matchupPlayerGames.matchupPlayerId,
            player.matchupPlayerId,
          ),
        );

      LOGGER.info(`Updated player ${playerId} status to 'completed'`);

      // Send notification that player stats are updated (using cached leagueId)
      try {
        if (notificationService && leagueId !== null) {
          await notificationService.notifyPlayerStatsUpdated(
            playerId,
            matchupId,
            leagueId,
            { playerId, status: 'completed' },
          );
          LOGGER.debug(
            `Sent player stats updated notification for player ${playerId}`,
          );
        }
      } catch (notifyError) {
        LOGGER.warn('Failed to send player stats updated notification', {
          error:
            notifyError instanceof Error
              ? notifyError.message
              : String(notifyError),
          playerId,
        });
      }
    }
  } catch (error) {
    const retryable = isRetryableError(error);

    LOGGER.error(`Failed to load stats for player ${playerId}:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      playerId,
      brefId,
      season,
      isRetryable: retryable,
    });

    // For retryable errors (429, timeout), leave status as 'loading' so
    // the SQS retry can process the player again without false 'failed' state
    if (retryable) {
      const retryableError = new Error(
        `RETRYABLE: ${error instanceof Error ? error.message : String(error)}`,
      ) as RetryableError;
      retryableError.originalError = error;
      retryableError.isRetryableTimeout = true;
      retryableError.isRateLimit = isRateLimitError(error);
      throw retryableError;
    }

    // Non-retryable error — mark this player's game as failed
    if (player.matchupPlayerId) {
      await db
        .update(PublicSchema.matchupPlayerGames)
        .set({ statsLoadingStatus: 'failed' })
        .where(
          eq(
            PublicSchema.matchupPlayerGames.matchupPlayerId,
            player.matchupPlayerId,
          ),
        );

      LOGGER.info(`Updated player ${playerId} game status to 'failed'`);
    }

    throw error;
  }
}
