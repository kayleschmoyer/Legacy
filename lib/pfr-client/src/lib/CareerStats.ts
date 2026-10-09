import htmlParser from 'node-html-parser';
import { LOGGER } from '@legacy-sports/logging';
import { getPlayerGameLog, getPlayerPage } from './PFRSession';
import {
  getTable,
  parseFloatCell,
  parseGameIdentifier,
  parseGameNum,
  parseIntCell,
  parseTableRows,
  parseTeamCell,
} from './HtmlParser';
import type {
  FootballSeasonDefenseIdp,
  FootballSeasonKicking,
  FootballSeasonPassing,
  FootballSeasonReceiving,
  FootballSeasonRushing,
  GameFootballKicking,
  GameFootballPassing,
  GameFootballReceiving,
  GameFootballRushing,
  PfrPlayer,
} from './types';

// PFR consolidated all offensive/kicking game logs into a single table
// (id="stats", plus id="stats_playoffs" for postseason) where each row is one
// game and every stat category lives side-by-side as columns keyed by their
// `data-stat`. The column groups present depend on the player's position, and a
// category group can be present-but-zero (e.g. a kicker's page still carries a
// zeroed passing group), so a category row is only emitted when that category
// actually produced in the game — see the per-row guards below.
const GAMELOG_TABLE_ID = 'stats';
const TEAM_STAT = 'team_name_abbr';
const DATE_STAT = 'date';

type Row = import('node-html-parser').HTMLElement;

// Common per-game fields shared by every category row. Returns null for header,
// bye-week and "did not play" rows (no box-score link / no team).
function parseCommon(
  row: Row,
): { gameNum: number; gameIdentifier: string; team: string } | null {
  const gameNum = parseGameNum(row);
  if (gameNum === null) return null;

  const gameIdentifier = parseGameIdentifier(row, DATE_STAT);
  if (!gameIdentifier) return null;

  const team = parseTeamCell(row, TEAM_STAT);
  if (!team) return null;

  return { gameNum, gameIdentifier, team };
}

// --- Passing ---

function parsePassingGameRow(
  row: Row,
  player: PfrPlayer,
): GameFootballPassing | null {
  const common = parseCommon(row);
  if (!common) return null;

  // Only a row where the player actually attempted a pass is a passing game.
  const att = parseIntCell(row, 'pass_att');
  if (!att) return null;

  return {
    playerId: player.id,
    season: 0, // caller fills in
    gameNum: common.gameNum,
    gameIdentifier: common.gameIdentifier,
    cmp: parseIntCell(row, 'pass_cmp'),
    att,
    yds: parseIntCell(row, 'pass_yds'),
    td: parseIntCell(row, 'pass_td'),
    int: parseIntCell(row, 'pass_int'),
    sacked: parseIntCell(row, 'pass_sacked'),
    sackYds: parseIntCell(row, 'pass_sacked_yds'),
    rating: parseFloatCell(row, 'pass_rating'),
  };
}

// --- Rushing ---

function parseRushingGameRow(
  row: Row,
  player: PfrPlayer,
): GameFootballRushing | null {
  const common = parseCommon(row);
  if (!common) return null;

  const att = parseIntCell(row, 'rush_att');
  if (!att) return null;

  return {
    playerId: player.id,
    season: 0,
    gameNum: common.gameNum,
    gameIdentifier: common.gameIdentifier,
    att,
    yds: parseIntCell(row, 'rush_yds'),
    td: parseIntCell(row, 'rush_td'),
    // PFR dropped the per-game long column from the consolidated gamelog table.
    lng: parseIntCell(row, 'rush_long'),
    fumbles: parseIntCell(row, 'fumbles'),
  };
}

// --- Receiving ---

function parseReceivingGameRow(
  row: Row,
  player: PfrPlayer,
): GameFootballReceiving | null {
  const common = parseCommon(row);
  if (!common) return null;

  const tgt = parseIntCell(row, 'targets');
  const rec = parseIntCell(row, 'rec');
  // A receiving game is one where the player was targeted or made a catch.
  if (!tgt && !rec) return null;

  return {
    playerId: player.id,
    season: 0,
    gameNum: common.gameNum,
    gameIdentifier: common.gameIdentifier,
    rec,
    tgt,
    yds: parseIntCell(row, 'rec_yds'),
    td: parseIntCell(row, 'rec_td'),
    lng: parseIntCell(row, 'rec_long'),
    fumbles: parseIntCell(row, 'fumbles'),
  };
}

