import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { PublicDb, PublicSchema } from '@legacy-sports/db-client';

/**
 * Select random unique game identifiers and update matchup_player_games
 * Called after all game stats are loaded for a player.
 * Only updates records that don't already have a game_identifier assigned
 * (i.e., records from the uncached path where game selection couldn't pick a game).
 */
export async function selectAndAssignGameIdentifiers(
  db: PublicDb,
  matchupPlayerId: number,
  playerId: number,
  season: number,
): Promise<void> {
  LOGGER.info(
    `Selecting game identifiers for matchup player ${matchupPlayerId}`,
  );

  // Get all unique game identifiers for this player/season from batting stats.
  // Falls back to pitching stats for DH-era pitchers who have no batting rows.
  const allUniqueBattingGames = await db
    .selectDistinct({ gameIdentifier: PublicSchema.gameBatting.gameIdentifier })
    .from(PublicSchema.gameBatting)
    .where(
      and(
        eq(PublicSchema.gameBatting.playerId, playerId),
        eq(PublicSchema.gameBatting.season, season),
      ),
    );

  // Filter out empty string game_identifiers (stale data from pre-refactor scrapes)
  let uniqueGames = allUniqueBattingGames.filter(
    (g) => g.gameIdentifier !== '' && g.gameIdentifier !== null,
  );

  if (uniqueGames.length === 0) {
    // Batting stats are absent (DH-era pitcher) or all stale — try pitching stats
    LOGGER.info(
      `No valid batting game identifiers for player ${playerId} season ${season}, falling back to pitching stats`,
    );
    const allUniquePitchingGames = await db
      .selectDistinct({
        gameIdentifier: PublicSchema.gamePitching.gameIdentifier,
      })
      .from(PublicSchema.gamePitching)
      .where(
        and(
          eq(PublicSchema.gamePitching.playerId, playerId),
          eq(PublicSchema.gamePitching.season, season),
        ),
      );

    uniqueGames = allUniquePitchingGames.filter(
      (g) => g.gameIdentifier !== '' && g.gameIdentifier !== null,
    );
  }

  if (uniqueGames.length === 0) {
    LOGGER.warn(
      `No valid game identifiers found for player ${playerId} season ${season} (checked batting and pitching), marking unassigned slots as spSkipped`,
    );
    // Bulk-mark all unassigned slots as spSkipped in one round-trip.
    await db
      .update(PublicSchema.matchupPlayerGames)
      .set({ spSkipped: true, statsLoadingStatus: 'completed' })
      .where(
        and(
          eq(PublicSchema.matchupPlayerGames.matchupPlayerId, matchupPlayerId),
          isNull(PublicSchema.matchupPlayerGames.gameIdentifier),
        ),
      );
    return;
  }

  LOGGER.info(
    `Found ${uniqueGames.length} unique games for player ${playerId} season ${season}`,
  );

  // Get records that need game_identifier assignment (null gameIdentifier)
  const unassignedGames = await db
    .select()
    .from(PublicSchema.matchupPlayerGames)
    .where(
      and(
        eq(PublicSchema.matchupPlayerGames.matchupPlayerId, matchupPlayerId),
        isNull(PublicSchema.matchupPlayerGames.gameIdentifier),
      ),
    );

  if (unassignedGames.length === 0) {
    LOGGER.info(
      `All game slots already have game_identifiers for matchup player ${matchupPlayerId}`,
    );
    return;
  }

  // Get already-used game identifiers to avoid duplicates
  const usedGames = await db
    .select({ gameIdentifier: PublicSchema.matchupPlayerGames.gameIdentifier })
    .from(PublicSchema.matchupPlayerGames)
    .where(
      and(
        eq(PublicSchema.matchupPlayerGames.matchupPlayerId, matchupPlayerId),
        isNotNull(PublicSchema.matchupPlayerGames.gameIdentifier),
      ),
    );

  const usedIds = new Set(
    usedGames
      .map((g) => g.gameIdentifier)
      .filter((id): id is string => id !== null),
  );

  // Filter to available (not already used) games
  const availableGames = uniqueGames.filter(
    (g) => !usedIds.has(g.gameIdentifier),
  );

  // Take as many fresh-unique identifiers as possible for the unassigned
  // slots; any remaining slots are filled by the recycle fallback below.
  const selected: string[] = availableGames
    .map((g) => ({ gameIdentifier: g.gameIdentifier, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, unassignedGames.length)
    .map((g) => g.gameIdentifier)
    .filter((id): id is string => id !== null);

  // If unique games are exhausted (player has fewer distinct BR games than
  // gamesPerMatchup, or duplicate-prevention filtered too aggressively),
  // recycle from the full uniqueGames pool so no non-SP-skipped slot is left
  // with gameIdentifier=null. Re-using an identifier is acceptable; leaving
  // null breaks the invariant that non-skipped rows always have a real game.
  if (selected.length < unassignedGames.length) {
    const recyclePool = uniqueGames
      .map((g) => g.gameIdentifier)
      .filter((id): id is string => id !== null);
    const needed = unassignedGames.length - selected.length;
    LOGGER.warn(
      `Only ${availableGames.length} unique games available for ${unassignedGames.length} slots (matchup player ${matchupPlayerId}); recycling ${needed} identifier(s) from pool of ${recyclePool.length}`,
    );
    for (let i = 0; i < needed && recyclePool.length > 0; i++) {
      selected.push(
        recyclePool[Math.floor(Math.random() * recyclePool.length)],
      );
    }
  }

  LOGGER.info(
    `Assigning ${selected.length} games (${availableGames.length} unique available, ${usedIds.size} already used) for ${unassignedGames.length} slots`,
  );

  // Update each unassigned matchup_player_games record with a game_identifier
  for (let i = 0; i < selected.length && i < unassignedGames.length; i++) {
    await db
      .update(PublicSchema.matchupPlayerGames)
      .set({
        gameIdentifier: selected[i],
      })
      .where(eq(PublicSchema.matchupPlayerGames.id, unassignedGames[i].id));
  }

  LOGGER.info(
    `Successfully assigned game identifiers for matchup player ${matchupPlayerId}`,
  );
}

/**
 * Purge stale game stats that have empty game_identifier values.
 * These were scraped by pre-refactor code that didn't populate game_identifier.
 * Deleting them allows a fresh re-scrape that produces proper identifiers.
 */
export async function purgeStaleStats(
  db: PublicDb,
  playerId: number,
  season: number,
): Promise<void> {
  // Check all three tables for stale records (empty game_identifier)
  const [staleBatting, stalePitching, staleFielding] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(PublicSchema.gameBatting)
      .where(
        and(
          eq(PublicSchema.gameBatting.playerId, playerId),
          eq(PublicSchema.gameBatting.season, season),
          eq(PublicSchema.gameBatting.gameIdentifier, ''),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(PublicSchema.gamePitching)
      .where(
        and(
          eq(PublicSchema.gamePitching.playerId, playerId),
          eq(PublicSchema.gamePitching.season, season),
          eq(PublicSchema.gamePitching.gameIdentifier, ''),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(PublicSchema.gameFielding)
      .where(
        and(
          eq(PublicSchema.gameFielding.playerId, playerId),
          eq(PublicSchema.gameFielding.season, season),
          eq(PublicSchema.gameFielding.gameIdentifier, ''),
        ),
      ),
  ]);

  const staleBattingCount = staleBatting[0]?.cnt ?? 0;
  const stalePitchingCount = stalePitching[0]?.cnt ?? 0;
  const staleFieldingCount = staleFielding[0]?.cnt ?? 0;
  const totalStale =
    staleBattingCount + stalePitchingCount + staleFieldingCount;
  if (totalStale === 0) return;

  LOGGER.warn(
    `Found ${totalStale} stale records (batting: ${staleBattingCount}, pitching: ${stalePitchingCount}, fielding: ${staleFieldingCount}) with empty game_identifier for player ${playerId} season ${season} — purging to force re-scrape`,
  );

  // Delete stale batting
  await db
    .delete(PublicSchema.gameBatting)
    .where(
      and(
        eq(PublicSchema.gameBatting.playerId, playerId),
        eq(PublicSchema.gameBatting.season, season),
        eq(PublicSchema.gameBatting.gameIdentifier, ''),
      ),
    );

  // Delete stale pitching
  await db
    .delete(PublicSchema.gamePitching)
    .where(
      and(
        eq(PublicSchema.gamePitching.playerId, playerId),
        eq(PublicSchema.gamePitching.season, season),
        eq(PublicSchema.gamePitching.gameIdentifier, ''),
      ),
    );

  // Delete stale fielding
  await db
    .delete(PublicSchema.gameFielding)
    .where(
      and(
        eq(PublicSchema.gameFielding.playerId, playerId),
        eq(PublicSchema.gameFielding.season, season),
        eq(PublicSchema.gameFielding.gameIdentifier, ''),
      ),
    );

  LOGGER.info(`Purged stale stats for player ${playerId} season ${season}`);
}

/**
 * Update the stats_loading_status of a matchup, optionally updating the
 * matchup's main `status` column via `extraFields`.
 */
export async function updateMatchupStatus(
  db: PublicDb,
  matchupId: number,
  statsLoadingStatus: 'loading' | 'completed' | 'failed' | 'retry',
  extraFields?: { status?: 'in_progress' | 'completed' },
): Promise<void> {
  const updateData: {
    statsLoadingStatus: 'loading' | 'completed' | 'failed' | 'retry';
    status?: 'in_progress' | 'completed';
  } = { statsLoadingStatus };

  if (extraFields?.status) {
    updateData.status = extraFields.status;
  }

  await db
    .update(PublicSchema.matchups)
    .set(updateData)
    .where(eq(PublicSchema.matchups.id, matchupId));
}

/**
 * Check if all games are complete for a matchup by comparing
 * gamesPerMatchup with the count of distinct game_num values.
 * Returns the appropriate matchup main status.
 */
export async function checkMatchupCompletion(
  db: PublicDb,
  matchupId: number,
): Promise<'in_progress' | 'completed'> {
  // Query matchup to get gamesPerMatchup and count selected games
  const matchupResult = await db
    .select({
      gamesPerMatchup: PublicSchema.matchups.gamesPerMatchup,
    })
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, matchupId))
    .limit(1);

  const gamesPerMatchup = matchupResult[0]?.gamesPerMatchup ?? 0;

  // Count distinct game_num values for this matchup
  const selectedGamesResult = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${PublicSchema.matchupPlayerGames.gameNum})`,
    })
    .from(PublicSchema.matchupPlayerGames)
    .innerJoin(
      PublicSchema.matchupPlayers,
      eq(
        PublicSchema.matchupPlayerGames.matchupPlayerId,
        PublicSchema.matchupPlayers.id,
      ),
    )
    .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

  const selectedGamesCount = selectedGamesResult[0]?.count ?? 0;

  // If all games are selected and stats loaded, mark matchup as completed
  if (selectedGamesCount >= gamesPerMatchup && gamesPerMatchup > 0) {
    LOGGER.info(
      `All games complete for matchup ${matchupId} (${selectedGamesCount}/${gamesPerMatchup})`,
    );
    return 'completed';
  }

  LOGGER.info(
    `Matchup ${matchupId} still in progress (${selectedGamesCount}/${gamesPerMatchup} games)`,
  );
  return 'in_progress';
}
