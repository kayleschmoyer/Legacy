import htmlParser from 'node-html-parser';
import { LOGGER } from '@legacy-sports/logging';
import { getTeamDefenseGameLog } from './PFRSession';
import {
  getCellText,
  getTable,
  parseFooterRow,
  parseGameIdentifier,
  parseGameNum,
  parseIntCell,
  parseTableRows,
} from './HtmlParser';
import type {
  FootballSeasonDefense,
  GameFootballDefense,
  PfrPlayer,
} from './types';

function parseDefenseGameRow(
  row: import('node-html-parser').HTMLElement,
  player: PfrPlayer,
): GameFootballDefense | null {
  const gameNum = parseGameNum(row);
  if (gameNum === null) return null;

  const gameIdentifier = parseGameIdentifier(row);
  if (!gameIdentifier) return null;

  // PFR team defense game log data-stat names for opponent (defensive) stats:
  // pts_off      → points scored by opponent (= pts_allowed for DST)
  // yds_off      → total yards by opponent
  // pass_yds_off → passing yards by opponent
  // rush_yds_off → rushing yards by opponent
  // sacks        → sacks recorded by this team's defense
  // def_int      → interceptions
  // fumbles_rec  → fumble recoveries
  // def_td       → defensive touchdowns
  // safety_md    → safeties

  return {
    playerId: player.id,
    season: 0, // caller fills in
    gameNum,
    gameIdentifier,
    sacks: parseIntCell(row, 'sacks'),
    int: parseIntCell(row, 'def_int'),
    fumRec: parseIntCell(row, 'fumbles_rec'),
    defTd: parseIntCell(row, 'def_td'),
    safeties: parseIntCell(row, 'safety_md'),
    ptsAllowed: parseIntCell(row, 'pts_off'),
    ydsAllowed: parseIntCell(row, 'yds_off'),
    passYdsAllowed: parseIntCell(row, 'pass_yds_off'),
    rushYdsAllowed: parseIntCell(row, 'rush_yds_off'),
  };
}

function parseDefenseSeasonRow(
  row: import('node-html-parser').HTMLElement,
  player: PfrPlayer,
  season: number,
  team: string,
): FootballSeasonDefense | null {
  const rowId = getCellText(row, 'ranker') ?? `${season}`;

  const sacks = parseIntCell(row, 'sacks');
  if (sacks === null && parseIntCell(row, 'def_int') === null) {
    return null;
  }

  return {
    playerId: player.id,
    season,
    team,
    pfrRowId: rowId,
    g: parseIntCell(row, 'game_count'),
    sacks,
    int: parseIntCell(row, 'def_int'),
    fumRec: parseIntCell(row, 'fumbles_rec'),
    defTd: parseIntCell(row, 'def_td'),
    safeties: parseIntCell(row, 'safety_md'),
  };
}

export async function getGameLog(
  player: PfrPlayer,
  nflTeam: string,
  season: number,
): Promise<GameFootballDefense[]> {
  const html = await getTeamDefenseGameLog(nflTeam, season);
  const root = htmlParser(html, { comment: true });

  // PFR team defense game log table id: typically 'games' or 'gamelog'
  const table =
    getTable(root, 'games') ??
    getTable(root, 'gamelog') ??
    getTable(root, 'defense');

  if (!table) {
    LOGGER.warn(
      `No defense game log table found for team ${nflTeam} season ${season}`,
    );
    return [];
  }

  const rows = parseTableRows(table, (r) => parseDefenseGameRow(r, player));

  const result = rows
    .map((r) => ({ ...r, season }))
    .filter((r) => r.gameNum > 0);

  LOGGER.info(
    `Loaded ${result.length} team defense games for ${nflTeam} ${season}`,
  );

  return result;
}

export async function getSeasonTotals(
  player: PfrPlayer,
  nflTeam: string,
  season: number,
): Promise<FootballSeasonDefense | null> {
  const html = await getTeamDefenseGameLog(nflTeam, season);
  const root = htmlParser(html, { comment: true });

  const table =
    getTable(root, 'games') ??
    getTable(root, 'gamelog') ??
    getTable(root, 'defense');

  if (!table) {
    LOGGER.warn(
      `No defense game log table for team ${nflTeam} season ${season}`,
    );
    return null;
  }

  return parseFooterRow(table, (r) =>
    parseDefenseSeasonRow(r, player, season, nflTeam.toUpperCase()),
  );
}
