import type {
  CareerStats,
  FootballSeasonKicking,
  FootballSeasonPassing,
  FootballSeasonReceiving,
  FootballSeasonRushing,
} from '@legacy-sports/pfr-client';
import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { sql } from 'drizzle-orm';
import {
  buildCombinedDefenseIdpRow,
  buildCombinedKickingRow,
  buildCombinedPassingRow,
  buildCombinedReceivingRow,
  buildCombinedRushingRow,
  computePasserRatingFromTotals,
  FootballStatCategory,
  multiTeamLabel,
  MultiTeamRepair,
  NflverseRow,
  SeasonAggregate,
} from './backfill-nflverse-multiteam-seasons';
import {
  aggregateKickingSeasons,
  aggregatePassingSeasons,
  aggregateReceivingSeasons,
  aggregateRushingSeasons,
  IDP_POSITIONS,
} from './load-football-career-stats';

/**
 * Derives `football_season_*` and `career_football_*` rows from per-game data
 * for football players that have no season rows at all (LS-10586, slice 2 of
 * LS-9971). Before this, those rows only ever came from PFR page scrapes
 * (`loadFootballCareerStats`), which are no longer possible (LS-9908), so
 * players seeded from nflverse's players.csv (LS-10585) would never reach the
 * draft board.
 *
 * Two sources, split at the 1998/1999 boundary (ADR 0022):
 * - 1999+: nflverse weekly stats, folded with the LS-9919 aggregation
 *   (`aggregateNflverseSeasonStats` + the `buildCombined*Row` builders).
 * - 1960-1998: the PFA per-game corpus, read by the caller through
 *   `@legacy-sports/football-game-stats-provider`'s `PfaCareerStats` and
 *   passed in as a `CareerStats.GameLog`.
 *
 * `pfr_row_id` marks the source (`nflverse-<season>` / `pfa-<season>`), so a
 * derived row is always distinguishable from a PFR-scraped one.
 *
 * Pure apart from {@link loadDerivationCandidates} and
 * {@link applyDerivedPlayerStats}; the CLI (`derive-football-season-stats`)
 * owns fetching.
 */

// ---------------------------------------------------------------------------
// Team codes
// ---------------------------------------------------------------------------

/**
 * nflverse labels every season with the franchise's current code (the Rams
 * are `LA` in 1999, the Raiders `LV` in 2005), while PFR-sourced season rows
 * carry PFR's own code for that era (`STL`, `OAK`, `SDG`, `GNB`, `NWE`, ...).
 * Derived rows use PFR's codes so a team column reads the same whichever
 * source wrote it — and so the `PFR_TEAM_MAP` in `queuePlayers.ts` and the
 * LS-9477 `nfl_team` backfill mapping keep working on them.
 */
const NFLVERSE_TO_PFR_TEAM: Record<string, string> = {
  GB: 'GNB',
  KC: 'KAN',
  NE: 'NWE',
  NO: 'NOR',
  SF: 'SFO',
  TB: 'TAM',
};

export function nflverseTeamToPfr(team: string, season: number): string {
  switch (team) {
    case 'LA':
    case 'LAR':
    case 'STL':
      return season <= 2015 ? 'STL' : 'LAR';
    case 'LV':
    case 'OAK':
      return season <= 2019 ? 'OAK' : 'LVR';
    case 'LAC':
    case 'SD':
      return season <= 2016 ? 'SDG' : 'LAC';
    default:
      return NFLVERSE_TO_PFR_TEAM[team] ?? team;
  }
}

/**
 * Team label for a PFA-derived row. PFA's per-game payload carries no team
 * (the box score is keyed by game, not by the player's side), and guessing
 * one from `players.nfl_team` would be wrong for anyone who changed teams.
 * An empty label reads as "unknown" rather than as a fabricated code.
 */
export const PFA_UNKNOWN_TEAM = '';

// ---------------------------------------------------------------------------
// Derived row shapes
// ---------------------------------------------------------------------------

/** The kicking season table carries distance buckets and `lng`, which the
 * pfr-client domain type does not. */