// --- Kicking ---

function parseKickingGameRow(
  row: Row,
  player: PfrPlayer,
): GameFootballKicking | null {
  const common = parseCommon(row);
  if (!common) return null;

  const fga = parseIntCell(row, 'fga');
  const xpa = parseIntCell(row, 'xpa');
  // A kicking game is one with a field-goal or extra-point attempt.
  if (!fga && !xpa) return null;

  // Distance buckets are 1..5 = 0-19, 20-29, 30-39, 40-49, 50+.
  return {
    playerId: player.id,
    season: 0,
    gameNum: common.gameNum,
    gameIdentifier: common.gameIdentifier,
    fgm: parseIntCell(row, 'fgm'),
    fga,
    fg019m: parseIntCell(row, 'fgm1'),
    fg019a: parseIntCell(row, 'fga1'),
    fg2029m: parseIntCell(row, 'fgm2'),
    fg2029a: parseIntCell(row, 'fga2'),
    fg3039m: parseIntCell(row, 'fgm3'),
    fg3039a: parseIntCell(row, 'fga3'),
    fg4049m: parseIntCell(row, 'fgm4'),
    fg4049a: parseIntCell(row, 'fga4'),
    fg50m: parseIntCell(row, 'fgm5'),
    fg50a: parseIntCell(row, 'fga5'),
    xpm: parseIntCell(row, 'xpm'),
    xpa,
    lng: parseIntCell(row, 'kick_long'),
  };
}

// --- Public API ---

export interface GameLog {
  passing: GameFootballPassing[];
  rushing: GameFootballRushing[];
  receiving: GameFootballReceiving[];
  kicking: GameFootballKicking[];
}

export interface SeasonTotals {
  passing: FootballSeasonPassing | null;
  rushing: FootballSeasonRushing | null;
  receiving: FootballSeasonReceiving | null;
  kicking: FootballSeasonKicking | null;
}

interface ParsedGamelog {
  log: GameLog;
  // Most recent team the player appeared for that season (empty when no games).
  team: string;
}

const EMPTY_LOG: GameLog = {
  passing: [],
  rushing: [],
  receiving: [],
  kicking: [],
};

// Parse the consolidated gamelog table once into per-category game rows plus the
// season's team. Both public functions build on this.
function parseGamelogPage(
  html: string,
  player: PfrPlayer,
  season: number,
): ParsedGamelog {
  const root = htmlParser(html, { comment: true });
  const table = getTable(root, GAMELOG_TABLE_ID);

  if (table === null) {
    return { log: EMPTY_LOG, team: '' };
  }

  const applySeasonAndFilter = <T extends { season: number; gameNum: number }>(
    rows: T[],
  ): T[] => rows.map((r) => ({ ...r, season })).filter((r) => r.gameNum > 0);

  const log: GameLog = {
    passing: applySeasonAndFilter(
      parseTableRows(table, (r) => parsePassingGameRow(r, player)),
    ),
    rushing: applySeasonAndFilter(
      parseTableRows(table, (r) => parseRushingGameRow(r, player)),
    ),
    receiving: applySeasonAndFilter(
      parseTableRows(table, (r) => parseReceivingGameRow(r, player)),
    ),
    kicking: applySeasonAndFilter(
      parseTableRows(table, (r) => parseKickingGameRow(r, player)),
    ),
  };

  // The season team is whatever team the player last appeared for; the table's
  // footer no longer carries it, so derive it from the game rows.
  const teams = parseTableRows(table, (r) =>
    parseGameNum(r) === null ? null : parseTeamCell(r, TEAM_STAT),
  );
  const team = teams.length > 0 ? teams[teams.length - 1] : '';

  return { log, team };
}

