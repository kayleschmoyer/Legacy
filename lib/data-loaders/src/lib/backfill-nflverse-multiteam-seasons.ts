import type {
  FootballSeasonDefenseIdp,
  FootballSeasonKicking,
  FootballSeasonPassing,
  FootballSeasonReceiving,
  FootballSeasonRushing,
} from '@legacy-sports/pfr-client';
import { CareerStats } from '@legacy-sports/pfr-client';
import { LOGGER } from '@legacy-sports/logging';
import { PublicDb } from '@legacy-sports/db-client';
import {
  pruneSupersededSeasonRows,
  upsertSeasonDefenseIdp,
  upsertSeasonKicking,
  upsertSeasonPassing,
  upsertSeasonReceiving,
  upsertSeasonRushing,
} from './load-football-career-stats';

/**
 * Repairs multi-team season rows for players whose entire career falls in
 * 1999+, using nflverse (github.com/nflverse/nflverse-data) weekly stats as
 * ground truth (LS-9919).
 *
 * Data source and attribution: nflverse-data is licensed CC-BY 4.0
 * (https://github.com/nflverse/nflverse-data/blob/master/LICENSE.md) —
 * confirmed per LS-9908. Attribution: "nflverse" (https://nflverse.com).
 *
 * This is the sibling of the LS-9915 parser fix in
 * `@legacy-sports/pfr-client`'s `CareerStats.ts`, which stopped the bug going
 * forward (a traded player's season was silently collapsed to whichever
 * per-team row PFR printed last — see the comment above
 * `AGGREGATE_TEAM_REGEX` there). That fix only self-heals a player's rows the
 * next time their PFR page is scraped; this module targets the 7,955 players
 * whose careers are entirely 1999+, where nflverse's weekly data lets us
 * repair the same truncation without any PFR/Cloudflare risk (contrast with
 * the pre-1999 tranche, LS-9920, which has no nflverse coverage and needs a
 * real PFR re-scrape).
 */

// ---------------------------------------------------------------------------
// nflverse CSV parsing
// ---------------------------------------------------------------------------

export type NflverseRow = Record<string, string>;

const NFLVERSE_RELEASE_BASE =
  'https://github.com/nflverse/nflverse-data/releases/download';

/** nflverse release assets: the id crosswalk and the three weekly stat files. */
export const NFLVERSE_CSV_URLS = {
  players: `${NFLVERSE_RELEASE_BASE}/players/players.csv`,
  offense: `${NFLVERSE_RELEASE_BASE}/player_stats/player_stats.csv`,
  defense: `${NFLVERSE_RELEASE_BASE}/player_stats/player_stats_def.csv`,
  kicking: `${NFLVERSE_RELEASE_BASE}/player_stats/player_stats_kicking.csv`,
} as const;

const FETCH_TIMEOUT_MS = 120_000;

export async function fetchNflverseCsvText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return response.text();
}

/** Minimal CSV reader — nflverse's weekly stats/players CSVs are machine
 * generated with no embedded newlines, but do quote fields containing commas
 * (player names). Mirrors the reader in `ingestRetrosheet.ts` (LS-9817). */
export function parseNflverseCsv(text: string): NflverseRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    out.push(field);
    return out;
  };

  const header = splitLine(lines[0]);
  const rows: NflverseRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const row: NflverseRow = {};
    for (let c = 0; c < header.length; c++) row[header[c]] = cells[c] ?? '';
    rows.push(row);
  }
  return rows;
}

