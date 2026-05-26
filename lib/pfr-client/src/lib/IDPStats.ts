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
  FootballSeasonDefenseIdp,
  GameFootballDefenseIdp,
  PfrPlayer,
} from './types';

function parseIdpGameRow(
  row: import('node-html-parser').HTMLElement,
  player: PfrPlayer,
): GameFootballDefenseIdp | null {
  const gameNum = parseGameNum(row);
  if (gameNum === null) return null;

  // Skip bye week rows — they appear as empty stat rows with no box score link
  const gameIdentifier = parseGameIdentifier(row);
  if (!gameIdentifier) return null;

  const team = parseTeamCell(row);
  if (!team) return null;

  // PFR defensive game log data-stat names:
  // tackles_solo    → solo tackles
  // tackles_assist  → assisted tackles
  // sacks           → sacks (float, supports 0.5 half-sacks)
  // def_int         → interceptions
  // pass_defended   → passes defensed
  // fumbles_forced  → forced fumbles
  // fumbles_rec     → fumble recoveries
  // def_td          → defensive touchdowns
  // safety_md       → safeties

  return {
    playerId: player.id,
    season: 0, // caller fills in
    gameNum,
    gameIdentifier,
    soloTkl: parseIntCell(row, 'tackles_solo'),
    astTkl: parseIntCell(row, 'tackles_assist'),
    // sacks must be float — half-sacks (0.5) are valid PFR values
    sacks: parseFloatCell(row, 'sacks'),
    int: parseIntCell(row, 'def_int'),
    pd: parseIntCell(row, 'pass_defended'),
    ff: parseIntCell(row, 'fumbles_forced'),
    fr: parseIntCell(row, 'fumbles_rec'),
    defTd: parseIntCell(row, 'def_td'),
    safeties: parseIntCell(row, 'safety_md'),
  };
}

function parseIdpSeasonRow(
  row: import('node-html-parser').HTMLElement,
  player: PfrPlayer,
  season: number,
): FootballSeasonDefenseIdp | null {
  const team = parseTeamCell(row);
  if (!team) return null;

  const rowId = getCellText(row, 'ranker') ?? `${season}`;

  const soloTkl = parseIntCell(row, 'tackles_solo');
  const astTkl = parseIntCell(row, 'tackles_assist');
  const totalTkl =
    soloTkl !== null && astTkl !== null ? soloTkl + astTkl : null;

  return {
    playerId: player.id,
    season,
    team,
    g: parseIntCell(row, 'game_count'),
    gs: parseIntCell(row, 'games_started'),
    soloTkl,
    astTkl,
    totalTkl,
    sacks: parseFloatCell(row, 'sacks'),
    int: parseIntCell(row, 'def_int'),
    pd: parseIntCell(row, 'pass_defended'),
    ff: parseIntCell(row, 'fumbles_forced'),
    fr: parseIntCell(row, 'fumbles_rec'),
    defTd: parseIntCell(row, 'def_td'),
    safeties: parseIntCell(row, 'safety_md'),
    pfrRowId: rowId,
  };
}

export async function getGameLog(
  player: PfrPlayer,
  season: number,
): Promise<GameFootballDefenseIdp[]> {
  const html = await getPlayerGameLog(player.pfrId, season);
  const root = htmlParser(html, { comment: true });

  // Defensive player game logs appear in a table with id 'defense_gamelogs'
  // on the same page as offensive stats for versatile players.
  const table = getTable(root, 'defense_gamelogs');

  if (!table) {
    LOGGER.debug(
      `No IDP game log table found for ${player.pfrId} ${season} — player may not be a defender`,
    );
    return [];
  }

  const rows = parseTableRows(table, (r) => parseIdpGameRow(r, player));

  const result = rows
    .map((r) => ({ ...r, season }))
    .filter((r) => r.gameNum > 0);

  LOGGER.info(
    `Loaded ${result.length} IDP game log rows for ${player.pfrId} ${season}`,
  );

  return result;
}

export async function getSeasonTotals(
  player: PfrPlayer,
  season: number,
): Promise<FootballSeasonDefenseIdp | null> {
  const html = await getPlayerGameLog(player.pfrId, season);
  const root = htmlParser(html, { comment: true });

  const table = getTable(root, 'defense_gamelogs');

  if (!table) {
    LOGGER.debug(`No IDP game log table for ${player.pfrId} ${season}`);
    return null;
  }

  return parseFooterRow(table, (r) => parseIdpSeasonRow(r, player, season));
}
