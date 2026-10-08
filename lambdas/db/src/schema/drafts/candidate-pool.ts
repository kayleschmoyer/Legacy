/**
 * Draft domain — candidate pool pre-computation for auto-pick.
 *
 * Extracts Phase 1 logic from scheduled-mutations: deadline pre-check,
 * draft status validation, undrafted candidate query, eligibility filtering,
 * stats + positions pre-computation, and bench versatility scoring.
 *
 * All queries run outside the row lock to reduce contention during live drafts.
 */

import {
  filterPlayerIdsByLeagueEligibility,
  type PublicDb,
  PublicSchema,
} from '@legacy-sports/db-client';
import { ALLOWED_POSITIONS_BY_SPORT } from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import { inArray, sql } from 'drizzle-orm';

import { type DraftRules, loadDraftRules } from './draft-rules';

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
  /**
   * The draft's rules — pool, sport and roster slot list, for a league draft
   * and a league-less mock draft alike (LS-10074, LS-10076).
   */
  rules: DraftRules;
}

/** League settings needed for candidate pool queries. */
interface LeagueSettings {
  gamesPerMatchup: number;
  pitcherStartsPerMatchup: number;
}

/** Sport discriminator used to branch every football-aware query below. */
type CandidatePoolSport = 'baseball' | 'football';