function toNum(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** pfr_id -> gsis_id, built from nflverse's players.csv id-mapping file. */
export function buildPfrToGsisCrosswalk(
  playersCsvRows: NflverseRow[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of playersCsvRows) {
    const pfrId = row.pfr_id?.trim();
    const gsisId = row.gsis_id?.trim();
    if (pfrId && gsisId) map.set(pfrId, gsisId);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Weekly -> season aggregation
// ---------------------------------------------------------------------------

export interface SeasonAggregate {
  /** Distinct teams the player recorded real activity for in this category. */
  teams: string[];
  /** Weeks with real activity — becomes the combined row's `g`. */
  games: number;
  sums: Record<string, number>;
  maxes: Record<string, number>;
}

export interface CategoryConfig {
  /** Fields to sum across weeks. */
  sumFields: readonly string[];
  /** Fields to take the max of across weeks (e.g. "long" columns). */
  maxFields?: readonly string[];
  /**
   * A weekly row only counts toward this category — team membership and game
   * count included — when at least one of these fields is non-zero. A player
   * can be on an nflverse weekly roster row for a team without recording any
   * stat in a given category (a healthy scratch, a bye week on the new
   * team's row); counting that as "played for" the team would over-detect
   * multi-team seasons for players who were only ever rostered, never
   * statistically involved, on a second team that year — which PFR (and this
   * backfill, matching it) would not show as a team row at all.
   */
  activityFields: readonly string[];
  teamField?: string; // defaults to 'recent_team'
}

/**
 * Groups nflverse weekly rows by (gsis_id, season) for a single stat
 * category and folds them into one {@link SeasonAggregate} per group.
 * Only REG-season rows for players present in `gsisIds` are considered.
 */
export function aggregateNflverseSeasonStats(
  weeklyRows: NflverseRow[],
  config: CategoryConfig,
  gsisIds: ReadonlySet<string>,
  minSeason = 1999,
): Map<string, Map<number, SeasonAggregate>> {
  const teamField = config.teamField ?? 'recent_team';
  const byPlayer = new Map<string, Map<number, SeasonAggregate>>();

  for (const row of weeklyRows) {
    const gsis = row.player_id;
    if (!gsis || !gsisIds.has(gsis)) continue;
    if (row.season_type !== 'REG') continue;
    const season = toNum(row.season);
    if (season === null || season < minSeason) continue;

    const hasActivity = config.activityFields.some(
      (f) => (toNum(row[f]) ?? 0) !== 0,
    );
    if (!hasActivity) continue;

    let bySeason = byPlayer.get(gsis);
    if (!bySeason) {
      bySeason = new Map();
      byPlayer.set(gsis, bySeason);
    }
    let agg = bySeason.get(season);
    if (!agg) {
      agg = { teams: [], games: 0, sums: {}, maxes: {} };
      bySeason.set(season, agg);
    }

    const team = row[teamField];
    if (team && !agg.teams.includes(team)) agg.teams.push(team);
    agg.games += 1;

    for (const f of config.sumFields) {
      const v = toNum(row[f]);
      if (v === null) continue;
      agg.sums[f] = (agg.sums[f] ?? 0) + v;
    }
    for (const f of config.maxFields ?? []) {
      const v = toNum(row[f]);
      if (v === null) continue;
      agg.maxes[f] = agg.maxes[f] === undefined ? v : Math.max(agg.maxes[f], v);
    }
  }

  return byPlayer;
}

/** PFR's own aggregate-row team label, and the one this backfill writes. */
export function multiTeamLabel(teamCount: number): string {
  return `${teamCount}TM`;
}

// Thin adapter over the shared `CareerStats.computePasserRating` so there is a
// single passer-rating formula (LS-10493); only the argument order differs.
export function computePasserRatingFromTotals(
  att: number | null,
  cmp: number | null,
  yds: number | null,
  td: number | null,
  int: number | null,
): number | null {
  return CareerStats.computePasserRating(cmp, att, yds, td, int);
}

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Diffing against current DB state
// ---------------------------------------------------------------------------

export type FootballStatCategory =
  | 'passing'
  | 'rushing'
  | 'receiving'
  | 'kicking'
  | 'defense_idp';

/**
 * Per-category aggregation config for nflverse's weekly stats files —
 * `player_stats.csv` (passing/rushing/receiving), `player_stats_def.csv`
 * (defense_idp) and `player_stats_kicking.csv` (kicking). Shared by the
 * LS-9919 multi-team repair and the LS-10586 season derivation so both read
 * the same columns with the same activity rules.
 */
export const NFLVERSE_CATEGORY_CONFIGS: Record<
  FootballStatCategory,
  CategoryConfig
> = {
  passing: {
    sumFields: [
      'completions',
      'attempts',
      'passing_yards',
      'passing_tds',
      'interceptions',
      'sacks',
      'sack_yards',
      'passing_first_downs',
    ],
    activityFields: ['attempts', 'sacks'],
  },
  rushing: {
    sumFields: [
      'carries',
      'rushing_yards',
      'rushing_tds',
      'rushing_first_downs',
      'rushing_fumbles',
    ],
    activityFields: ['carries'],
  },
  receiving: {
    sumFields: [
      'receptions',
      'targets',
      'receiving_yards',
      'receiving_tds',
      'receiving_first_downs',
      'receiving_fumbles',
    ],
    activityFields: ['targets'],
  },
  defense_idp: {
    sumFields: [
      'def_tackles_solo',
      'def_tackle_assists',
      'def_sacks',
      'def_interceptions',
      'def_pass_defended',
      'def_fumbles_forced',
      'def_tds',
      'def_safety',
      'def_fumble_recovery_own',
      'def_fumble_recovery_opp',
    ],
    activityFields: [
      'def_tackles_solo',
      'def_tackle_assists',
      'def_sacks',
      'def_interceptions',
      'def_pass_defended',
      'def_fumbles_forced',
      'def_tds',
      'def_safety',
    ],
    teamField: 'team',
  },
  kicking: {
    sumFields: ['fg_made', 'fg_att', 'pat_made', 'pat_att'],
    maxFields: ['fg_long'],
    activityFields: ['fg_att', 'pat_att'],
    teamField: 'team',
  },
};

/** Minimal shape of an existing season row, as read from the DB. */
export interface ExistingSeasonRow {
  playerId: number;
  season: number;
  team: string;
}

export interface MultiTeamRepair {
  playerId: number;
  pfrId: string;
  season: number;
  /** The team this row was truncated to before repair. */
  previousTeam: string;
  nflverseTeams: string[];
  agg: SeasonAggregate;
}

const AGGREGATE_TEAM_REGEX = /^\d+TM$/;

/**
 * Finds season rows that are truncated the way LS-9915 truncated them: an
 * existing single-team row in the DB for a (player, season) that nflverse
 * shows real activity with more than one team. A season this player-category
 * has no existing DB row for is left alone — nothing to repair, since the
 * bug's symptom is always exactly one (wrong) row, never a missing one, and
 * inventing a season PFR never scraped at all is out of this ticket's scope.
 */
export function computeMultiTeamRepairs(
  nflverseAgg: Map<string, Map<number, SeasonAggregate>>,
  existingRows: ExistingSeasonRow[],
  gsisToPlayer: Map<string, { playerId: number; pfrId: string }>,
): MultiTeamRepair[] {
  const existingByPlayerSeason = new Map<string, string>(); // "playerId-season" -> team
  for (const row of existingRows) {
    existingByPlayerSeason.set(`${row.playerId}-${row.season}`, row.team);
  }

  const repairs: MultiTeamRepair[] = [];
  for (const [gsis, bySeason] of nflverseAgg) {
    const player = gsisToPlayer.get(gsis);
    if (!player) continue;
    for (const [season, agg] of bySeason) {
      if (agg.teams.length <= 1) continue; // single-team season: nothing to fix
      const existingTeam = existingByPlayerSeason.get(
        `${player.playerId}-${season}`,
      );
      if (existingTeam === undefined) continue; // no row to repair
      if (AGGREGATE_TEAM_REGEX.test(existingTeam)) continue; // already combined
      repairs.push({
        playerId: player.playerId,
        pfrId: player.pfrId,
        season,
        previousTeam: existingTeam,
        nflverseTeams: agg.teams,
        agg,
      });
    }
  }
  return repairs;
}

// ---------------------------------------------------------------------------
// Building combined rows from a repair
// ---------------------------------------------------------------------------

function pfrRowIdFor(repair: MultiTeamRepair): string {
  return `nflverse-${repair.season}`;
}

export function buildCombinedPassingRow(
  repair: MultiTeamRepair,
): FootballSeasonPassing {
  const s = repair.agg.sums;
  const cmp = s.completions ?? null;
  const att = s.attempts ?? null;
  const yds = s.passing_yards ?? null;
  const td = s.passing_tds ?? null;
  const int = s.interceptions ?? null;
  return {
    playerId: repair.playerId,
    season: repair.season,
    team: multiTeamLabel(repair.nflverseTeams.length),
    g: repair.agg.games,
    gs: null, // nflverse weekly stats do not carry a games-started flag
    cmp,
    att,
    yds,
    td,
    int,
    firstDowns: s.passing_first_downs ?? null,
    sacked: s.sacks ?? null,
    sackYds: s.sack_yards ?? null,
    lng: null, // not derivable from nflverse's box-score-level weekly totals
    rating: computePasserRatingFromTotals(att, cmp, yds, td, int),
    pfrRowId: pfrRowIdFor(repair),
  };
}

export function buildCombinedRushingRow(
  repair: MultiTeamRepair,
): FootballSeasonRushing {
  const s = repair.agg.sums;
  const att = s.carries ?? null;
  const yds = s.rushing_yards ?? null;
  return {
    playerId: repair.playerId,
    season: repair.season,
    team: multiTeamLabel(repair.nflverseTeams.length),
    g: repair.agg.games,
    gs: null,
    att,
    yds,
    td: s.rushing_tds ?? null,
    lng: null,
    firstDowns: s.rushing_first_downs ?? null,
    fumbles: s.rushing_fumbles ?? null,
    ydsPerAtt: att ? round1(yds !== null ? yds / att : null) : null,
    pfrRowId: pfrRowIdFor(repair),
  };
}

export function buildCombinedReceivingRow(
  repair: MultiTeamRepair,
): FootballSeasonReceiving {
  const s = repair.agg.sums;
  const rec = s.receptions ?? null;
  const yds = s.receiving_yards ?? null;
  return {
    playerId: repair.playerId,
    season: repair.season,
    team: multiTeamLabel(repair.nflverseTeams.length),
    g: repair.agg.games,
    gs: null,
    rec,
    tgt: s.targets ?? null,
    yds,
    td: s.receiving_tds ?? null,
    lng: null,
    firstDowns: s.receiving_first_downs ?? null,
    fumbles: s.receiving_fumbles ?? null,
    ydsPerRec: rec ? round1(yds !== null ? yds / rec : null) : null,
    pfrRowId: pfrRowIdFor(repair),
  };
}

export function buildCombinedKickingRow(
  repair: MultiTeamRepair,
): FootballSeasonKicking {
  const s = repair.agg.sums;
  return {
    playerId: repair.playerId,
    season: repair.season,
    team: multiTeamLabel(repair.nflverseTeams.length),
    g: repair.agg.games,
    fgm: s.fg_made ?? null,
    fga: s.fg_att ?? null,
    xpm: s.pat_made ?? null,
    xpa: s.pat_att ?? null,
    pfrRowId: pfrRowIdFor(repair),
  };
}

// `sacks` is `string | null` here, not `number | null` as in the
// FootballSeasonDefenseIdp domain type — the underlying column is
// numeric(5,1) (half-sacks), which drizzle's insert type represents as a
// string, matching how `loadFootballCareerStats` builds this same row
// (`String(totals.sacks)`) above.
export function buildCombinedDefenseIdpRow(
  repair: MultiTeamRepair,
): Omit<FootballSeasonDefenseIdp, 'sacks'> & { sacks: string | null } {
  const s = repair.agg.sums;
  const solo = s.def_tackles_solo ?? null;
  const ast = s.def_tackle_assists ?? null;
  const ff = s.def_fumbles_forced ?? 0;
  const fr =
    (s.def_fumble_recovery_own ?? 0) + (s.def_fumble_recovery_opp ?? 0);
  const sacks = s.def_sacks ?? null;
  return {
    playerId: repair.playerId,
    season: repair.season,
    team: multiTeamLabel(repair.nflverseTeams.length),
    g: repair.agg.games,
    gs: null,
    soloTkl: solo,
    astTkl: ast,
    totalTkl: solo !== null || ast !== null ? (solo ?? 0) + (ast ?? 0) : null,
    sacks: sacks !== null ? String(sacks) : null,
    int: s.def_interceptions ?? null,
    pd: s.def_pass_defended ?? null,
    ff: ff || null,
    fr: fr || null,
    defTd: s.def_tds ?? null,
    safeties: s.def_safety ?? null,
    pfrRowId: pfrRowIdFor(repair),
  };
}

// ---------------------------------------------------------------------------
// Applying repairs to the database
// ---------------------------------------------------------------------------

export interface BackfillReport {
  category: FootballStatCategory;
  /** Player-seasons nflverse shows as genuinely multi-team, in this category,
   * restricted to the 1999+ crosswalked player set. */
  nflverseMultiTeamSeasons: number;
  /** Of those, how many had an existing (truncated) DB row to repair. */
  repaired: number;
}

export const CATEGORY_TABLE: Record<FootballStatCategory, string> = {
  passing: 'football_season_passing',
  rushing: 'football_season_rushing',
  receiving: 'football_season_receiving',
  kicking: 'football_season_kicking',
  defense_idp: 'football_season_defense_idp',
};

/**
 * Writes the combined rows and prunes the stale per-team rows they replace,
 * matching the upsert-then-prune pattern `loadFootballCareerStats` uses for
 * the same tables. Never writes a per-team row alongside the combined row —
 * `career_football_*` sums by season, and a stray per-team row left in place
 * would double-count.
 */
export async function applyMultiTeamRepairs(
  db: PublicDb,
  category: FootballStatCategory,
  repairs: MultiTeamRepair[],
  options: { dryRun: boolean },
): Promise<void> {
  if (repairs.length === 0) return;

  if (options.dryRun) {
    LOGGER.info(
      `[dry-run] ${category}: would repair ${repairs.length} season row(s)`,
    );
    return;
  }

  const byPlayer = new Map<number, { season: number; team: string }[]>();
  for (const repair of repairs) {
    const label = multiTeamLabel(repair.nflverseTeams.length);
    switch (category) {
      case 'passing':
        await upsertSeasonPassing(db, buildCombinedPassingRow(repair));
        break;
      case 'rushing':
        await upsertSeasonRushing(db, buildCombinedRushingRow(repair));
        break;
      case 'receiving':
        await upsertSeasonReceiving(db, buildCombinedReceivingRow(repair));
        break;
      case 'kicking':
        await upsertSeasonKicking(db, buildCombinedKickingRow(repair));
        break;
      case 'defense_idp':
        await upsertSeasonDefenseIdp(db, buildCombinedDefenseIdpRow(repair));
        break;
    }
    const written = byPlayer.get(repair.playerId) ?? [];
    written.push({ season: repair.season, team: label });
    byPlayer.set(repair.playerId, written);
  }

  for (const [playerId, written] of byPlayer) {
    await pruneSupersededSeasonRows(
      db,
      CATEGORY_TABLE[category] as Parameters<
        typeof pruneSupersededSeasonRows
      >[1],
      playerId,
      written,
    );
  }

  LOGGER.info(`${category}: repaired ${repairs.length} season row(s)`);
}