export type DerivedKickingRow = FootballSeasonKicking & {
  fg019m: number | null;
  fg019a: number | null;
  fg2029m: number | null;
  fg2029a: number | null;
  fg3039m: number | null;
  fg3039a: number | null;
  fg4049m: number | null;
  fg4049a: number | null;
  fg50m: number | null;
  fg50a: number | null;
  lng: number | null;
};

export type DerivedDefenseIdpRow = ReturnType<
  typeof buildCombinedDefenseIdpRow
>;

export interface DerivedSeasonRows {
  passing: FootballSeasonPassing[];
  rushing: FootballSeasonRushing[];
  receiving: FootballSeasonReceiving[];
  kicking: DerivedKickingRow[];
  defenseIdp: DerivedDefenseIdpRow[];
}

export function emptyDerivedSeasonRows(): DerivedSeasonRows {
  return {
    passing: [],
    rushing: [],
    receiving: [],
    kicking: [],
    defenseIdp: [],
  };
}

export function mergeDerivedSeasonRows(
  ...parts: DerivedSeasonRows[]
): DerivedSeasonRows {
  const out = emptyDerivedSeasonRows();
  for (const p of parts) {
    out.passing.push(...p.passing);
    out.rushing.push(...p.rushing);
    out.receiving.push(...p.receiving);
    out.kicking.push(...p.kicking);
    out.defenseIdp.push(...p.defenseIdp);
  }
  return out;
}

export function countDerivedSeasonRows(rows: DerivedSeasonRows): number {
  return (
    rows.passing.length +
    rows.rushing.length +
    rows.receiving.length +
    rows.kicking.length +
    rows.defenseIdp.length
  );
}

// ---------------------------------------------------------------------------
// 1999+: nflverse weekly aggregates -> season rows
// ---------------------------------------------------------------------------

/** One player's nflverse season aggregates, per category. */
export type NflversePlayerAggregates = Partial<
  Record<FootballStatCategory, Map<number, SeasonAggregate> | undefined>
>;

function seasonTeam(agg: SeasonAggregate, season: number): string {
  return agg.teams.length === 1
    ? nflverseTeamToPfr(agg.teams[0], season)
    : multiTeamLabel(agg.teams.length);
}

/**
 * Builds one season row per (category, season) from a player's nflverse
 * aggregates, reusing the LS-9919 row builders. Those builders always label
 * the row `<n>TM` (they only ever handle multi-team seasons); here a
 * single-team season gets that team's PFR code instead.
 */
export function buildNflverseSeasonRows(
  playerId: number,
  pfrId: string,
  aggs: NflversePlayerAggregates,
): DerivedSeasonRows {
  const out = emptyDerivedSeasonRows();
  const each = (
    category: FootballStatCategory,
    fn: (input: MultiTeamRepair, team: string) => void,
  ) => {
    for (const [season, agg] of aggs[category] ?? []) {
      fn(
        {
          playerId,
          pfrId,
          season,
          previousTeam: '',
          nflverseTeams: agg.teams,
          agg,
        },
        seasonTeam(agg, season),
      );
    }
  };

  each('passing', (r, team) =>
    out.passing.push({ ...buildCombinedPassingRow(r), team }),
  );
  each('rushing', (r, team) =>
    out.rushing.push({ ...buildCombinedRushingRow(r), team }),
  );
  each('receiving', (r, team) =>
    out.receiving.push({ ...buildCombinedReceivingRow(r), team }),
  );
  each('kicking', (r, team) =>
    out.kicking.push({
      ...buildCombinedKickingRow(r),
      team,
      fg019m: null,
      fg019a: null,
      fg2029m: null,
      fg2029a: null,
      fg3039m: null,
      fg3039a: null,
      fg4049m: null,
      fg4049a: null,
      fg50m: null,
      fg50a: null,
      lng: r.agg.maxes.fg_long ?? null,
    }),
  );
  each('defense_idp', (r, team) =>
    out.defenseIdp.push({ ...buildCombinedDefenseIdpRow(r), team }),
  );

  for (const rows of Object.values(out) as { season: number }[][]) {
    rows.sort((a, b) => a.season - b.season);
  }
  return out;
}