export async function getGameLog(
  player: PfrPlayer,
  season: number,
): Promise<GameLog> {
  const html = await getPlayerGameLog(player.pfrId, season);
  const { log } = parseGamelogPage(html, player, season);

  LOGGER.info(
    `Game log for ${player.pfrId} ${season}: ` +
      `${log.passing.length} passing, ${log.rushing.length} rushing, ` +
      `${log.receiving.length} receiving, ${log.kicking.length} kicking games`,
  );

  return log;
}

// The consolidated table no longer exposes a per-category season footer row, so
// season totals are aggregated from the per-game rows (which reproduces PFR's
// own season totals exactly).

function aggregateSeasonPassing(
  games: GameFootballPassing[],
  player: PfrPlayer,
  season: number,
  team: string,
): FootballSeasonPassing | null {
  if (games.length === 0) return null;

  let cmp = 0;
  let att = 0;
  let yds = 0;
  let td = 0;
  let int = 0;
  let sacked = 0;
  let sackYds = 0;
  for (const game of games) {
    cmp += game.cmp ?? 0;
    att += game.att ?? 0;
    yds += game.yds ?? 0;
    td += game.td ?? 0;
    int += game.int ?? 0;
    sacked += game.sacked ?? 0;
    sackYds += game.sackYds ?? 0;
  }

  return {
    playerId: player.id,
    season,
    team,
    pfrRowId: `${season}`,
    g: games.length,
    // Not exposed per-game — only the main-page season/career parsers carry these.
    gs: null,
    cmp,
    att,
    yds,
    td,
    int,
    firstDowns: null,
    sacked,
    sackYds,
    lng: null,
    // Season passer rating is recomputed downstream from the totals.
    rating: null,
  };
}

function aggregateSeasonRushing(
  games: GameFootballRushing[],
  player: PfrPlayer,
  season: number,
  team: string,
): FootballSeasonRushing | null {
  if (games.length === 0) return null;

  let att = 0;
  let yds = 0;
  let td = 0;
  let fumbles = 0;
  let lng: number | null = null;
  for (const game of games) {
    att += game.att ?? 0;
    yds += game.yds ?? 0;
    td += game.td ?? 0;
    fumbles += game.fumbles ?? 0;
    if (game.lng !== null) lng = Math.max(lng ?? game.lng, game.lng);
  }

  return {
    playerId: player.id,
    season,
    team,
    pfrRowId: `${season}`,
    g: games.length,
    // Not exposed per-game — only the main-page season/career parsers carry these.
    gs: null,
    att,
    yds,
    td,
    lng,
    firstDowns: null,
    fumbles,
    ydsPerAtt: att > 0 ? yds / att : null,
  };
}

function aggregateSeasonReceiving(
  games: GameFootballReceiving[],
  player: PfrPlayer,
  season: number,
  team: string,
): FootballSeasonReceiving | null {
  if (games.length === 0) return null;

  let rec = 0;
  let tgt = 0;
  let yds = 0;
  let td = 0;
  let fumbles = 0;
  let lng: number | null = null;
  for (const game of games) {
    rec += game.rec ?? 0;
    tgt += game.tgt ?? 0;
    yds += game.yds ?? 0;
    td += game.td ?? 0;
    fumbles += game.fumbles ?? 0;
    if (game.lng !== null) lng = Math.max(lng ?? game.lng, game.lng);
  }

  return {
    playerId: player.id,
    season,
    team,
    pfrRowId: `${season}`,
    g: games.length,
    // Not exposed per-game — only the main-page season/career parsers carry these.
    gs: null,
    rec,
    tgt,
    yds,
    td,
    lng,
    firstDowns: null,
    fumbles,
    ydsPerRec: rec > 0 ? yds / rec : null,
  };
}

function aggregateSeasonKicking(
  games: GameFootballKicking[],
  player: PfrPlayer,
  season: number,
  team: string,
): FootballSeasonKicking | null {
  if (games.length === 0) return null;

  let fgm = 0;
  let fga = 0;
  let xpm = 0;
  let xpa = 0;
  for (const game of games) {
    fgm += game.fgm ?? 0;
    fga += game.fga ?? 0;
    xpm += game.xpm ?? 0;
    xpa += game.xpa ?? 0;
  }

  return {
    playerId: player.id,
    season,
    team,
    pfrRowId: `${season}`,
    g: games.length,
    fgm,
    fga,
    xpm,
    xpa,
  };
}

