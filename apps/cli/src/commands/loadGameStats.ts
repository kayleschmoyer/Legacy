import { LOGGER } from '@legacy-sports/logging';
import {
  getPlayerByBrefId,
  PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { and, eq } from 'drizzle-orm';
import {
  getAllGameBattingStats,
  getAllGameFieldingStats,
  getAllGamePitchingStats,
} from '@legacy-sports/bref-client';

interface HandleLoadGameStatsArgs {
  player: string;
  season: number;
  position?: string;
}

/**
 * Load game-level stats for a specific player and season
 * This is the same logic used by the stats Lambda
 */
async function loadPlayerGameStats(
  db: PublicDb,
  playerId: number,
  brefId: string,
  season: number,
  fieldingGamePos: string | null,
): Promise<void> {
  LOGGER.info(
    `Loading game stats for player ${playerId} (${brefId}), season ${season}`,
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

  // Load batting stats
  LOGGER.info(`📊 Loading batting stats...`);
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
      `No batting stats cached for player ${playerId} season ${season}, loading from Baseball Reference`,
    );
    const allBattingStats = await getAllGameBattingStats(playerObj, season);
    if (allBattingStats && allBattingStats.length > 0) {
      await db
        .insert(PublicSchema.gameBatting)
        .values(allBattingStats)
        .onConflictDoNothing();
      LOGGER.info(
        `✅ Loaded ${allBattingStats.length} batting games for player ${playerId}`,
      );
    } else {
      LOGGER.info(`No batting stats found for player ${playerId}`);
    }
  } else {
    LOGGER.info(
      `Batting stats already cached for player ${playerId}, season ${season}`,
    );
  }

  // Load pitching stats
  LOGGER.info(`⚾ Loading pitching stats...`);
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
      `No pitching stats cached for player ${playerId} season ${season}, loading from Baseball Reference`,
    );
    const allPitchingStats = await getAllGamePitchingStats(playerObj, season);
    if (allPitchingStats && allPitchingStats.length > 0) {
      await db
        .insert(PublicSchema.gamePitching)
        .values(allPitchingStats)
        .onConflictDoNothing();
      LOGGER.info(
        `✅ Loaded ${allPitchingStats.length} pitching games for player ${playerId}`,
      );
    } else {
      LOGGER.info(`No pitching stats found for player ${playerId}`);
    }
  } else {
    LOGGER.info(
      `Pitching stats already cached for player ${playerId}, season ${season}`,
    );
  }

  // Load fielding stats
  LOGGER.info(`🧤 Loading fielding stats...`);
  LOGGER.debug(`Fielding position: ${fieldingGamePos ?? 'NULL'}`);
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
      `No fielding stats cached for player ${playerId} season ${season}, loading from Baseball Reference`,
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
        `✅ Loaded ${allFieldingStats.length} fielding games for player ${playerId}`,
      );
    } else {
      LOGGER.info(
        `No fielding stats found for player ${playerId} (position: ${fieldingGamePos ?? 'NULL'})`,
      );
    }
  } else {
    LOGGER.info(
      `Fielding stats already cached for player ${playerId}, season ${season}`,
    );
  }

  LOGGER.info(`✅ Successfully loaded all game stats for player ${playerId}`);
}

export async function handleLoadGameStats(
  args: HandleLoadGameStatsArgs,
): Promise<void> {
  // Validate required arguments
  if (!args.player) {
    LOGGER.error('--player is required');
    throw new Error('--player argument is required');
  }
  if (!args.season) {
    LOGGER.error('--season is required');
    throw new Error('--season argument is required');
  }

  LOGGER.info(
    `\n🎯 Loading game stats for ${args.player} (season ${args.season})`,
  );
  if (args.position) {
    LOGGER.info(`   Fielding position: ${args.position}`);
  }

  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db) => {
    // Verify player exists
    const player = await getPlayerByBrefId(db, args.player);

    if (!player) {
      const errorMsg = `Player with brefId "${args.player}" not found in database`;
      LOGGER.error(errorMsg);
      throw new Error(errorMsg);
    }

    LOGGER.info(
      `Found player: ${player.firstName} ${player.lastName} (ID: ${player.id})`,
    );

    try {
      await loadPlayerGameStats(
        db,
        player.id,
        player.brefId,
        args.season,
        args.position ?? null,
      );
    } catch (err) {
      LOGGER.error(
        `❌ Error loading game stats for ${player.brefId}: ${String(err)}`,
      );
      throw err;
    }
  });
}
