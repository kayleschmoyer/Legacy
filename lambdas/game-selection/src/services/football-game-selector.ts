import {
  getMatchupFootballPlayerGameStats,
  PublicDb,
  PublicSchema,
  updateMatchupScore,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { computeFootballPlayerGamePoints } from '@legacy-sports/scoring';
import { getFootballScoringSettingsForLeague } from '@legacy-sports/scoring/server';
import {
  cryptoRandomInt,
  GAMES_PER_MATCHUP_BY_SPORT,
} from '@legacy-sports/utils';
import { and, eq, inArray, isNotNull, notInArray } from 'drizzle-orm';
import { UserInputError } from '../errors';

/**
 * Mirrors lambdas/stats-lambda/src/constants.ts IDP_POSITIONS. Duplicated
 * rather than shared because game-selection and stats-lambda are separate
 * Lambda deployment packages with no shared-code import path between them
 * (the same reason season-game-selector.ts doesn't import stats-lambda code).
 */
const IDP_POSITIONS = ['DL', 'LB', 'DB'];

export interface FootballGameSelectionResult {
  gameIdentifier: string | null;
  statsAreCached: boolean;
}

export interface FootballPlayerNeedingStats {
  matchupPlayerId: number;
  playerId: number;
  pfrId: string;
  season: number;
  isDst: boolean;
  position: string;
  nflTeam: string | null;
}

/**
 * Calculate and persist matchup scores for an all-cached football matchup.
 * Mirrors computeAndPersistMatchupScores in season-game-selector.ts (baseball)
 * and calculateAndUpdateFootballMatchupScores in
 * lambdas/stats-lambda/src/handlers/calculate-football-matchup-scores.ts —
 * duplicated here for the same cross-Lambda-package reason as IDP_POSITIONS
 * above, since team1Score/team2Score must be written before
 * statsLoadingStatus flips to 'completed' (same ordering guarantee as
 * LS-3817's baseball fix).
 */
async function computeAndPersistFootballMatchupScores(
  db: PublicDb,
  matchupId: number,
  leagueId: number,
  team1Id: number | null,
  team2Id: number | null,
): Promise<void> {
  try {
    const matchupPlayers = await db
      .select({
        matchupPlayerId: PublicSchema.matchupPlayers.id,
        teamId: PublicSchema.matchupPlayers.teamId,
        positionType: PublicSchema.leaguePosition.positionType,
      })
      .from(PublicSchema.matchupPlayers)
      .leftJoin(
        PublicSchema.leaguePosition,
        eq(
          PublicSchema.leaguePosition.id,
          PublicSchema.matchupPlayers.positionId,
        ),
      )
      .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

    const matchupPlayerToTeam = new Map<number, number>(
      matchupPlayers.map((mp) => [mp.matchupPlayerId, mp.teamId]),
    );
    const matchupPlayerToPosition = new Map<number, string>(
      matchupPlayers
        .filter((mp): mp is typeof mp & { positionType: string } =>
          Boolean(mp.positionType),
        )
        .map((mp) => [mp.matchupPlayerId, mp.positionType]),
    );

    const scoringSettings = await getFootballScoringSettingsForLeague(
      db,
      leagueId,
    );
    const playerGameStats = await getMatchupFootballPlayerGameStats(
      db,
      matchupId,
    );

    let team1Total = 0;
    let team2Total = 0;

    for (const stat of playerGameStats) {
      const teamId = matchupPlayerToTeam.get(stat.matchupPlayerId);
      if (teamId === undefined) continue;

      const score = computeFootballPlayerGamePoints(stat, scoringSettings, {
        position: matchupPlayerToPosition.get(stat.matchupPlayerId),
      });

      if (teamId === team1Id) {
        team1Total += score;
      } else if (teamId === team2Id) {
        team2Total += score;
      }
    }

    await updateMatchupScore(db, matchupId, team1Total, team2Total);

    LOGGER.info(
      `Calculated football scores for matchup ${matchupId} (all-cached path)`,
      { team1Score: team1Total, team2Score: team2Total },
    );
  } catch (err) {
    // Same graceful-skip race handled for baseball in
    // computeAndPersistMatchupScores (LS-8427): the matchup can be deleted
    // concurrently between the existence check at the top of
    // selectGamesForMatchupFootball and this later write.
    if (
      err instanceof Error &&
      err.message === `Matchup ${matchupId} not found`
    ) {
      LOGGER.warn(
        `Football matchup ${matchupId} was deleted before scores could be persisted — skipping (LS-8427)`,
      );
      return;
    }

    LOGGER.error(
      `Failed to calculate football scores for matchup ${matchupId} (all-cached path)`,
      err instanceof Error ? err : new Error(String(err)),
      { matchupId },
    );
    throw err;
  }
}

/**
 * Select a random game_identifier for an offensive/kicking football player,
 * trying passing, then rushing, then receiving, then kicking — same fallback
 * order as selectAndAssignFootballGameIdentifiers in
 * lambdas/stats-lambda/src/game-state-manager.ts, since a player can appear
 * in any subset of those four tables for a given season.
 */
async function selectOffensiveGameIdentifier(
  db: PublicDb,
  playerId: number,
  season: number,
  excludeGameIdentifiers: string[],
): Promise<string | null> {
  const tables = [
    PublicSchema.gameFootballPassing,
    PublicSchema.gameFootballRushing,
    PublicSchema.gameFootballReceiving,
    PublicSchema.gameFootballKicking,
  ] as const;

  for (const table of tables) {
    const conditions = [eq(table.playerId, playerId), eq(table.season, season)];
    if (excludeGameIdentifiers.length > 0) {
      conditions.push(notInArray(table.gameIdentifier, excludeGameIdentifiers));
    }

    const availableGames = await db
      .select({ gameIdentifier: table.gameIdentifier })
      .from(table)
      .where(and(...conditions));

    if (availableGames.length > 0) {
      const randomIndex = cryptoRandomInt(availableGames.length);
      return availableGames[randomIndex].gameIdentifier;
    }
  }

  return null;
}

async function selectDstGameIdentifier(
  db: PublicDb,
  playerId: number,
  season: number,
  excludeGameIdentifiers: string[],
): Promise<string | null> {
  const conditions = [
    eq(PublicSchema.gameFootballDefense.playerId, playerId),
    eq(PublicSchema.gameFootballDefense.season, season),
  ];
  if (excludeGameIdentifiers.length > 0) {
    conditions.push(
      notInArray(
        PublicSchema.gameFootballDefense.gameIdentifier,
        excludeGameIdentifiers,
      ),
    );
  }

  const availableGames = await db
    .select({
      gameIdentifier: PublicSchema.gameFootballDefense.gameIdentifier,
    })
    .from(PublicSchema.gameFootballDefense)
    .where(and(...conditions));

  if (availableGames.length === 0) return null;
  return availableGames[cryptoRandomInt(availableGames.length)].gameIdentifier;
}

async function selectIdpGameIdentifier(
  db: PublicDb,
  playerId: number,
  season: number,
  excludeGameIdentifiers: string[],
): Promise<string | null> {
  const conditions = [
    eq(PublicSchema.gameFootballDefenseIdp.playerId, playerId),
    eq(PublicSchema.gameFootballDefenseIdp.season, season),
  ];
  if (excludeGameIdentifiers.length > 0) {
    conditions.push(
      notInArray(
        PublicSchema.gameFootballDefenseIdp.gameIdentifier,
        excludeGameIdentifiers,
      ),
    );
  }

  const availableGames = await db
    .select({
      gameIdentifier: PublicSchema.gameFootballDefenseIdp.gameIdentifier,
    })
    .from(PublicSchema.gameFootballDefenseIdp)
    .where(and(...conditions));

  if (availableGames.length === 0) return null;
  return availableGames[cryptoRandomInt(availableGames.length)].gameIdentifier;
}

async function selectGameIdentifierForPosition(
  db: PublicDb,
  playerId: number,
  season: number,
  isDst: boolean,
  position: string,
  excludeGameIdentifiers: string[],
): Promise<string | null> {
  if (isDst) {
    return selectDstGameIdentifier(
      db,
      playerId,
      season,
      excludeGameIdentifiers,
    );
  }
  if (IDP_POSITIONS.includes(position)) {
    return selectIdpGameIdentifier(
      db,
      playerId,
      season,
      excludeGameIdentifiers,
    );
  }
  return selectOffensiveGameIdentifier(
    db,
    playerId,
    season,
    excludeGameIdentifiers,
  );
}

/**
 * Check whether stats are already cached in the DB for this player/season,
 * per the same isDst/position routing selectGameIdentifierForPosition uses.
 */
async function hasCachedStats(
  db: PublicDb,
  playerId: number,
  season: number,
  isDst: boolean,
  position: string,
): Promise<boolean> {
  if (isDst) {
    const rows = await db
      .select({ playerId: PublicSchema.gameFootballDefense.playerId })
      .from(PublicSchema.gameFootballDefense)
      .where(
        and(
          eq(PublicSchema.gameFootballDefense.playerId, playerId),
          eq(PublicSchema.gameFootballDefense.season, season),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  if (IDP_POSITIONS.includes(position)) {
    const rows = await db
      .select({ playerId: PublicSchema.gameFootballDefenseIdp.playerId })
      .from(PublicSchema.gameFootballDefenseIdp)
      .where(
        and(
          eq(PublicSchema.gameFootballDefenseIdp.playerId, playerId),
          eq(PublicSchema.gameFootballDefenseIdp.season, season),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  const [passing, rushing, receiving, kicking] = await Promise.all([
    db
      .select({ playerId: PublicSchema.gameFootballPassing.playerId })
      .from(PublicSchema.gameFootballPassing)
      .where(
        and(
          eq(PublicSchema.gameFootballPassing.playerId, playerId),
          eq(PublicSchema.gameFootballPassing.season, season),
        ),
      )
      .limit(1),
    db
      .select({ playerId: PublicSchema.gameFootballRushing.playerId })
      .from(PublicSchema.gameFootballRushing)
      .where(
        and(
          eq(PublicSchema.gameFootballRushing.playerId, playerId),
          eq(PublicSchema.gameFootballRushing.season, season),
        ),
      )
      .limit(1),
    db
      .select({ playerId: PublicSchema.gameFootballReceiving.playerId })
      .from(PublicSchema.gameFootballReceiving)
      .where(
        and(
          eq(PublicSchema.gameFootballReceiving.playerId, playerId),
          eq(PublicSchema.gameFootballReceiving.season, season),
        ),
      )
      .limit(1),
    db
      .select({ playerId: PublicSchema.gameFootballKicking.playerId })
      .from(PublicSchema.gameFootballKicking)
      .where(
        and(
          eq(PublicSchema.gameFootballKicking.playerId, playerId),
          eq(PublicSchema.gameFootballKicking.season, season),
        ),
      )
      .limit(1),
  ]);

  return (
    passing.length > 0 ||
    rushing.length > 0 ||
    receiving.length > 0 ||
    kicking.length > 0
  );
}

/**
 * Select a game for a single football matchup player. Football analogue of
 * selectGamesForMatchupPlayer in season-game-selector.ts — same cached/
 * uncached branching and same recycle-from-full-pool fallback once the
 * unique-games pool for a season is exhausted (LS-3774's invariant: a cached
 * selection always carries a real game_identifier).
 */
export async function selectGamesForMatchupFootballPlayer(
  db: PublicDb,
  matchupPlayerId: number,
  playerId: number,
  season: number,
  isDst: boolean,
  position: string,
): Promise<FootballGameSelectionResult> {
  const cached = await hasCachedStats(db, playerId, season, isDst, position);

  if (!cached) {
    LOGGER.info(
      `No cached football stats for player ${playerId} season ${season}. Stats loading needed.`,
    );
    return { gameIdentifier: null, statsAreCached: false };
  }

  const usedGames = await db
    .select({ gameIdentifier: PublicSchema.matchupPlayerGames.gameIdentifier })
    .from(PublicSchema.matchupPlayerGames)
    .where(
      and(
        eq(PublicSchema.matchupPlayerGames.matchupPlayerId, matchupPlayerId),
        isNotNull(PublicSchema.matchupPlayerGames.gameIdentifier),
      ),
    );

  const excludeIds = usedGames
    .map((g) => g.gameIdentifier)
    .filter((id): id is string => id !== null);

  const gameIdentifier = await selectGameIdentifierForPosition(
    db,
    playerId,
    season,
    isDst,
    position,
    excludeIds,
  );

  if (!gameIdentifier) {
    LOGGER.warn(
      `No available football games left for player ${playerId} season ${season} (${excludeIds.length} already used); recycling from full pool`,
    );
    const recycled = await selectGameIdentifierForPosition(
      db,
      playerId,
      season,
      isDst,
      position,
      [],
    );
    if (!recycled) {
      LOGGER.warn(
        `Full pool also empty for football player ${playerId} season ${season}; falling back to stats load`,
      );
      return { gameIdentifier: null, statsAreCached: false };
    }
    return { gameIdentifier: recycled, statsAreCached: true };
  }

  return { gameIdentifier, statsAreCached: true };
}

/**
 * Select games for all players in a football matchup for a specific game
 * number. Football analogue of selectGamesForMatchup in
 * season-game-selector.ts. Unlike baseball, football has no SP/RP
 * probabilistic-start concept — every rostered player gets a game selected
 * (or queued for loading) every game number.
 */
export async function selectGamesForMatchupFootball(
  db: PublicDb,
  matchupId: number,
  gameNumber: number,
): Promise<{ playersNeedingStatsLoading: FootballPlayerNeedingStats[] }> {
  const matchup = await db
    .select()
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, matchupId))
    .then((rows) => rows[0]);

  if (!matchup) {
    LOGGER.warn(
      `Matchup ${matchupId} not found — skipping football game selection (matchup may have been deleted)`,
    );
    return { playersNeedingStatsLoading: [] };
  }

  // Same AC4 cap validation as the baseball path in season-game-selector.ts:
  // a football matchup can never exceed the 17-game regular-season cap.
  const gamesPerMatchup = matchup.gamesPerMatchup ?? 5;
  const sportMaxGames = GAMES_PER_MATCHUP_BY_SPORT.football.max;
  if (gamesPerMatchup > sportMaxGames) {
    throw new UserInputError(
      `gamesPerMatchup ${gamesPerMatchup} exceeds the football maximum of ${sportMaxGames} for matchup ${matchupId}`,
    );
  }

  await db
    .update(PublicSchema.matchups)
    .set({ statsLoadingStatus: 'loading' })
    .where(eq(PublicSchema.matchups.id, matchupId));

  const matchupPlayers = await db
    .select()
    .from(PublicSchema.matchupPlayers)
    .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

  const playerSeasons = await db
    .select({
      playerId: PublicSchema.leagueWeekPlayerSeasons.playerId,
      season: PublicSchema.leagueWeekPlayerSeasons.season,
    })
    .from(PublicSchema.leagueWeekPlayerSeasons)
    .where(
      and(
        eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, matchup.leagueId),
        eq(PublicSchema.leagueWeekPlayerSeasons.weekNumber, matchup.weekNumber),
      ),
    );
  const seasonMap = new Map(
    playerSeasons.map((ps) => [ps.playerId, ps.season]),
  );

  const allPlayerIds = matchupPlayers.map((mp) => mp.playerId);
  const playerRows =
    allPlayerIds.length > 0
      ? await db
          .select({
            id: PublicSchema.players.id,
            pfrId: PublicSchema.players.pfrId,
            isDst: PublicSchema.players.isDst,
            position: PublicSchema.players.position,
            nflTeam: PublicSchema.players.nflTeam,
          })
          .from(PublicSchema.players)
          .where(inArray(PublicSchema.players.id, allPlayerIds))
      : [];
  const playerInfoMap = new Map(playerRows.map((p) => [p.id, p]));

  const playersNeedingStatsLoading: FootballPlayerNeedingStats[] = [];

  for (const matchupPlayer of matchupPlayers) {
    try {
      const existingGames = await db
        .select()
        .from(PublicSchema.matchupPlayerGames)
        .where(
          and(
            eq(
              PublicSchema.matchupPlayerGames.matchupPlayerId,
              matchupPlayer.id,
            ),
            eq(PublicSchema.matchupPlayerGames.gameNum, gameNumber),
          ),
        );

      if (existingGames.length > 0) {
        continue;
      }

      const playerSeason = seasonMap.get(matchupPlayer.playerId);
      const playerInfo = playerInfoMap.get(matchupPlayer.playerId);

      if (!playerSeason || !playerInfo || !playerInfo.pfrId) {
        // Same graceful-degradation contract as baseball (LS-9534): a player
        // can legitimately have no season (waiver add, no eligible season)
        // or, for football specifically, no pfr_id crosswalk — skip rather
        // than failing the whole matchup.
        LOGGER.warn(
          `No season or pfr_id for football player ${matchupPlayer.playerId} in league ${matchup.leagueId}, week ${matchup.weekNumber} — skipping game selection`,
          { matchupId, matchupPlayerId: matchupPlayer.id },
        );
        continue;
      }

      const position = playerInfo.position ?? '';
      const result = await selectGamesForMatchupFootballPlayer(
        db,
        matchupPlayer.id,
        matchupPlayer.playerId,
        playerSeason,
        playerInfo.isDst,
        position,
      );

      await db.insert(PublicSchema.matchupPlayerGames).values({
        gameNum: gameNumber,
        matchupPlayerId: matchupPlayer.id,
        gameIdentifier: result.gameIdentifier,
        statsLoadingStatus: result.statsAreCached ? 'completed' : 'pending',
      });

      if (!result.statsAreCached) {
        playersNeedingStatsLoading.push({
          matchupPlayerId: matchupPlayer.id,
          playerId: matchupPlayer.playerId,
          pfrId: playerInfo.pfrId,
          season: playerSeason,
          isDst: playerInfo.isDst,
          position,
          nflTeam: playerInfo.nflTeam,
        });
      }
    } catch (err) {
      // Same FK-race handling as baseball's selectGamesForMatchup (LS-8244):
      // a matchup_player row can be concurrently deleted between the SELECT
      // and the INSERT (waiver/trade).
      const source =
        (err as { cause?: Record<string, unknown> }).cause ??
        (err as Record<string, unknown>);
      const pgCode =
        typeof source === 'object' &&
        source !== null &&
        typeof source.code === 'string'
          ? source.code
          : '';
      const pgConstraint =
        typeof source === 'object' && source !== null
          ? typeof source.constraint_name === 'string'
            ? source.constraint_name
            : typeof source.constraint === 'string'
              ? source.constraint
              : ''
          : '';

      if (
        pgCode === '23503' &&
        pgConstraint === 'matchup_player_games_matchup_player_fk'
      ) {
        LOGGER.warn(
          `Matchup player ${matchupPlayer.id} was deleted before football game selection insert — skipping (LS-8244)`,
        );
        continue;
      }

      throw err;
    }
  }

  if (playersNeedingStatsLoading.length === 0) {
    await computeAndPersistFootballMatchupScores(
      db,
      matchupId,
      matchup.leagueId,
      matchup.team1Id,
      matchup.team2Id,
    );

    await db
      .update(PublicSchema.matchups)
      .set({ statsLoadingStatus: 'completed' })
      .where(eq(PublicSchema.matchups.id, matchupId));
  }

  return { playersNeedingStatsLoading };
}
