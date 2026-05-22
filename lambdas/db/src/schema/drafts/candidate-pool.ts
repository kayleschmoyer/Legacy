/**
 * Draft domain — candidate pool pre-computation for auto-pick.
 *
 * Extracts Phase 1 logic from scheduled-mutations: deadline pre-check,
 * league status validation, undrafted candidate query, eligibility filtering,
 * stats + positions pre-computation, and bench versatility scoring.
 *
 * All queries run outside the row lock to reduce contention during live drafts.
 */

import {
  filterPlayerIdsByLeagueEligibility,
  type PublicDb,
  PublicSchema,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { eq, inArray, sql } from 'drizzle-orm';

// ── Types ────────────────────────────────────────────────────────────────────

/** Per-player draft info used by scoring and bench-pick logic. */
export interface PlayerDraftInfo {
  fpg: number;
  positions: string[];
}

/** Pre-computed bench pick candidate with versatility score. */
export interface BestBenchPick {
  playerId: number;
  fpg: number;
  slotsCoverable: number;
  totalSlots: number;
}

/** Result of fetchCandidatePool — everything the transaction needs for scoring. */
export interface CandidatePool {
  /** Eligible player IDs in descending FPG order. */
  eligibleIds: number[];
  /** Per-player stats + positions map. */
  playerDraftInfo: Map<number, PlayerDraftInfo>;
  /** Ranked eligible IDs in descending projected FPG (from stats query). */
  rankedEligibleIds: number[];
  /** Best bench candidate (versatility + matchup pts). */
  bestBenchPick: BestBenchPick | undefined;
  /** League settings snapshot (needed for position mapping in scorer). */
  league: typeof PublicSchema.leagues.$inferSelect;
}

/** League settings needed for candidate pool queries. */
interface LeagueSettings {
  gamesPerMatchup: number;
  spStartsPerMatchup: number;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Fetch and score the candidate pool for a single auto-pick iteration.
 *
 * Returns `null` if the draft deadline is not expired or the league is not
 * in-progress. Throws if no eligible players remain (player pool exhaustion
 * is an error during auto-pick). All queries run outside the row lock
 * (Phase 1 pre-computation).
 */
export async function fetchCandidatePool(
  db: PublicDb,
  draftId: number,
  draftLeagueId: number,
): Promise<CandidatePool | null> {
  // Fast bail-out: check deadline without acquiring any lock
  const preCheckRows = await db.execute(
    sql`SELECT id, league_id, current_pick, current_pick_deadline FROM drafts WHERE id = ${draftId}`,
  );
  const preCheckDraft = preCheckRows.rows[0] as
    | {
        id: number;
        league_id: number;
        current_pick: number;
        current_pick_deadline: Date | null;
      }
    | undefined;

  if (!preCheckDraft) {
    LOGGER.warn(
      `[autoProcessDraftPicks] Draft ${draftId} not found in pre-check`,
    );
    return null;
  }

  const preCheckNow = new Date();
  if (
    !preCheckDraft.current_pick_deadline ||
    new Date(preCheckDraft.current_pick_deadline) > preCheckNow
  ) {
    LOGGER.info(
      `[autoProcessDraftPicks] Draft ${draftId} deadline not expired in pre-check — stopping loop`,
    );
    return null;
  }

  // League status check outside transaction — fail fast without holding the row lock
  const [league] = await db
    .select()
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, draftLeagueId))
    .limit(1);

  if (!league || league.draftStatus !== 'in-progress') {
    LOGGER.info(
      `[autoProcessDraftPicks] League ${draftLeagueId} is not in-progress, skipping draft ${draftId}`,
    );
    return null;
  }

  const settings: LeagueSettings = {
    gamesPerMatchup: league.gamesPerMatchup ?? 5,
    spStartsPerMatchup: league.spStartsPerMatchup ?? 1,
  };

  // 1. Fetch the top 1000 undrafted candidates pre-sorted by projected FPG
  const eligibleIds = await fetchUndraftedCandidates(
    db,
    draftId,
    league,
    settings,
  );
  if (eligibleIds.length === 0) {
    throw new Error(`No available players for draft ${draftId}`);
  }

  // 2. Pre-compute per-player stats and positions
  const { playerDraftInfo, rankedEligibleIds } = await computePlayerDraftInfo(
    db,
    eligibleIds,
    settings,
  );

  // 3. Pre-compute bench versatility
  const bestBenchPick = await computeBestBenchPick(
    db,
    draftLeagueId,
    eligibleIds,
    playerDraftInfo,
  );

  return {
    eligibleIds,
    playerDraftInfo,
    rankedEligibleIds,
    bestBenchPick,
    league,
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Fetch undrafted candidates, apply eligibility filters, return IDs in FPG
 * descending order. Limited to top 1000 to keep downstream queries fast.
 */
async function fetchUndraftedCandidates(
  db: PublicDb,
  draftId: number,
  league: typeof PublicSchema.leagues.$inferSelect,
  settings: LeagueSettings,
): Promise<number[]> {
  const { gamesPerMatchup, spStartsPerMatchup } = settings;

  // Rank undrafted candidates by projected FPG from player_scoring_cache
  // (default/NULL league row). The cache stores per-game scoring components
  // (batting_ppg/pitching_ppg/fielding_ppg) precomputed from the default
  // scoring profile and refreshed by stats-lambda after each career stat
  // update, so this avoids the 11-term CASE-WHEN over career_batting /
  // career_pitching / career_fielding at query time (LS-4689).
  const undraftedRows = await db.execute(
    sql`SELECT p.id,
        (
          COALESCE(cs.batting_ppg, 0)  * ${gamesPerMatchup} +
          COALESCE(cs.pitching_ppg, 0) * ${spStartsPerMatchup} +
          COALESCE(cs.fielding_ppg, 0) * ${gamesPerMatchup}
        ) AS fpg
      FROM players p
      LEFT JOIN public.player_scoring_cache cs
        ON cs.player_id = p.id AND cs.league_id IS NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM draft_picks dp
        WHERE dp.draft_id = ${draftId} AND dp.player_id = p.id
      )
      ORDER BY fpg DESC
      LIMIT 1000`,
  );
  const undraftedIds = undraftedRows.rows.map((r) => r.id as number);

  // Apply eligibility filters (playerPool, minCareerGames, etc.)
  const eligibilityResult = await filterPlayerIdsByLeagueEligibility(
    db,
    undraftedIds,
    {
      playerPool: league.playerPool,
      minCareerGames: league.minCareerGames ?? 0,
      minCareerSeasons: league.minCareerSeasons ?? 0,
      hofOnly: league.hofOnly ?? false,
      eraFilter: league.eraFilter ?? 'all',
      customEraStartYear: league.customEraStartYear ?? null,
      customEraEndYear: league.customEraEndYear ?? null,
    },
  );

  // Filter preserves FPG-descending order from undraftedIds
  return undraftedIds.filter((id) => eligibilityResult.eligibleIds.has(id));
}

/**
 * Pre-compute per-player stats (projected FPG) and position eligibility
 * for all candidates. Returns the info map and a ranked ID list.
 */
async function computePlayerDraftInfo(
  db: PublicDb,
  eligibleIds: number[],
  settings: LeagueSettings,
): Promise<{
  playerDraftInfo: Map<number, PlayerDraftInfo>;
  rankedEligibleIds: number[];
}> {
  const { gamesPerMatchup, spStartsPerMatchup } = settings;

  // Projected FPG from player_scoring_cache
  const statsRows = await db.execute(
    sql`SELECT
      p.id AS player_id,
      (
        COALESCE(cs.batting_ppg, 0)  * ${gamesPerMatchup} +
        COALESCE(cs.pitching_ppg, 0) * ${spStartsPerMatchup} +
        COALESCE(cs.fielding_ppg, 0) * ${gamesPerMatchup}
      ) AS projected_fpg
    FROM players p
    LEFT JOIN public.player_scoring_cache cs
      ON cs.player_id = p.id AND cs.league_id IS NULL
    WHERE p.id = ANY(${sql.param(eligibleIds)}::integer[])
    ORDER BY projected_fpg DESC
    LIMIT 1000`,
  );

  // Position eligibility from the mat view
  const positionRows = await db
    .select({
      playerId: PublicSchema.playerEligiblePositions.playerId,
      position: PublicSchema.playerEligiblePositions.position,
    })
    .from(PublicSchema.playerEligiblePositions)
    .where(inArray(PublicSchema.playerEligiblePositions.playerId, eligibleIds));

  const eligiblePositionsByPlayer = new Map<number, string[]>();
  for (const row of positionRows) {
    const positions = eligiblePositionsByPlayer.get(row.playerId) ?? [];
    positions.push(row.position);
    eligiblePositionsByPlayer.set(row.playerId, positions);
  }

  // Build player info map and ranked list
  const playerDraftInfo = new Map<number, PlayerDraftInfo>();
  const rankedEligibleIds: number[] = [];

  for (const row of statsRows.rows) {
    const playerId = row.player_id as number;
    playerDraftInfo.set(playerId, {
      fpg: Number(row.projected_fpg) || 0,
      positions: eligiblePositionsByPlayer.get(playerId) ?? [],
    });
    rankedEligibleIds.push(playerId);
  }

  // Append any eligibleIds not in statsRows (no career stats — final fallback)
  for (const id of eligibleIds) {
    if (!playerDraftInfo.has(id)) {
      rankedEligibleIds.push(id);
      playerDraftInfo.set(id, { fpg: 0, positions: [] });
    }
  }

  return { playerDraftInfo, rankedEligibleIds };
}

/**
 * Pre-compute the best bench pick using slot-coverage versatility scoring.
 * Two focused queries avoid the correlated subquery that caused per-row overhead.
 */
async function computeBestBenchPick(
  db: PublicDb,
  draftLeagueId: number,
  eligibleIds: number[],
  playerDraftInfo: Map<number, PlayerDraftInfo>,
): Promise<BestBenchPick | undefined> {
  // Step 1: total roster slots for this league (scalar)
  const totalSlotsResult = await db.execute(
    sql`SELECT COUNT(*)::int AS total_slots
        FROM league_positions
        WHERE league_id = ${draftLeagueId}`,
  );
  const benchTotalSlots = Number(totalSlotsResult.rows[0]?.total_slots ?? 0);

  // Step 2: slots_coverable per eligible player
  const benchVersatilityRows = await db.execute(
    sql`WITH position_mapping(slot_type, stat_pos) AS (
      VALUES
        ('1B'::text, '1B'::text),
        ('2B', '2B'), ('3B', '3B'), ('C', 'C'),
        ('CF', 'CF'), ('LF', 'LF'), ('RF', 'RF'), ('SS', 'SS'),
        ('SP', 'SP'), ('SP', 'P'), ('RP', 'RP'), ('RP', 'P'),
        ('OF', 'LF'), ('OF', 'RF'), ('OF', 'CF'), ('OF', 'OF'),
        ('IF', '1B'), ('IF', '2B'), ('IF', '3B'), ('IF', 'SS'),
        ('DH', '1B'), ('DH', '2B'), ('DH', '3B'), ('DH', 'SS'),
        ('DH', 'LF'), ('DH', 'RF'), ('DH', 'CF'), ('DH', 'OF'), ('DH', 'C'), ('DH', 'DH'),
        ('XDH', 'DH')
    ),
    eligible_players AS (
      SELECT player_id, position
      FROM player_eligible_positions
      WHERE player_id = ANY(${sql.param(eligibleIds)}::integer[])
    )
    SELECT
      ep.player_id,
      COUNT(DISTINCT lp.id)::int AS slots_coverable
    FROM league_positions lp
    JOIN position_mapping pm ON pm.slot_type = lp.position_type::text
    JOIN eligible_players ep ON ep.position = pm.stat_pos
    WHERE lp.league_id = ${draftLeagueId}
    GROUP BY ep.player_id`,
  );

  // Combine DB-computed slot counts with in-memory FPG to rank bench picks
  const slotsCoverableMap = new Map<number, number>();
  for (const row of benchVersatilityRows.rows) {
    slotsCoverableMap.set(row.player_id as number, Number(row.slots_coverable));
  }

  let bestBenchPick: BestBenchPick | undefined;
  let bestBenchScore = -Infinity;
  for (const [id, info] of playerDraftInfo) {
    const slotsCoverable = slotsCoverableMap.get(id) ?? 0;
    const benchScore = info.fpg * (1 + 0.15 * slotsCoverable);
    if (benchScore > bestBenchScore) {
      bestBenchScore = benchScore;
      bestBenchPick = {
        playerId: id,
        fpg: info.fpg,
        slotsCoverable,
        totalSlots: benchTotalSlots,
      };
    }
  }

  return bestBenchPick;
}