export async function getSeasonTotals(
  player: PfrPlayer,
  season: number,
): Promise<SeasonTotals> {
  const html = await getPlayerGameLog(player.pfrId, season);
  const { log, team } = parseGamelogPage(html, player, season);

  return {
    passing: aggregateSeasonPassing(log.passing, player, season, team),
    rushing: aggregateSeasonRushing(log.rushing, player, season, team),
    receiving: aggregateSeasonReceiving(log.receiving, player, season, team),
    kicking: aggregateSeasonKicking(log.kicking, player, season, team),
  };
}

// --- Main player page season totals ---
// Parses per-season aggregate tables from the player's main PFR page, yielding
// all career seasons in a single HTTP request instead of one per season.
// Tables vary by position: `passing` (QBs), `receiving_and_rushing` /
// `rushing_and_receiving` (skill players), `scoring` (kickers).
// Multi-team seasons are combined explicitly by season — see the combination
// helpers below — rather than by relying on PFR's row order.

// Official NFL passer rating (each component clamped to 0..2.375). Lives here rather than in the loader because combining a
// traded player's split seasons has to recompute it from the merged line —
// rating is not additive, so a multi-team season cannot reuse either team's
// published value.
export function computePasserRating(
  cmp: number | null,
  att: number | null,
  yds: number | null,
  td: number | null,
  int: number | null,
): number | null {
  if (att === null || att === 0) return null;
  const clamp = (v: number) => Math.max(0, Math.min(v, 2.375));
  const a = clamp(((cmp ?? 0) / att - 0.3) / 0.2);
  const b = clamp(((yds ?? 0) / att - 3) / 4);
  const c = clamp((td ?? 0) / att / 0.05);
  const d = clamp((0.095 - (int ?? 0) / att) / 0.04);
  return Math.round(((a + b + c + d) / 6) * 100 * 10) / 10;
}

// --- Multi-team season combination (LS-9915) ---
// PFR splits a traded player's season into one row per team, alongside an
// aggregate "2TM"/"3TM" row carrying the combined totals. Selecting a single
// row per season by document order silently kept whichever team row came last
// and dropped the rest of the season, so traded players were stored with only
// part of a season (Mohamed Sanu 2019 landed as NWE-only: 8 g / 26 rec / 207
// yds against an actual 15 g / 59 rec / 520 yds). Every football_season_* table
// showed it, because they all funnel through the same per-season collapse.
//
// Combination is therefore explicit and order-independent: prefer PFR's own
// aggregate row when the page carries one, and otherwise rebuild the combined
// line by folding the per-team rows together. That is correct whether the
// aggregate row appears first, last, or not at all — which matters because PFR
// is behind a Cloudflare challenge and its current row order cannot be
// re-verified by scraping.

// PFR labels an aggregate multi-team row by team count: "2TM", "3TM", …
const AGGREGATE_TEAM_REGEX = /^\d+TM$/;

function isAggregateRow(row: { team: string }): boolean {
  return AGGREGATE_TEAM_REGEX.test(row.team.trim());
}

// Sums across rows, staying null only when no row carries a value — so a
// genuinely absent stat is not reported as a hard zero.
function sumField<T>(
  rows: T[],
  pick: (row: T) => number | null,
): number | null {
  let total: number | null = null;
  for (const row of rows) {
    const value = pick(row);
    if (value === null) continue;
    total = (total ?? 0) + value;
  }
  return total;
}

// "Long" columns are a season maximum, not a sum.
function maxField<T>(
  rows: T[],
  pick: (row: T) => number | null,
): number | null {
  let best: number | null = null;
  for (const row of rows) {
    const value = pick(row);
    if (value === null) continue;
    best = best === null ? value : Math.max(best, value);
  }
  return best;
}

// PFR rounds published per-team rate columns, so combined rates are recomputed
// from the summed components rather than averaged.
function ratePerUnit(
  total: number | null,
  units: number | null,
): number | null {
  if (total === null || units === null || units === 0) return null;
  return Math.round((total / units) * 10) / 10;
}