/** pfr_id -> nflverse `rookie_season`, from players.csv. */
export function buildPfrRookieSeasonMap(
  playersCsvRows: NflverseRow[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of playersCsvRows) {
    const pfrId = row.pfr_id?.trim();
    const rookie = Number(row.rookie_season);
    if (pfrId && row.rookie_season && Number.isInteger(rookie)) {
      map.set(pfrId, rookie);
    }
  }
  return map;
}

/**
 * Whether a player could have 1960-1998 games worth probing the PFA corpus
 * for. nflverse clamps `rookie_season` to a 1974 floor, so it is only a safe
 * upper bound: a rookie season of 1999+ rules PFA out, anything earlier (or a
 * player nflverse does not list at all) has to be probed.
 */
export function mayHavePfaSeasons(rookieSeason: number | undefined): boolean {
  return rookieSeason === undefined || rookieSeason < 1999;
}

// ---------------------------------------------------------------------------
// 1960-1998: PFA per-game log -> season rows
// ---------------------------------------------------------------------------

// Null-preserving sum: a column every game left null stays null (unknown),
// never 0. That is what keeps PFA fumbles NULL (LS-9948).
function sumField<T>(
  rows: T[],
  pick: (row: T) => number | null,
): number | null {
  let total: number | null = null;
  for (const row of rows) {
    const v = pick(row);
    if (v !== null && v !== undefined) total = (total ?? 0) + v;
  }
  return total;
}

function maxField<T>(
  rows: T[],
  pick: (row: T) => number | null,
): number | null {
  let best: number | null = null;
  for (const row of rows) {
    const v = pick(row);
    if (v !== null && v !== undefined)
      best = best === null ? v : Math.max(best, v);
  }
  return best;
}

