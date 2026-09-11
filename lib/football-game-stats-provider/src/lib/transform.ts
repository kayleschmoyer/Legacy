import type {
  StoredGameFootballDefense,
  StoredGameFootballDefenseIdp,
  StoredGameFootballKicking,
  StoredGameFootballPassing,
  StoredGameFootballReceiving,
  StoredGameFootballRushing,
} from './types';

/**
 * Parsing and aggregation of nflverse's `stats_player_week_<season>.csv`
 * (release `player_stats`), `players.csv` (release `players`) and
 * `games.csv` (release `schedules`) releases into this package's stored game
 * shapes.
 *
 * Column names below were captured live from
 * https://github.com/nflverse/nflverse-data/releases/download/player_stats/stats_player_week_2023.csv
 * on 2026-09-11 — nflverse ships one unified per-player weekly file covering
 * offense, kicking, AND defense/IDP together, unlike the two-source split
 * `lib/data-loaders/src/lib/backfill-nflverse-multiteam-seasons.ts` (LS-9919)
 * assumed from an older nflverse schema revision (that module's `def_*`
 * column names for fumble recoveries — `def_fumble_recovery_own/opp` — do
 * NOT match the current release, which uses unprefixed
 * `fumble_recovery_own/opp`). Do not copy this module's column names back
 * into that one without re-verifying against a fresh download.
 */

export type NflverseRow = Record<string, string>;

/**
 * Minimal CSV reader — nflverse's CSVs are machine generated with no embedded
 * newlines, but do quote fields containing commas (e.g. `fg_made_list`).
 * Duplicated rather than imported from
 * `lib/data-loaders/src/lib/backfill-nflverse-multiteam-seasons.ts` or
 * `@legacy-sports/game-stats-provider`'s Retrosheet reader — each ingest
 * package owns its own copy so none of them share a dependency edge for a
 * ~30-line function, matching the precedent those two already set.
 */
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