// Collapses one season's rows to a single combined row. A single-team season
// passes through untouched; a season carrying PFR's own aggregate row uses it
// verbatim; anything else is folded by `fold`.
function combineSeasonRows<T extends { team: string }>(
  rows: T[],
  fold: (rows: T[]) => T,
): T {
  if (rows.length === 1) return rows[0];

  const aggregate = rows.find(isAggregateRow);
  if (aggregate) return aggregate;

  return fold(rows);
}

// Groups rows by season and combines each group, preserving season order.
function combineBySeason<T extends { season: number; team: string }>(
  rows: T[],
  fold: (rows: T[]) => T,
): Map<number, T> {
  const bySeason = new Map<number, T[]>();
  for (const row of rows) {
    const group = bySeason.get(row.season);
    if (group) group.push(row);
    else bySeason.set(row.season, [row]);
  }

  const combined = new Map<number, T>();
  for (const [season, group] of bySeason) {
    combined.set(season, combineSeasonRows(group, fold));
  }
  return combined;
}

// The synthesised team label for a folded multi-team season, matching PFR's
// own convention so a rebuilt row is indistinguishable from a supplied one.
function combinedTeamLabel(rows: unknown[]): string {
  return `${rows.length}TM`;
}

function foldPassing(rows: FootballSeasonPassing[]): FootballSeasonPassing {
  const cmp = sumField(rows, (r) => r.cmp);
  const att = sumField(rows, (r) => r.att);
  const yds = sumField(rows, (r) => r.yds);
  const td = sumField(rows, (r) => r.td);
  const int = sumField(rows, (r) => r.int);
  return {
    ...rows[0],
    team: combinedTeamLabel(rows),
    g: sumField(rows, (r) => r.g),
    gs: sumField(rows, (r) => r.gs),
    cmp,
    att,
    yds,
    td,
    int,
    firstDowns: sumField(rows, (r) => r.firstDowns),
    sacked: sumField(rows, (r) => r.sacked),
    sackYds: sumField(rows, (r) => r.sackYds),
    lng: maxField(rows, (r) => r.lng),
    // Passer rating is not additive — recompute it from the combined line.
    rating: computePasserRating(cmp, att, yds, td, int),
  };
}

function foldRushing(rows: FootballSeasonRushing[]): FootballSeasonRushing {
  const att = sumField(rows, (r) => r.att);
  const yds = sumField(rows, (r) => r.yds);
  return {
    ...rows[0],
    team: combinedTeamLabel(rows),
    g: sumField(rows, (r) => r.g),
    gs: sumField(rows, (r) => r.gs),
    att,
    yds,
    td: sumField(rows, (r) => r.td),
    lng: maxField(rows, (r) => r.lng),
    firstDowns: sumField(rows, (r) => r.firstDowns),
    fumbles: sumField(rows, (r) => r.fumbles),
    ydsPerAtt: ratePerUnit(yds, att),
  };
}

function foldReceiving(
  rows: FootballSeasonReceiving[],
): FootballSeasonReceiving {
  const rec = sumField(rows, (r) => r.rec);
  const yds = sumField(rows, (r) => r.yds);
  return {
    ...rows[0],
    team: combinedTeamLabel(rows),
    g: sumField(rows, (r) => r.g),
    gs: sumField(rows, (r) => r.gs),
    rec,
    tgt: sumField(rows, (r) => r.tgt),
    yds,
    td: sumField(rows, (r) => r.td),
    lng: maxField(rows, (r) => r.lng),
    firstDowns: sumField(rows, (r) => r.firstDowns),
    fumbles: sumField(rows, (r) => r.fumbles),
    ydsPerRec: ratePerUnit(yds, rec),
  };
}

function foldKicking(rows: FootballSeasonKicking[]): FootballSeasonKicking {
  return {
    ...rows[0],
    team: combinedTeamLabel(rows),
    g: sumField(rows, (r) => r.g),
    fgm: sumField(rows, (r) => r.fgm),
    fga: sumField(rows, (r) => r.fga),
    xpm: sumField(rows, (r) => r.xpm),
    xpa: sumField(rows, (r) => r.xpa),
  };
}

