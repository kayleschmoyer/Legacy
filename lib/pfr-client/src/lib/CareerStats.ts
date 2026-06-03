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
  for (const game of games) {
    cmp += game.cmp ?? 0;
    att += game.att ?? 0;
    yds += game.yds ?? 0;
    td += game.td ?? 0;
    int += game.int ?? 0;
  }

  return {
    playerId: player.id,
    season,
    team,
    pfrRowId: `${season}`,
    g: games.length,
    cmp,
    att,
    yds,
    td,
    int,
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
  for (const game of games) {
    att += game.att ?? 0;
    yds += game.yds ?? 0;
    td += game.td ?? 0;
    fumbles += game.fumbles ?? 0;
  }

  return {
    playerId: player.id,
    season,
    team,
    pfrRowId: `${season}`,
    g: games.length,
    att,
    yds,
    td,
    fumbles,
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
  for (const game of games) {
    rec += game.rec ?? 0;
    tgt += game.tgt ?? 0;
    yds += game.yds ?? 0;
    td += game.td ?? 0;
    fumbles += game.fumbles ?? 0;
  }

  return {
    playerId: player.id,
    season,
    team,
    pfrRowId: `${season}`,
    g: games.length,
    rec,
    tgt,
    yds,
    td,
    fumbles,
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
// For multi-team seasons PFR places individual team rows first and the
// aggregate "2TM"/"3TM" row last — later map.set() calls overwrite earlier
// ones, so the aggregate row (with correct combined totals) always wins.

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

  const tgt = parseIntCell(row, 'targets');
  const rec = parseIntCell(row, 'rec');
  const receiving: FootballSeasonReceiving | null =
    tgt || rec
      ? {
          playerId: player.id,
          season,
          team,
          pfrRowId: `${season}`,
          g,
          rec,
          tgt,
          yds: parseIntCell(row, 'rec_yds'),
          td: parseIntCell(row, 'rec_td'),
          fumbles,
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
        att: rushAtt,
        yds: parseIntCell(row, 'rush_yds'),
        td: parseIntCell(row, 'rush_td'),
        fumbles,
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
    cmp: parseIntCell(row, 'pass_cmp'),
    att,
    yds: parseIntCell(row, 'pass_yds'),
    td: parseIntCell(row, 'pass_td'),
    int: parseIntCell(row, 'pass_int'),
    rating: null,
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
    parseTableRows(passingTable, (r) =>
      parseMainPagePassingRow(r, player),
    ).forEach((s) => passingBySeason.set(s.season, s));
  }

  // PFR names the skill table by primary position — try both orderings.
  const skillTable =
    getTable(root, 'receiving_and_rushing') ??
    getTable(root, 'rushing_and_receiving');
  if (skillTable) {
    parseTableRows(skillTable, (r) => parseMainPageSkillRow(r, player)).forEach(
      ({ season, receiving, rushing }) => {
        if (receiving) receivingBySeason.set(season, receiving);
        if (rushing) rushingBySeason.set(season, rushing);
      },
    );
  }

  const scoringTable = getTable(root, 'scoring');
  if (scoringTable) {
    parseTableRows(scoringTable, (r) =>
      parseMainPageKickingRow(r, player),
    ).forEach((s) => kickingBySeason.set(s.season, s));
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

  const soloTkl = parseIntCell(row, 'tackles_solo');
  const astTkl = parseIntCell(row, 'tackles_assist');
  // Prefer PFR's own combined column; fall back to solo+ast (matching the
  // gamelog-footer parser in IDPStats).
  const totalTkl =
    parseIntCell(row, 'tackles_combined') ??
    (soloTkl !== null && astTkl !== null ? soloTkl + astTkl : null);

  return {
    playerId: player.id,
    season,
    team: parseMainPageTeam(row),
    g: parseIntCell(row, 'games'),
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

  // One row per season: for multi-team seasons PFR emits individual team rows
  // first and the aggregate "2TM"/"3TM" row last, so the later map.set() wins
  // (same convention as the offensive parser).
  const bySeason = new Map<number, FootballSeasonDefenseIdp>();
  parseTableRows(table, (r) => parseMainPageDefenseRow(r, player)).forEach(
    (s) => bySeason.set(s.season, s),
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
