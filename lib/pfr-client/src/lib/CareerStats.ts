import htmlParser from 'node-html-parser';
import { LOGGER } from '@legacy-sports/logging';
import { getPlayerGameLog } from './PFRSession';
import {
  getCellText,
  getTable,
  parseFloatCell,
  parseFooterRow,
  parseGameIdentifier,
  parseGameNum,
  parseIntCell,
  parseTableRows,
  parseTeamCell,
} from './HtmlParser';
import type {
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

// --- Passing ---

function parsePassingGameRow(
  row: import('node-html-parser').HTMLElement,
  player: PfrPlayer,
): GameFootballPassing | null {
  const gameNum = parseGameNum(row);
  if (gameNum === null) return null;

  const gameIdentifier = parseGameIdentifier(row);
  if (!gameIdentifier) return null;

  // Skip bye week / non-game rows (no game_date link)
  const team = parseTeamCell(row);
  if (!team) return null;

  return {
    playerId: player.id,
    season: 0, // caller fills in
    gameNum,
    gameIdentifier,
    cmp: parseIntCell(row, 'pass_cmp'),
    att: parseIntCell(row, 'pass_att'),
    yds: parseIntCell(row, 'pass_yds'),
    td: parseIntCell(row, 'pass_td'),
    int: parseIntCell(row, 'pass_int'),
    sacked: parseIntCell(row, 'pass_sacked'),
    sackYds: parseIntCell(row, 'pass_sacked_yds'),
    rating: parseFloatCell(row, 'pass_rating'),
  };
}

function parsePassingSeasonRow(
  row: import('node-html-parser').HTMLElement,
  player: PfrPlayer,
  season: number,
): FootballSeasonPassing | null {
  const team = parseTeamCell(row);
  if (!team) return null;

  const rowId = getCellText(row, 'ranker') ?? `${season}`;

  return {
    playerId: player.id,
    season,
    team,
    pfrRowId: rowId,
    g: parseIntCell(row, 'game_count'),
    cmp: parseIntCell(row, 'pass_cmp'),
    att: parseIntCell(row, 'pass_att'),
    yds: parseIntCell(row, 'pass_yds'),
    td: parseIntCell(row, 'pass_td'),
    int: parseIntCell(row, 'pass_int'),
    rating: parseFloatCell(row, 'pass_rating'),
  };
}

// --- Rushing ---

function parseRushingGameRow(
  row: import('node-html-parser').HTMLElement,
  player: PfrPlayer,
): GameFootballRushing | null {
  const gameNum = parseGameNum(row);
  if (gameNum === null) return null;

  const gameIdentifier = parseGameIdentifier(row);
  if (!gameIdentifier) return null;

  const team = parseTeamCell(row);
  if (!team) return null;

  return {
    playerId: player.id,
    season: 0,
    gameNum,
    gameIdentifier,
    att: parseIntCell(row, 'rush_att'),
    yds: parseIntCell(row, 'rush_yds'),
    td: parseIntCell(row, 'rush_td'),
    lng: parseIntCell(row, 'rush_long'),
    fumbles: parseIntCell(row, 'fumbles'),
  };
}

function parseRushingSeasonRow(
  row: import('node-html-parser').HTMLElement,
  player: PfrPlayer,
  season: number,
): FootballSeasonRushing | null {
  const team = parseTeamCell(row);
  if (!team) return null;

  const rowId = getCellText(row, 'ranker') ?? `${season}`;

  return {
    playerId: player.id,
    season,
    team,
    pfrRowId: rowId,
    g: parseIntCell(row, 'game_count'),
    att: parseIntCell(row, 'rush_att'),
    yds: parseIntCell(row, 'rush_yds'),
    td: parseIntCell(row, 'rush_td'),
    fumbles: parseIntCell(row, 'fumbles'),
  };
}

// --- Receiving ---

function parseReceivingGameRow(
  row: import('node-html-parser').HTMLElement,
  player: PfrPlayer,
): GameFootballReceiving | null {
  const gameNum = parseGameNum(row);
  if (gameNum === null) return null;

  const gameIdentifier = parseGameIdentifier(row);
  if (!gameIdentifier) return null;

  const team = parseTeamCell(row);
  if (!team) return null;

  return {
    playerId: player.id,
    season: 0,
    gameNum,
    gameIdentifier,
    rec: parseIntCell(row, 'rec'),
    tgt: parseIntCell(row, 'targets'),
    yds: parseIntCell(row, 'rec_yds'),
    td: parseIntCell(row, 'rec_td'),
    lng: parseIntCell(row, 'rec_long'),
    fumbles: parseIntCell(row, 'fumbles'),
  };
}

function parseReceivingSeasonRow(
  row: import('node-html-parser').HTMLElement,
  player: PfrPlayer,
  season: number,
): FootballSeasonReceiving | null {
  const team = parseTeamCell(row);
  if (!team) return null;

  const rowId = getCellText(row, 'ranker') ?? `${season}`;

  return {
    playerId: player.id,
    season,
    team,
    pfrRowId: rowId,
    g: parseIntCell(row, 'game_count'),
    rec: parseIntCell(row, 'rec'),
    tgt: parseIntCell(row, 'targets'),
    yds: parseIntCell(row, 'rec_yds'),
    td: parseIntCell(row, 'rec_td'),
    fumbles: parseIntCell(row, 'fumbles'),
  };
}

// --- Kicking ---

function parseKickingGameRow(
  row: import('node-html-parser').HTMLElement,
  player: PfrPlayer,
): GameFootballKicking | null {
  const gameNum = parseGameNum(row);
  if (gameNum === null) return null;

  const gameIdentifier = parseGameIdentifier(row);
  if (!gameIdentifier) return null;

  const team = parseTeamCell(row);
  if (!team) return null;

  return {
    playerId: player.id,
    season: 0,
    gameNum,
    gameIdentifier,
    fgm: parseIntCell(row, 'fgm'),
    fga: parseIntCell(row, 'fga'),
    fg019m: parseIntCell(row, 'fgm_0_19'),
    fg019a: parseIntCell(row, 'fga_0_19'),
    fg2029m: parseIntCell(row, 'fgm_20_29'),
    fg2029a: parseIntCell(row, 'fga_20_29'),
    fg3039m: parseIntCell(row, 'fgm_30_39'),
    fg3039a: parseIntCell(row, 'fga_30_39'),
    fg4049m: parseIntCell(row, 'fgm_40_49'),
    fg4049a: parseIntCell(row, 'fga_40_49'),
    fg50m: parseIntCell(row, 'fgm_50'),
    fg50a: parseIntCell(row, 'fga_50'),
    xpm: parseIntCell(row, 'xpm'),
    xpa: parseIntCell(row, 'xpa'),
    lng: parseIntCell(row, 'kick_long'),
  };
}

function parseKickingSeasonRow(
  row: import('node-html-parser').HTMLElement,
  player: PfrPlayer,
  season: number,
): FootballSeasonKicking | null {
  const team = parseTeamCell(row);
  if (!team) return null;

  const rowId = getCellText(row, 'ranker') ?? `${season}`;

  return {
    playerId: player.id,
    season,
    team,
    pfrRowId: rowId,
    g: parseIntCell(row, 'game_count'),
    fgm: parseIntCell(row, 'fgm'),
    fga: parseIntCell(row, 'fga'),
    xpm: parseIntCell(row, 'xpm'),
    xpa: parseIntCell(row, 'xpa'),
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

export async function getGameLog(
  player: PfrPlayer,
  season: number,
): Promise<GameLog> {
  const html = await getPlayerGameLog(player.pfrId, season);
  const root = htmlParser(html, { comment: true });

  const passingTable = getTable(root, 'passing_gamelogs');
  const rushingTable = getTable(root, 'rushing_gamelogs');
  const receivingTable = getTable(root, 'receiving_gamelogs');
  const kickingTable = getTable(root, 'kicking_gamelogs');

  const applySeasonAndFilter = <T extends { season: number; gameNum: number }>(
    rows: T[],
  ): T[] => rows.map((r) => ({ ...r, season })).filter((r) => r.gameNum > 0);

  const passing = applySeasonAndFilter(
    parseTableRows(passingTable, (r) => parsePassingGameRow(r, player)),
  );
  const rushing = applySeasonAndFilter(
    parseTableRows(rushingTable, (r) => parseRushingGameRow(r, player)),
  );
  const receiving = applySeasonAndFilter(
    parseTableRows(receivingTable, (r) => parseReceivingGameRow(r, player)),
  );
  const kicking = applySeasonAndFilter(
    parseTableRows(kickingTable, (r) => parseKickingGameRow(r, player)),
  );

  LOGGER.info(
    `Game log for ${player.pfrId} ${season}: ` +
      `${passing.length} passing, ${rushing.length} rushing, ` +
      `${receiving.length} receiving, ${kicking.length} kicking games`,
  );

  return { passing, rushing, receiving, kicking };
}

export async function getSeasonTotals(
  player: PfrPlayer,
  season: number,
): Promise<SeasonTotals> {
  const html = await getPlayerGameLog(player.pfrId, season);
  const root = htmlParser(html, { comment: true });

  const passingTable = getTable(root, 'passing_gamelogs');
  const rushingTable = getTable(root, 'rushing_gamelogs');
  const receivingTable = getTable(root, 'receiving_gamelogs');
  const kickingTable = getTable(root, 'kicking_gamelogs');

  return {
    passing: parseFooterRow(passingTable, (r) =>
      parsePassingSeasonRow(r, player, season),
    ),
    rushing: parseFooterRow(rushingTable, (r) =>
      parseRushingSeasonRow(r, player, season),
    ),
    receiving: parseFooterRow(receivingTable, (r) =>
      parseReceivingSeasonRow(r, player, season),
    ),
    kicking: parseFooterRow(kickingTable, (r) =>
      parseKickingSeasonRow(r, player, season),
    ),
  };
}