function foldDefenseIdp(
  rows: FootballSeasonDefenseIdp[],
): FootballSeasonDefenseIdp {
  return {
    ...rows[0],
    team: combinedTeamLabel(rows),
    g: sumField(rows, (r) => r.g),
    gs: sumField(rows, (r) => r.gs),
    soloTkl: sumField(rows, (r) => r.soloTkl),
    astTkl: sumField(rows, (r) => r.astTkl),
    totalTkl: sumField(rows, (r) => r.totalTkl),
    sacks: sumField(rows, (r) => r.sacks),
    int: sumField(rows, (r) => r.int),
    pd: sumField(rows, (r) => r.pd),
    ff: sumField(rows, (r) => r.ff),
    fr: sumField(rows, (r) => r.fr),
    defTd: sumField(rows, (r) => r.defTd),
    safeties: sumField(rows, (r) => r.safeties),
  };
}

function parseMainPageYear(row: Row): number | null {
  const year = parseIntCell(row, 'year_id');
  if (year === null) return null;
  if (year < 1960 || year > 2100) return null;
  return year;
}

function parseMainPageTeam(row: Row): string {
  return parseTeamCell(row, 'team_name_abbr') ?? '';
}

interface SkillSeasonRow {
  season: number;
  receiving: FootballSeasonReceiving | null;
  rushing: FootballSeasonRushing | null;
}

function parseMainPageSkillRow(
  row: Row,
  player: PfrPlayer,
): SkillSeasonRow | null {
  const season = parseMainPageYear(row);
  if (season === null) return null;
  const team = parseMainPageTeam(row);
  const g = parseIntCell(row, 'games');
  const fumbles = parseIntCell(row, 'fumbles');

  const gs = parseIntCell(row, 'games_started');

  const tgt = parseIntCell(row, 'targets');
  const rec = parseIntCell(row, 'rec');
  const recYds = parseIntCell(row, 'rec_yds');
  const receiving: FootballSeasonReceiving | null =
    tgt || rec
      ? {
          playerId: player.id,
          season,
          team,
          pfrRowId: `${season}`,
          g,
          gs,
          rec,
          tgt,
          yds: recYds,
          td: parseIntCell(row, 'rec_td'),
          lng: parseIntCell(row, 'rec_long'),
          firstDowns: parseIntCell(row, 'rec_first_down'),
          fumbles,
          ydsPerRec: parseFloatCell(row, 'rec_yds_per_rec'),
        }
      : null;

  const rushAtt = parseIntCell(row, 'rush_att');
  const rushing: FootballSeasonRushing | null = rushAtt
    ? {
        playerId: player.id,
        season,
        team,
        pfrRowId: `${season}`,
        g,
        gs,
        att: rushAtt,
        yds: parseIntCell(row, 'rush_yds'),
        td: parseIntCell(row, 'rush_td'),
        lng: parseIntCell(row, 'rush_long'),
        firstDowns: parseIntCell(row, 'rush_first_down'),
        fumbles,
        ydsPerAtt: parseFloatCell(row, 'rush_yds_per_att'),
      }
    : null;

  if (!receiving && !rushing) return null;
  return { season, receiving, rushing };
}

function parseMainPagePassingRow(
  row: Row,
  player: PfrPlayer,
): FootballSeasonPassing | null {
  const season = parseMainPageYear(row);
  if (season === null) return null;
  const att = parseIntCell(row, 'pass_att');
  if (!att) return null;
  return {
    playerId: player.id,
    season,
    team: parseMainPageTeam(row),
    pfrRowId: `${season}`,
    g: parseIntCell(row, 'games'),
    gs: parseIntCell(row, 'games_started'),
    cmp: parseIntCell(row, 'pass_cmp'),
    att,
    yds: parseIntCell(row, 'pass_yds'),
    td: parseIntCell(row, 'pass_td'),
    int: parseIntCell(row, 'pass_int'),
    firstDowns: parseIntCell(row, 'pass_first_down'),
    sacked: parseIntCell(row, 'pass_sacked'),
    sackYds: parseIntCell(row, 'pass_sacked_yds'),
    lng: parseIntCell(row, 'pass_long'),
    // PFR publishes the season passer rating directly on this table — read it
    // rather than recomputing, so it matches PFR's own displayed value.
    rating: parseFloatCell(row, 'pass_rating'),
  };
}