function isCandidatePoolSport(sport: string): sport is CandidatePoolSport {
  return sport === 'baseball' || sport === 'football';
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
): Promise<CandidatePool | null> {
  // Fast bail-out: check deadline without acquiring any lock
  const preCheckRows = await db.execute(
    sql`SELECT id, league_id, status, current_pick, current_pick_deadline FROM drafts WHERE id = ${draftId}`,
  );
  const preCheckDraft = preCheckRows.rows[0] as
    | {
        id: number;
        league_id: number | null;
        status: string;
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

  // Draft status check outside transaction — fail fast without holding the row
  // lock. Reads drafts.status rather than leagues.draft_status (LS-10074); the
  // two are dual-written by every league-draft transition.
  if (preCheckDraft.status !== 'in-progress') {
    LOGGER.info(
      `[autoProcessDraftPicks] Draft ${draftId} is not in-progress, skipping`,
    );
    return null;
  }

  // Rules rather than the league row (LS-10076): a mock draft has no league.
  const rules = await loadDraftRules(db, draftId);

  // Guard the sport discriminator once, up front — every downstream query
  // below narrows on `sport === 'football'` and silently falls back to the
  // baseball branch for anything else, which would fetch the wrong candidate
  // pool rather than fail loudly (LS-9040 review).
  const rawSport: string = rules.sport;
  if (!isCandidatePoolSport(rawSport)) {
    throw new Error(
      `Draft ${draftId} has an unexpected sport value: ${rawSport}`,
    );
  }

  const settings: LeagueSettings = {
    gamesPerMatchup: rules.gamesPerMatchup ?? 5,
    pitcherStartsPerMatchup: rules.pitcherStartsPerMatchup ?? 1,
  };

  // 1. Fetch the top 1000 undrafted candidates pre-sorted by projected FPG
  const eligibleIds = await fetchUndraftedCandidates(
    db,
    draftId,
    rules,
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
    rules.sport,
    rules.leagueId,
  );

  // 3. Pre-compute bench versatility
  const bestBenchPick = await computeBestBenchPick(
    db,
    rules.rosterPositions,
    eligibleIds,
    playerDraftInfo,
    rules.sport,
  );

  return {
    eligibleIds,
    playerDraftInfo,
    rankedEligibleIds,
    bestBenchPick,
    rules,
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
  rules: DraftRules,
  settings: LeagueSettings,
): Promise<number[]> {
  const { gamesPerMatchup, pitcherStartsPerMatchup } = settings;
  const leagueId = rules.leagueId;
  // Exclude players already rostered in the league (LS-8674: keeper
  // designations are applied to rosters before the draft's first pick, so
  // kept players must not appear in the draftable pool). A no-op for redraft
  // leagues, whose rosters are empty at draft time, and skipped entirely for
  // a mock draft, which has no league (LS-10076).
  const notRostered =
    leagueId === null
      ? sql``
      : sql`AND NOT EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.league_id = ${leagueId} AND tm.player_id = p.id
        )`;

  // Football ranks by projected FPG from football_player_scoring_cache
  // (LS-9484), falling back to the projections/ADP pipeline's
  // `players.projected_fantasy_points` for any player not yet cached.
  // Baseball ranks by projected FPG from player_scoring_cache
  // (default/NULL league row). The cache stores per-game scoring components
  // (batting_ppg/pitching_ppg/fielding_ppg) precomputed from the default
  // scoring profile and refreshed by stats-lambda after each career stat
  // update, so this avoids the 11-term CASE-WHEN over career_batting /
  // career_pitching / career_fielding at query time (LS-4689).
  const undraftedRows =
    rules.sport === 'football'
      ? await db.execute(
          sql`SELECT p.id,
        COALESCE(cs_league.avg_ppg, cs_default.avg_ppg, p.projected_fantasy_points::numeric, 0) AS fpg
      FROM players p
      LEFT JOIN public.football_player_scoring_cache cs_league
        ON cs_league.player_id = p.id AND cs_league.league_id = ${leagueId}
      LEFT JOIN public.football_player_scoring_cache cs_default
        ON cs_default.player_id = p.id AND cs_default.league_id IS NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM draft_picks dp
        WHERE dp.draft_id = ${draftId} AND dp.player_id = p.id
      )
      ${notRostered}
      AND p.sport = ${rules.sport}
      ORDER BY fpg DESC
      LIMIT 1000`,
        )
      : await db.execute(
          sql`SELECT p.id,
        (
          COALESCE(cs.batting_ppg, 0)  * ${gamesPerMatchup} +
          COALESCE(cs.pitching_ppg, 0) * ${pitcherStartsPerMatchup} +
          COALESCE(cs.fielding_ppg, 0) * ${gamesPerMatchup}
        ) AS fpg
      FROM players p
      LEFT JOIN public.player_scoring_cache cs
        ON cs.player_id = p.id AND cs.league_id IS NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM draft_picks dp
        WHERE dp.draft_id = ${draftId} AND dp.player_id = p.id
      )
      ${notRostered}
      AND p.sport = ${rules.sport}
      ORDER BY fpg DESC
      LIMIT 1000`,
        );
  const undraftedIds = undraftedRows.rows.map((r) => r.id as number);

  // Apply eligibility filters (playerPool, minCareerGames, etc.)
  const eligibilityResult = await filterPlayerIdsByLeagueEligibility(
    db,
    undraftedIds,
    {
      playerPool: rules.playerPool,
      minCareerGames: rules.minCareerGames ?? 0,
      minCareerSeasons: rules.minCareerSeasons ?? 0,
      minCareerPitcherGames: rules.minCareerPitcherGames ?? 0,
      minCareerPitcherSeasons: rules.minCareerPitcherSeasons ?? 0,
      baseballHofOnly: rules.baseballHofOnly ?? false,
      baseballEraFilter: rules.baseballEraFilter ?? 'all',
      customEraStartYear: rules.customEraStartYear ?? null,
      customEraEndYear: rules.customEraEndYear ?? null,
      sport: rules.sport,
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
  sport: 'baseball' | 'football',
  /** `null` for a mock draft: only the default scoring cache applies. */
  leagueId: number | null,
): Promise<{
  playerDraftInfo: Map<number, PlayerDraftInfo>;
  rankedEligibleIds: number[];
}> {
  const { gamesPerMatchup, pitcherStartsPerMatchup } = settings;

  // Projected FPG — football reads football_player_scoring_cache (LS-9484:
  // league-specific override falling back to default scoring, mirroring
  // baseball's player_scoring_cache pattern below), falling back further to
  // the projections/ADP pipeline's `players.projected_fantasy_points` for any
  // player the cache hasn't computed yet. baseball reads player_scoring_cache
  // as before.
  const statsRows =
    sport === 'football'
      ? await db.execute(
          sql`SELECT p.id AS player_id,
      COALESCE(cs_league.avg_ppg, cs_default.avg_ppg, p.projected_fantasy_points::numeric, 0) AS projected_fpg
    FROM players p
    LEFT JOIN public.football_player_scoring_cache cs_league
      ON cs_league.player_id = p.id AND cs_league.league_id = ${leagueId}
    LEFT JOIN public.football_player_scoring_cache cs_default
      ON cs_default.player_id = p.id AND cs_default.league_id IS NULL
    WHERE p.id = ANY(${sql.param(eligibleIds)}::integer[])
    ORDER BY projected_fpg DESC
    LIMIT 1000`,
        )
      : await db.execute(
          sql`SELECT
      p.id AS player_id,
      (
        COALESCE(cs.batting_ppg, 0)  * ${gamesPerMatchup} +
        COALESCE(cs.pitching_ppg, 0) * ${pitcherStartsPerMatchup} +
        COALESCE(cs.fielding_ppg, 0) * ${gamesPerMatchup}
      ) AS projected_fpg
    FROM players p
    LEFT JOIN public.player_scoring_cache cs
      ON cs.player_id = p.id AND cs.league_id IS NULL
    WHERE p.id = ANY(${sql.param(eligibleIds)}::integer[])
    ORDER BY projected_fpg DESC
    LIMIT 1000`,
        );

  // Position eligibility — football reads the football_player_eligible_positions
  // view (LS-9040); baseball reads the player_eligible_positions mat view.
  const positionRows =
    sport === 'football'
      ? await db
          .select({
            playerId: PublicSchema.footballPlayerEligiblePositions.playerId,
            position: PublicSchema.footballPlayerEligiblePositions.position,
          })
          .from(PublicSchema.footballPlayerEligiblePositions)
          .where(
            inArray(
              PublicSchema.footballPlayerEligiblePositions.playerId,
              eligibleIds,
            ),
          )
      : await db
          .select({
            playerId: PublicSchema.playerEligiblePositions.playerId,
            position: PublicSchema.playerEligiblePositions.position,
          })
          .from(PublicSchema.playerEligiblePositions)
          .where(
            inArray(PublicSchema.playerEligiblePositions.playerId, eligibleIds),
          );

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
  rosterPositions: DraftRules['rosterPositions'],
  eligibleIds: number[],
  playerDraftInfo: Map<number, PlayerDraftInfo>,
  sport: 'baseball' | 'football',
): Promise<BestBenchPick | undefined> {
  // Step 1: total roster slots for this draft, off DraftRules rather than
  // league_positions (LS-10076): a mock draft's slots are the sport defaults.
  const benchTotalSlots = rosterPositions.length;

  // Step 2: slots_coverable per eligible player.
  //
  // Baseball: the slot/stat-position mapping lives in
  // `public.position_slot_mapping` (seeded by migration) so the planner has
  // statistics for join ordering — see LS-4694.
  //
  // Football: `position_slot_mapping` has never been seeded with football
  // rows (its own migration's comment defers that to "a later football
  // ticket" that never landed), so the SQL join below returns nothing for
  // football regardless of position data — the exact LS-9474 bug class
  // (baseball-only relation queried unconditionally), just one table over.
  // Rather than add a second migration to seed a table whose whole reason
  // to exist is query-planner statistics for a 31-row baseball constant,
  // football computes slots_coverable in memory from data it already has:
  // `playerDraftInfo`'s `.positions` (from football_player_eligible_positions,
  // LS-9040) intersected against `ALLOWED_POSITIONS_BY_SPORT.football`
  // (LS-9475 — already carries every currently-configurable slot type,
  // DST and IDP alike) per league_positions row (LS-9483).
  const slotsCoverableMap = new Map<number, number>();
  if (sport === 'football') {
    const allowedPositions = ALLOWED_POSITIONS_BY_SPORT.football;
    for (const [id, info] of playerDraftInfo) {
      let slotsCoverable = 0;
      for (const slotType of rosterPositions) {
        const eligibleStatPositions = allowedPositions[slotType] ?? [];
        if (eligibleStatPositions.some((pos) => info.positions.includes(pos))) {
          slotsCoverable += 1;
        }
      }
      slotsCoverableMap.set(id, slotsCoverable);
    }
  } else {
    const benchVersatilityRows = await db.execute(
      sql`WITH eligible_players AS (
        SELECT player_id, position
        FROM player_eligible_positions
        WHERE player_id = ANY(${sql.param(eligibleIds)}::integer[])
      )
      SELECT
        ep.player_id,
        COUNT(DISTINCT lp.id)::int AS slots_coverable
      FROM unnest(${sql.param(rosterPositions)}::text[])
        WITH ORDINALITY AS lp(position_type, id)
      JOIN position_slot_mapping pm ON pm.slot_type = lp.position_type
      JOIN eligible_players ep ON ep.position = pm.stat_pos
      GROUP BY ep.player_id`,
    );
    for (const row of benchVersatilityRows.rows) {
      slotsCoverableMap.set(
        row.player_id as number,
        Number(row.slots_coverable),
      );
    }
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