// The corpus stages a row only for games with a stat line in that category,
// so the distinct games are the category's games played.
function gamesPlayed(rows: { gameIdentifier: string }[]): number {
  return new Set(rows.map((r) => r.gameIdentifier)).size;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Folds one PFA player-season game log into season rows, one per category
 * with any games. Fields PFA does not carry (`gs`, first downs, targets,
 * fumbles, ...) stay null.
 */
export function buildPfaSeasonRows(
  playerId: number,
  season: number,
  log: CareerStats.GameLog,
): DerivedSeasonRows {
  const out = emptyDerivedSeasonRows();
  const base = {
    playerId,
    season,
    team: PFA_UNKNOWN_TEAM,
    pfrRowId: `pfa-${season}`,
  };

  if (log.passing.length > 0) {
    const rows = log.passing;
    const cmp = sumField(rows, (r) => r.cmp);
    const att = sumField(rows, (r) => r.att);
    const yds = sumField(rows, (r) => r.yds);
    const td = sumField(rows, (r) => r.td);
    const int = sumField(rows, (r) => r.int);
    out.passing.push({
      ...base,
      g: gamesPlayed(rows),
      gs: null,
      cmp,
      att,
      yds,
      td,
      int,
      firstDowns: null,
      sacked: sumField(rows, (r) => r.sacked),
      sackYds: sumField(rows, (r) => r.sackYds),
      lng: null,
      rating: computePasserRatingFromTotals(att, cmp, yds, td, int),
    });
  }

  if (log.rushing.length > 0) {
    const rows = log.rushing;
    const att = sumField(rows, (r) => r.att);
    const yds = sumField(rows, (r) => r.yds);
    out.rushing.push({
      ...base,
      g: gamesPlayed(rows),
      gs: null,
      att,
      yds,
      td: sumField(rows, (r) => r.td),
      lng: maxField(rows, (r) => r.lng),
      firstDowns: null,
      fumbles: sumField(rows, (r) => r.fumbles),
      ydsPerAtt: att && yds !== null ? round1(yds / att) : null,
    });
  }

  if (log.receiving.length > 0) {
    const rows = log.receiving;
    const rec = sumField(rows, (r) => r.rec);
    const yds = sumField(rows, (r) => r.yds);
    out.receiving.push({
      ...base,
      g: gamesPlayed(rows),
      gs: null,
      rec,
      tgt: sumField(rows, (r) => r.tgt),
      yds,
      td: sumField(rows, (r) => r.td),
      lng: maxField(rows, (r) => r.lng),
      firstDowns: null,
      fumbles: sumField(rows, (r) => r.fumbles),
      ydsPerRec: rec && yds !== null ? round1(yds / rec) : null,
    });
  }

  if (log.kicking.length > 0) {
    const rows = log.kicking;
    out.kicking.push({
      ...base,
      g: gamesPlayed(rows),
      fgm: sumField(rows, (r) => r.fgm),
      fga: sumField(rows, (r) => r.fga),
      fg019m: sumField(rows, (r) => r.fg019m),
      fg019a: sumField(rows, (r) => r.fg019a),
      fg2029m: sumField(rows, (r) => r.fg2029m),
      fg2029a: sumField(rows, (r) => r.fg2029a),
      fg3039m: sumField(rows, (r) => r.fg3039m),
      fg3039a: sumField(rows, (r) => r.fg3039a),
      fg4049m: sumField(rows, (r) => r.fg4049m),
      fg4049a: sumField(rows, (r) => r.fg4049a),
      fg50m: sumField(rows, (r) => r.fg50m),
      fg50a: sumField(rows, (r) => r.fg50a),
      xpm: sumField(rows, (r) => r.xpm),
      xpa: sumField(rows, (r) => r.xpa),
      lng: maxField(rows, (r) => r.lng),
    });
  }

  return out;
}

/**
 * True when the player loads through the IDP path: same split as
 * `loadFootballCareerStats`, where a DL/LB/DB gets only defense_idp rows and
 * everyone else (a null position included) only offense/kicking rows.
 */
export function isIdpPosition(position: string | null): boolean {
  return position !== null && IDP_POSITIONS.has(position);
}

/**
 * Drops the categories the PFR loader would never write for this position, so
 * a receiver's special-teams tackles do not become IDP rows (and IDP scoring)
 * and a linebacker's fake-punt run does not become a rushing row.
 */
export function restrictToPositionGroup(
  rows: DerivedSeasonRows,
  position: string | null,
): DerivedSeasonRows {
  if (isIdpPosition(position)) {
    return { ...emptyDerivedSeasonRows(), defenseIdp: rows.defenseIdp };
  }
  return { ...rows, defenseIdp: [] };
}

// ---------------------------------------------------------------------------
// Career rows
// ---------------------------------------------------------------------------

export interface DerivedCareerRows {
  passing: ReturnType<typeof aggregatePassingSeasons>;
  rushing: ReturnType<typeof aggregateRushingSeasons>;
  receiving: ReturnType<typeof aggregateReceivingSeasons>;
  kicking: ReturnType<typeof aggregateKickingSeasons>;
}

/**
 * Career totals via the same builders `loadFootballCareerStats` uses.
 * `career_football_defense_idp` is a view over the season table, so IDP
 * needs no career row.
 */
export function buildCareerRows(
  playerId: number,
  seasons: DerivedSeasonRows,
): DerivedCareerRows {
  return {
    passing: aggregatePassingSeasons(seasons.passing, playerId),
    rushing: aggregateRushingSeasons(seasons.rushing, playerId),
    receiving: aggregateReceivingSeasons(seasons.receiving, playerId),
    kicking: aggregateKickingSeasons(seasons.kicking, playerId),
  };
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export interface DerivationCandidate {
  playerId: number;
  /** Null for a player with no PFR id (ADR 0023); `pfaId` is then set. */
  pfrId: string | null;
  pfaId: string | null;
  position: string | null;
}

// Every table a PFR load writes for a non-DST player. A player with a row in
// any of them is not a candidate: their stats came from PFR and are never
// touched here.
const EXISTING_STATS_UNION = sql`
  SELECT player_id FROM football_season_passing
  UNION SELECT player_id FROM football_season_rushing
  UNION SELECT player_id FROM football_season_receiving
  UNION SELECT player_id FROM football_season_kicking
  UNION SELECT player_id FROM football_season_defense_idp
  UNION SELECT player_id FROM career_football_passing
  UNION SELECT player_id FROM career_football_rushing
  UNION SELECT player_id FROM career_football_receiving
  UNION SELECT player_id FROM career_football_kicking
`;

/**
 * Football players (non-DST, with a corpus key: a pfr_id, or a pfa_id for a
 * player with no PFR id per ADR 0023) that have no season or career stat
 * rows at all, optionally limited to `playerIds`.
 */
export async function loadDerivationCandidates(
  db: PublicDb,
  playerIds?: number[],
): Promise<DerivationCandidate[]> {
  const idFilter =
    playerIds && playerIds.length > 0
      ? sql`AND p.id = ANY(${playerIds})`
      : sql``;
  const result = await db.execute<{
    id: number;
    pfr_id: string | null;
    pfa_id: string | null;
    position: string | null;
  }>(sql`
    SELECT p.id, NULLIF(p.pfr_id, '') AS pfr_id, p.pfa_id, p.position
    FROM players p
    WHERE p.sport = 'football'
      AND NOT p.is_dst
      AND (NULLIF(p.pfr_id, '') IS NOT NULL OR p.pfa_id IS NOT NULL)
      AND p.id NOT IN (${EXISTING_STATS_UNION})
      ${idFilter}
    ORDER BY p.id
  `);
  return result.rows.map((r) => ({
    playerId: r.id,
    pfrId: r.pfr_id,
    pfaId: r.pfa_id,
    position: r.position,
  }));
}

/**
 * Writes one player's derived season + career rows in a single transaction.
 * Re-checks inside the transaction that the player still has no stat rows,
 * and inserts with ON CONFLICT DO NOTHING, so a PFR-sourced row is never
 * overwritten even if a PFR load ran between the candidate query and now.
 * Returns false (nothing written) when the player gained rows meanwhile.
 */
export async function applyDerivedPlayerStats(
  db: PublicDb,
  playerId: number,
  seasons: DerivedSeasonRows,
  careers: DerivedCareerRows,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const existing = await tx.execute<{ player_id: number }>(
      sql`SELECT player_id FROM (${EXISTING_STATS_UNION}) e WHERE player_id = ${playerId} LIMIT 1`,
    );
    if (existing.rows.length > 0) return false;

    if (seasons.passing.length > 0) {
      await tx
        .insert(PublicSchema.footballSeasonPassing)
        .values(seasons.passing)
        .onConflictDoNothing();
    }
    if (seasons.rushing.length > 0) {
      await tx
        .insert(PublicSchema.footballSeasonRushing)
        .values(seasons.rushing)
        .onConflictDoNothing();
    }
    if (seasons.receiving.length > 0) {
      await tx
        .insert(PublicSchema.footballSeasonReceiving)
        .values(seasons.receiving)
        .onConflictDoNothing();
    }
    if (seasons.kicking.length > 0) {
      await tx
        .insert(PublicSchema.footballSeasonKicking)
        .values(seasons.kicking)
        .onConflictDoNothing();
    }
    if (seasons.defenseIdp.length > 0) {
      await tx
        .insert(PublicSchema.footballSeasonDefenseIdp)
        .values(seasons.defenseIdp)
        .onConflictDoNothing();
    }

    if (careers.passing) {
      await tx
        .insert(PublicSchema.careerFootballPassing)
        .values(careers.passing)
        .onConflictDoNothing();
    }
    if (careers.rushing) {
      await tx
        .insert(PublicSchema.careerFootballRushing)
        .values(careers.rushing)
        .onConflictDoNothing();
    }
    if (careers.receiving) {
      await tx
        .insert(PublicSchema.careerFootballReceiving)
        .values(careers.receiving)
        .onConflictDoNothing();
    }
    if (careers.kicking) {
      await tx
        .insert(PublicSchema.careerFootballKicking)
        .values(careers.kicking)
        .onConflictDoNothing();
    }
    return true;
  });
}