function parseMainPageKickingRow(
  row: Row,
  player: PfrPlayer,
): FootballSeasonKicking | null {
  const season = parseMainPageYear(row);
  if (season === null) return null;
  const fga = parseIntCell(row, 'fga');
  const xpa = parseIntCell(row, 'xpa');
  if (!fga && !xpa) return null;
  return {
    playerId: player.id,
    season,
    team: parseMainPageTeam(row),
    pfrRowId: `${season}`,
    g: parseIntCell(row, 'games'),
    fgm: parseIntCell(row, 'fgm'),
    fga,
    xpm: parseIntCell(row, 'xpm'),
    xpa,
  };
}

// Exported for unit testing against fixtures without a network call.
export function parseMainPageSeasonTotals(
  html: string,
  player: PfrPlayer,
): SeasonTotals[] {
  const root = htmlParser(html, { comment: true });

  const passingBySeason = new Map<number, FootballSeasonPassing>();
  const receivingBySeason = new Map<number, FootballSeasonReceiving>();
  const rushingBySeason = new Map<number, FootballSeasonRushing>();
  const kickingBySeason = new Map<number, FootballSeasonKicking>();

  const passingTable = getTable(root, 'passing');
  if (passingTable) {
    const rows = parseTableRows(passingTable, (r) =>
      parseMainPagePassingRow(r, player),
    );
    for (const [season, s] of combineBySeason(rows, foldPassing)) {
      passingBySeason.set(season, s);
    }
  }

  // PFR names the skill table by primary position — try both orderings.
  const skillTable =
    getTable(root, 'receiving_and_rushing') ??
    getTable(root, 'rushing_and_receiving');
  if (skillTable) {
    const rows = parseTableRows(skillTable, (r) =>
      parseMainPageSkillRow(r, player),
    );
    // The skill table interleaves two categories on one row; combine each
    // independently so a season that produced only one of them is unaffected.
    const receivingRows = rows
      .map((r) => r.receiving)
      .filter((r): r is FootballSeasonReceiving => r !== null);
    const rushingRows = rows
      .map((r) => r.rushing)
      .filter((r): r is FootballSeasonRushing => r !== null);

    for (const [season, s] of combineBySeason(receivingRows, foldReceiving)) {
      receivingBySeason.set(season, s);
    }
    for (const [season, s] of combineBySeason(rushingRows, foldRushing)) {
      rushingBySeason.set(season, s);
    }
  }

  const scoringTable = getTable(root, 'scoring');
  if (scoringTable) {
    const rows = parseTableRows(scoringTable, (r) =>
      parseMainPageKickingRow(r, player),
    );
    for (const [season, s] of combineBySeason(rows, foldKicking)) {
      kickingBySeason.set(season, s);
    }
  }

  const allSeasons = new Set<number>([
    ...passingBySeason.keys(),
    ...receivingBySeason.keys(),
    ...rushingBySeason.keys(),
    ...kickingBySeason.keys(),
  ]);

  if (allSeasons.size === 0) {
    LOGGER.info(`No season data found on main page for ${player.pfrId}`);
    return [];
  }

  LOGGER.info(
    `Main page for ${player.pfrId}: ${allSeasons.size} seasons ` +
      `(${passingBySeason.size} passing, ${rushingBySeason.size} rushing, ` +
      `${receivingBySeason.size} receiving, ${kickingBySeason.size} kicking)`,
  );

  return [...allSeasons]
    .sort((a, b) => a - b)
    .map((season) => ({
      passing: passingBySeason.get(season) ?? null,
      rushing: rushingBySeason.get(season) ?? null,
      receiving: receivingBySeason.get(season) ?? null,
      kicking: kickingBySeason.get(season) ?? null,
    }));
}

export async function getAllSeasonTotalsFromMainPage(
  player: PfrPlayer,
): Promise<SeasonTotals[]> {
  const html = await getPlayerPage(player.pfrId);
  return parseMainPageSeasonTotals(html, player);
}