export function toNum(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** pfr_id -> gsis_id crosswalk, built from nflverse's `players.csv`. */
export function buildGsisToPfrCrosswalk(
  playersCsvRows: NflverseRow[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of playersCsvRows) {
    const gsisId = row.gsis_id?.trim();
    const pfrId = row.pfr_id?.trim();
    if (gsisId && pfrId) map.set(gsisId, pfrId);
  }
  return map;
}

/**
 * `${season}|${week}|${team}` -> nflverse `game_id`, built from
 * `games.csv` (release `schedules`). nflverse's own `game_id` convention is
 * `{season}_{week:02d}_{away_team}_{home_team}`, but the weekly stats file
 * gives no way to derive it directly (no `game_id` column, and no reliable
 * way to tell home from away) — the schedule file is the only source for it.
 */
export function buildGameIdIndex(
  scheduleRows: NflverseRow[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of scheduleRows) {
    if (row.game_type !== 'REG') continue; // matches LS-9919's REG-only convention
    const season = row.season;
    const week = row.week;
    const gameId = row.game_id;
    if (!season || !week || !gameId) continue;
    if (row.away_team) index.set(`${season}|${week}|${row.away_team}`, gameId);
    if (row.home_team) index.set(`${season}|${week}|${row.home_team}`, gameId);
  }
  return index;
}

/**
 * nflverse team codes for a relocated/renamed franchise change over the
 * corpus's 1999-2025 span (e.g. the Raiders: OAK through 2019, LV from
 * 2020). This app treats a franchise as one continuous DST entity under its
 * CURRENT canonical code (`lambdas/stats-lambda/src/constants.ts`'s
 * `NFL_TEAMS`), so historical rows are normalized to that code at ingest —
 * the read path never sees the old codes.
 */
const HISTORICAL_TEAM_ALIASES: Record<string, string> = {
  OAK: 'LV',
  SD: 'LAC',
  STL: 'LAR',
  LA: 'LAR',
};

export function normalizeNflTeam(team: string): string {
  return HISTORICAL_TEAM_ALIASES[team] ?? team;
}

function gameIdentifierFor(
  gameIdIndex: Map<string, string>,
  season: string,
  week: string,
  team: string,
): string | null {
  return gameIdIndex.get(`${season}|${week}|${team}`) ?? null;
}

/** Assigns sequential per-player-season game numbers, in week order — mirrors
 * PFR's own `ranker` column semantics (the player's nth game that season,
 * counting only games with real activity in this category). */
function assignGameNumbers(rows: NflverseRow[]): Map<NflverseRow, number> {
  const sorted = [...rows].sort(
    (a, b) => (toNum(a.week) ?? 0) - (toNum(b.week) ?? 0),
  );
  const numbers = new Map<NflverseRow, number>();
  sorted.forEach((row, i) => numbers.set(row, i + 1));
  return numbers;
}

// ---------------------------------------------------------------------------
// Per-category builders — each filters to rows with real activity in that
// category before numbering, matching CareerStats.getGameLog's documented
// behavior ("emits rushing rows only for games with carries", "does not emit
// passing rows for a kicker").
// ---------------------------------------------------------------------------

export function buildPassingRows(
  playerWeeklyRows: NflverseRow[],
  gameIdIndex: Map<string, string>,
  season: number,
): StoredGameFootballPassing[] {
  const active = playerWeeklyRows.filter((r) => (toNum(r.attempts) ?? 0) > 0);
  const numbers = assignGameNumbers(active);
  const out: StoredGameFootballPassing[] = [];
  for (const row of active) {
    const gameIdentifier = gameIdentifierFor(
      gameIdIndex,
      row.season,
      row.week,
      row.team,
    );
    if (!gameIdentifier) continue;
    out.push({
      season,
      gameNum: numbers.get(row) ?? 0,
      gameIdentifier,
      cmp: toNum(row.completions),
      att: toNum(row.attempts),
      yds: toNum(row.passing_yards),
      td: toNum(row.passing_tds),
      int: toNum(row.passing_interceptions),
      sacked: toNum(row.sacks_suffered),
      sackYds: toNum(row.sack_yards_lost),
      // nflverse's weekly file carries no passer-rating column — a
      // permanent display-only gap per ADR 0022 ("Now constrained").
      rating: null,
    });
  }
  return out;
}

export function buildRushingRows(
  playerWeeklyRows: NflverseRow[],
  gameIdIndex: Map<string, string>,
  season: number,
): StoredGameFootballRushing[] {
  const active = playerWeeklyRows.filter((r) => (toNum(r.carries) ?? 0) > 0);
  const numbers = assignGameNumbers(active);
  const out: StoredGameFootballRushing[] = [];
  for (const row of active) {
    const gameIdentifier = gameIdentifierFor(
      gameIdIndex,
      row.season,
      row.week,
      row.team,
    );
    if (!gameIdentifier) continue;
    out.push({
      season,
      gameNum: numbers.get(row) ?? 0,
      gameIdentifier,
      att: toNum(row.carries),
      yds: toNum(row.rushing_yards),
      td: toNum(row.rushing_tds),
      // Not derivable from nflverse's box-score-level weekly totals — same
      // permanent gap ADR 0022 documents for the season-total tables.
      lng: null,
      fumbles: toNum(row.rushing_fumbles),
    });
  }
  return out;
}

export function buildReceivingRows(
  playerWeeklyRows: NflverseRow[],
  gameIdIndex: Map<string, string>,
  season: number,
): StoredGameFootballReceiving[] {
  const active = playerWeeklyRows.filter(
    (r) => (toNum(r.targets) ?? 0) > 0 || (toNum(r.receptions) ?? 0) > 0,
  );
  const numbers = assignGameNumbers(active);
  const out: StoredGameFootballReceiving[] = [];
  for (const row of active) {
    const gameIdentifier = gameIdentifierFor(
      gameIdIndex,
      row.season,
      row.week,
      row.team,
    );
    if (!gameIdentifier) continue;
    out.push({
      season,
      gameNum: numbers.get(row) ?? 0,
      gameIdentifier,
      rec: toNum(row.receptions),
      tgt: toNum(row.targets),
      yds: toNum(row.receiving_yards),
      td: toNum(row.receiving_tds),
      lng: null,
      fumbles: toNum(row.receiving_fumbles),
    });
  }
  return out;
}

export function buildKickingRows(
  playerWeeklyRows: NflverseRow[],
  gameIdIndex: Map<string, string>,
  season: number,
): StoredGameFootballKicking[] {
  const active = playerWeeklyRows.filter(
    (r) => (toNum(r.fg_att) ?? 0) > 0 || (toNum(r.pat_att) ?? 0) > 0,
  );
  const numbers = assignGameNumbers(active);
  const out: StoredGameFootballKicking[] = [];
  for (const row of active) {
    const gameIdentifier = gameIdentifierFor(
      gameIdIndex,
      row.season,
      row.week,
      row.team,
    );
    if (!gameIdentifier) continue;
    out.push({
      season,
      gameNum: numbers.get(row) ?? 0,
      gameIdentifier,
      fgm: toNum(row.fg_made),
      fga: toNum(row.fg_att),
      fg019m: toNum(row.fg_made_0_19),
      fg019a: null, // nflverse only carries makes-by-band, not attempts-by-band
      fg2029m: toNum(row.fg_made_20_29),
      fg2029a: null,
      fg3039m: toNum(row.fg_made_30_39),
      fg3039a: null,
      fg4049m: toNum(row.fg_made_40_49),
      fg4049a: null,
      fg50m: toNum(row.fg_made_50_59),
      fg50a: null,
      xpm: toNum(row.pat_made),
      xpa: toNum(row.pat_att),
      lng: toNum(row.fg_long),
    });
  }
  return out;
}

const DEFENSE_IDP_ACTIVITY_FIELDS = [
  'def_tackles_solo',
  'def_tackle_assists',
  'def_sacks',
  'def_interceptions',
  'def_pass_defended',
  'def_tds',
  'def_safeties',
] as const;

export function buildDefenseIdpRows(
  playerWeeklyRows: NflverseRow[],
  gameIdIndex: Map<string, string>,
  season: number,
): StoredGameFootballDefenseIdp[] {
  const active = playerWeeklyRows.filter((r) =>
    DEFENSE_IDP_ACTIVITY_FIELDS.some((f) => (toNum(r[f]) ?? 0) !== 0),
  );
  const numbers = assignGameNumbers(active);
  const out: StoredGameFootballDefenseIdp[] = [];
  for (const row of active) {
    const gameIdentifier = gameIdentifierFor(
      gameIdIndex,
      row.season,
      row.week,
      row.team,
    );
    if (!gameIdentifier) continue;
    out.push({
      season,
      gameNum: numbers.get(row) ?? 0,
      gameIdentifier,
      soloTkl: toNum(row.def_tackles_solo),
      astTkl: toNum(row.def_tackle_assists),
      sacks: toNum(row.def_sacks),
      int: toNum(row.def_interceptions),
      pd: toNum(row.def_pass_defended),
      ff: toNum(row.def_fumbles_forced),
      fr: toNum(row.fumble_recovery_opp),
      defTd: toNum(row.def_tds),
      safeties: toNum(row.def_safeties),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Team defense (DST) aggregation — see TeamDefense.getGameLog's PFR data-stat
// mapping in lib/pfr-client/src/lib/TeamDefense.ts for the target shape this
// mirrors: sacks/int/fumRec/defTd/safeties are the team's own defense; pts/
// yds/passYds/rushYds "allowed" are the OPPOSING offense's output that game.
// ---------------------------------------------------------------------------

interface TeamGameAccumulator {
  season: number;
  week: number;
  sacks: number;
  int: number;
  fumRec: number;
  defTd: number;
  safeties: number;
  ptsAllowed: number | null;
  ydsAllowed: number;
  passYdsAllowed: number;
  rushYdsAllowed: number;
}

function emptyAccumulator(season: number, week: number): TeamGameAccumulator {
  return {
    season,
    week,
    sacks: 0,
    int: 0,
    fumRec: 0,
    defTd: 0,
    safeties: 0,
    ptsAllowed: null,
    ydsAllowed: 0,
    passYdsAllowed: 0,
    rushYdsAllowed: 0,
  };
}

/**
 * Builds one {@link StoredGameFootballDefense}[] per nflTeam for a season,
 * from the same weekly player-stats rows the offensive builders above read.
 *
 * - Team's own defensive counting stats (sacks/int/fumRec/defTd/safeties):
 *   summed across every row where `team` is this defense (regardless of the
 *   row's position — a DL's sack and a DB's sack both count).
 * - Yards/points allowed: summed from the OPPOSING offense's rows for that
 *   same game (rows where `opponent_team` is this defense), plus the
 *   schedule's final score for points allowed, since the weekly stats file
 *   carries no score column.
 */
export function buildTeamDefenseGames(
  weeklyRows: NflverseRow[],
  scheduleRows: NflverseRow[],
  season: number,
): Map<string, StoredGameFootballDefense[]> {
  const gameIdIndex = buildGameIdIndex(scheduleRows);

  const byTeamWeek = new Map<string, TeamGameAccumulator>();
  const ensure = (team: string, week: number) => {
    const key = `${team}|${week}`;
    let acc = byTeamWeek.get(key);
    if (!acc) {
      acc = emptyAccumulator(season, week);
      byTeamWeek.set(key, acc);
    }
    return acc;
  };

  for (const row of weeklyRows) {
    if (row.season_type !== 'REG') continue;
    const week = toNum(row.week);
    if (week === null || !row.team || !row.opponent_team) continue;

    const defTeam = normalizeNflTeam(row.team);
    const offTeam = normalizeNflTeam(row.opponent_team);

    // This row's own defensive production credits ITS team's defense.
    const own = ensure(defTeam, week);
    own.sacks += toNum(row.def_sacks) ?? 0;
    own.int += toNum(row.def_interceptions) ?? 0;
    own.fumRec += toNum(row.fumble_recovery_opp) ?? 0;
    own.defTd += toNum(row.def_tds) ?? 0;
    own.safeties += toNum(row.def_safeties) ?? 0;

    // This row's own offensive production is what the OPPOSING defense
    // allowed that week.
    const opposing = ensure(offTeam, week);
    opposing.passYdsAllowed += toNum(row.passing_yards) ?? 0;
    opposing.rushYdsAllowed += toNum(row.rushing_yards) ?? 0;
  }

  for (const row of scheduleRows) {
    if (row.game_type !== 'REG' || row.season !== String(season)) continue;
    const week = toNum(row.week);
    if (week === null) continue;
    const away = normalizeNflTeam(row.away_team);
    const home = normalizeNflTeam(row.home_team);
    const awayScore = toNum(row.away_score);
    const homeScore = toNum(row.home_score);
    if (awayScore !== null) ensure(home, week).ptsAllowed = awayScore;
    if (homeScore !== null) ensure(away, week).ptsAllowed = homeScore;
  }

  for (const acc of byTeamWeek.values()) {
    acc.ydsAllowed = acc.passYdsAllowed + acc.rushYdsAllowed;
  }

  const result = new Map<string, StoredGameFootballDefense[]>();
  const teams = new Set([...byTeamWeek.keys()].map((k) => k.split('|')[0]));
  for (const team of teams) {
    const games = [...byTeamWeek.entries()]
      .filter(([key]) => key.startsWith(`${team}|`))
      .map(([, acc]) => acc)
      .sort((a, b) => a.week - b.week);

    const rows: StoredGameFootballDefense[] = games.map((acc, i) => {
      const gameIdentifier = gameIdentifierFor(
        gameIdIndex,
        String(acc.season),
        String(acc.week),
        team,
      );
      return {
        season: acc.season,
        gameNum: i + 1,
        gameIdentifier: gameIdentifier ?? `${acc.season}-w${acc.week}-${team}`,
        sacks: acc.sacks,
        int: acc.int,
        fumRec: acc.fumRec,
        defTd: acc.defTd,
        safeties: acc.safeties,
        ptsAllowed: acc.ptsAllowed,
        ydsAllowed: acc.ydsAllowed,
        passYdsAllowed: acc.passYdsAllowed,
        rushYdsAllowed: acc.rushYdsAllowed,
      };
    });
    result.set(team, rows);
  }
  return result;
}