// --- Main player page IDP (individual defensive player) season totals ---
// Mirrors the offensive main-page path (above) for defenders: the player's main
// PFR page carries a `defense` table with one row per season, so all career IDP
// season totals come back in a single HTTP request instead of one gamelog
// request per season (LS-7732, mirroring LS-7692).
//
// Stat gap vs. the per-season gamelog footer (IDPStats.getSeasonTotals): the
// gamelog `defense_gamelogs` table exposes a unified `def_td` column, but the
// main-page `defense` table splits defensive scores into interception-return
// (`def_int_td`) and fumble-return (`fumbles_rec_td`) columns. We reconstruct
// the combined `defTd` by summing the two, which reproduces the gamelog total.
// Every other IDP field (games, tackles, sacks, INT, PD, FF, FR, safeties) has a
// direct column on the main-page table, so no targeted gamelog fetch is needed.

// Sums two nullable int cells, returning null only when both cells are absent.
function sumIntCells(row: Row, statA: string, statB: string): number | null {
  const a = parseIntCell(row, statA);
  const b = parseIntCell(row, statB);
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function parseMainPageDefenseRow(
  row: Row,
  player: PfrPlayer,
): FootballSeasonDefenseIdp | null {
  const season = parseMainPageYear(row);
  if (season === null) return null;

  // PFR renders "missed season" rows (e.g. team cell = "Did not play - Injured
  // (knee)", "Suspended", "Retired") with the note text in the team column and
  // every stat cell blank. Unlike the offensive/kicking/skill parsers — which
  // only emit a record once a category actually produced — the defense record
  // is built from the year alone, so without this guard the note text lands in
  // `team`, every stat is blank, and the upsert fails. Because one bad row fails
  // the player's whole batch, the entire player loads zero defensive seasons
  // (LS-7755). A real defensive season always reports games played, so a row
  // with no games is a non-stat note row and is skipped — this is resilient to
  // the exact note wording.
  const g = parseIntCell(row, 'games');
  if (g === null) return null;

  const soloTkl = parseIntCell(row, 'tackles_solo');
  // PFR's live main-page defense table uses the plural `tackles_assists` —
  // not `tackles_assist` — confirmed against a live player page; the old
  // singular name silently matched nothing and left ast_tkl null on every row.
  const astTkl = parseIntCell(row, 'tackles_assists');
  // Prefer PFR's own combined column; fall back to solo+ast (matching the
  // gamelog-footer parser in IDPStats).
  const totalTkl =
    parseIntCell(row, 'tackles_combined') ??
    (soloTkl !== null && astTkl !== null ? soloTkl + astTkl : null);

  return {
    playerId: player.id,
    season,
    team: parseMainPageTeam(row),
    g,
    gs: parseIntCell(row, 'games_started'),
    soloTkl,
    astTkl,
    totalTkl,
    sacks: parseFloatCell(row, 'sacks'),
    int: parseIntCell(row, 'def_int'),
    pd: parseIntCell(row, 'pass_defended'),
    ff: parseIntCell(row, 'fumbles_forced'),
    fr: parseIntCell(row, 'fumbles_rec'),
    defTd: sumIntCells(row, 'def_int_td', 'fumbles_rec_td'),
    safeties: parseIntCell(row, 'safety_md'),
    pfrRowId: `${season}`,
  };
}

// Exported for unit testing against fixtures without a network call.
export function parseMainPageDefenseSeasonTotals(
  html: string,
  player: PfrPlayer,
): FootballSeasonDefenseIdp[] {
  const root = htmlParser(html, { comment: true });
  const table = getTable(root, 'defense');

  if (table === null) {
    LOGGER.info(`No defense table found on main page for ${player.pfrId}`);
    return [];
  }

  // One combined row per season — multi-team seasons are folded together
  // rather than resolved by row order (same convention as the offensive parser).
  const bySeason = combineBySeason(
    parseTableRows(table, (r) => parseMainPageDefenseRow(r, player)),
    foldDefenseIdp,
  );

  const seasons = [...bySeason.values()].sort((a, b) => a.season - b.season);

  LOGGER.info(
    `Main page for ${player.pfrId}: ${seasons.length} IDP defense seasons`,
  );

  return seasons;
}

export async function getAllDefenseSeasonTotalsFromMainPage(
  player: PfrPlayer,
): Promise<FootballSeasonDefenseIdp[]> {
  const html = await getPlayerPage(player.pfrId);
  return parseMainPageDefenseSeasonTotals(html, player);
}
