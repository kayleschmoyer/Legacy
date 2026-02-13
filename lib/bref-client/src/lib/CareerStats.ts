import htmlParser, { HTMLElement } from 'node-html-parser';
import { LOGGER } from '@legacy-sports/logging';
import {
  GameBatting,
  GameFielding,
  GamePitching,
  Player,
  SeasonBatting,
  SeasonFielding,
  SeasonPitching,
} from '@legacy-sports/db-client';
import {
  getCareerStats as getCareerStatsFromBref,
  getGameStats,
} from './BRefSession';
import { getTable, getTableBody, RowParser } from './HtmlParser';

// Custom error type for detailed debugging information
interface ErrorWithDetails extends Error {
  details?: {
    brefId: string;
    season?: number;
    gameNumber?: number;
    url: string;
    tableIds: (string | undefined)[];
    htmlPreview: string;
    htmlLength: number;
  };
}

const GAME_IDENTIFIER_GROUP = 'gameIdentifier';
const GAME_IDENTIFIER_REGEX = new RegExp(
  `^\\/boxes\\/\\w{3}\\/(?<${GAME_IDENTIFIER_GROUP}>\\w{12}).shtml$`,
);

const StatMapping: Record<
  string,
  keyof SeasonBatting | keyof SeasonFielding | keyof SeasonPitching
> = {
  // Batting stats - with b_ prefix
  B_GAMES: 'g',
  B_PA: 'pa',
  B_AB: 'ab',
  B_R: 'r',
  B_H: 'h',
  B_DOUBLES: 'doubles',
  B_TRIPLES: 'triples',
  B_HR: 'hr',
  B_RBI: 'rbi',
  B_SB: 'sb',
  B_CS: 'cs',
  B_BB: 'bb',
  B_SO: 'so',
  B_BATTING_AVG: 'battingAvg',
  B_ONBASE_PERC: 'onbasePerc',
  B_SLUGGING_PERC: 'sluggingPerc',
  B_ONBASE_PLUS_SLUGGING: 'onbasePlusSlugging',
  B_ONBASE_PLUS_SLUGGING_PLUS: 'onbasePlusSluggingPlus',
  B_TB: 'tb',
  B_GIDP: 'gidp',
  B_HBP: 'hbp',
  B_SH: 'sh',
  B_SF: 'sf',
  B_IBB: 'ibb',

  // Season/year field
  YEAR_ID: 'season',

  // Team field
  TEAM_NAME_ABBR: 'team',

  // Fielding fields (with f_ prefix from Baseball Reference)
  F_POSITION: 'pos',
  F_GAMES: 'g',
  F_GAMES_STARTED: 'gs',
  F_INNINGS: 'innDef',
  F_CHANCES: 'chances',
  F_PO: 'po',
  F_ASSISTS: 'a',
  F_ERRORS: 'eDef',
  F_DP: 'dpDef',
  F_FIELDING_PERC: 'fieldingPerc',

  // Pitching fields (with p_ prefix from Baseball Reference)
  P_W: 'w',
  P_L: 'l',
  P_WIN_LOSS_PERC: 'winLossPerc',
  P_EARNED_RUN_AVG: 'earnedRunAvg',
  P_G: 'g',
  P_GS: 'gs',
  P_GF: 'gf',
  P_CG: 'cg',
  P_SHO: 'sho',
  P_SV: 'sv',
  P_IP: 'ip',
  P_H: 'h',
  P_R: 'r',
  P_ER: 'er',
  P_HR: 'hr',
  P_BB: 'bb',
  P_IBB: 'ibb',
  P_SO: 'so',
  P_HBP: 'hbp',
  P_BK: 'bk',
  P_WP: 'wp',
  P_BFP: 'battersFaced',
  P_EARNED_RUN_AVG_PLUS: 'earnedRunAvgPlus',
  P_FIP: 'fip',
  P_WHIP: 'whip',
  P_HITS_PER_NINE: 'hitsPerNine',
  P_HR_PER_NINE: 'homeRunsPerNine',
  P_BB_PER_NINE: 'basesOnBallsPerNine',
  P_SO_PER_NINE: 'strikeoutsPerNine',
  P_STRIKEOUTS_PER_BASE_ON_BALLS: 'strikeoutsPerBaseOnBalls',

  // Legacy mappings (keeping for backwards compatibility)
  '2B': 'doubles',
  '3B': 'triples',
  A: 'a',
  AB: 'ab',
  AWARD_SUMMARY: 'awardSummary',
  BASES_ON_BALLS_PER_NINE: 'basesOnBallsPerNine',
  BATTERS_FACED: 'battersFaced',
  BATTING_AVG: 'battingAvg',
  BB: 'bb',
  BK: 'bk',
  CAUGHT_STEALING_PERC: 'caughtStealingPerc',
  CAUGHT_STEALING_PERC_LG: 'caughtStealingPercLg',
  CG: 'cg',
  CHANCES: 'chances',
  CS: 'cs',
  DP_DEF: 'dpDef',
  EARNED_RUN_AVG: 'earnedRunAvg',
  EARNED_RUN_AVG_PLUS: 'earnedRunAvgPlus',
  ER: 'er',
  E_DEF: 'eDef',
  FIELDING_PERC: 'fieldingPerc',
  FIELDING_PERC_LG: 'fieldingPercLg',
  FIP: 'fip',
  G: 'g',
  GF: 'gf',
  GIDP: 'gidp',
  GS: 'gs',
  G_OF_PARTS: 'gOfParts',
  H: 'h',
  HBP: 'hbp',
  HITS_PER_NINE: 'hitsPerNine',
  HOME_RUNS_PER_NINE: 'homeRunsPerNine',
  HR: 'hr',
  IBB: 'ibb',
  INN_DEF: 'innDef',
  IP: 'ip',
  L: 'l',
  LG_ID: 'lgId',
  COMP_NAME_ABBR: 'lgId',
  ONBASE_PERC: 'onbasePerc',
  ONBASE_PLUS_SLUGGING: 'onbasePlusSlugging',
  ONBASE_PLUS_SLUGGING_PLUS: 'onbasePlusSluggingPlus',
  PA: 'pa',
  PICKOFFS: 'pickoffs',
  PO: 'po',
  POS: 'pos',
  POS_SEASON: 'posSeason',
  R: 'r',
  RANGE_FACTOR_PER_GAME: 'rangeFactorPerGame',
  RANGE_FACTOR_PER_GAME_LG: 'rangeFactorPerGameLg',
  RANGE_FACTOR_PER_NINE: 'rangeFactorPerNine',
  RANGE_FACTOR_PER_NINE_LG: 'rangeFactorPerNineLg',
  RBI: 'rbi',
  SB: 'sb',
  SF: 'sf',
  SH: 'sh',
  SHO: 'sho',
  SLUGGING_PERC: 'sluggingPerc',
  SO: 'so',
  STRIKEOUTS_PER_BASE_ON_BALLS: 'strikeoutsPerBaseOnBalls',
  STRIKEOUTS_PER_NINE: 'strikeoutsPerNine',
  SV: 'sv',
  TB: 'tb',
  TEAM_ID: 'team',
  W: 'w',
  WHIP: 'whip',
  WIN_LOSS_PERC: 'winLossPerc',
  WP: 'wp',
};

const NUMERIC_STATS = Object.freeze(
  new Set<keyof SeasonBatting | keyof SeasonFielding | keyof SeasonPitching>([
    'a',
    'ab',
    'battersFaced',
    'bb',
    'bk',
    'cg',
    'chances',
    'cs',
    'doubles',
    'dpDef',
    'eDef',
    'er',
    'g',
    'gf',
    'gidp',
    'gs',
    'h',
    'hbp',
    'hr',
    'ibb',
    'innDef',
    'ip',
    'l',
    'pa',
    'pickoffs',
    'po',
    'r',
    'rbi',
    'sb',
    'sh',
    'sho',
    'so',
    'sv',
    'tb',
    'triples',
    'w',
    'wp',
  ]),
);

function parseRow<T extends object>(
  row: HTMLElement,
  playerId: number,
): T | null {
  const headers = row.getElementsByTagName('th');
  const cols = row.getElementsByTagName('td');

  const allCells = headers.concat(cols);

  const yearCell = allCells.find(
    (c) => c.getAttribute('data-stat') === 'year_id',
  );

  const rowId = yearCell?.getAttribute('csk');

  const stats: T = {
    playerId: playerId,
    rowId: !rowId ? yearCell?.text : rowId,
  } as T;

  // Debug: Log all found data-stat attributes
  const foundStats = allCells
    .map((col) => col.getAttribute('data-stat'))
    .filter((stat) => stat !== undefined);
  LOGGER.debug(`Found data-stat attributes: ${foundStats.join(', ')}`);

  for (const col of allCells) {
    const stat = col.getAttribute('data-stat');

    if (stat === undefined) {
      continue;
    }

    const text = col.text.trim();

    const statField = StatMapping[stat.toUpperCase()];

    if (!statField) {
      LOGGER.debug(`Skipping field ${stat} (text: '${text}')`);
      continue;
    } else {
      LOGGER.debug(`Mapping field ${stat} (text: '${text}') -> ${statField}`);
    }

    let value: string | number | null = text === '' ? null : text;

    if (NUMERIC_STATS.has(statField) && value !== null) {
      if (value === 'inf') {
        value = null;
      } else {
        value = parseFloat(text);

        if (isNaN(value)) {
          throw new Error(
            `Unable to parse field ${String(
              statField,
            )}: ${text} is not a number`,
          );
        }
      }
    }

    Object.assign(stats, {
      [statField]: value,
    });
  }

  if (!('team' in stats) || stats.team === null || stats.team === 'TOT') {
    return null;
  }

  return stats;
}

export function parseTable<T extends object>(
  table: HTMLElement | null,
  parser: RowParser<T>,
): T[] {
  if (table === null) {
    return [];
  }

  const body = getTableBody(table);

  if (body === undefined) {
    return [];
  }

  const result: T[] = [];

  for (const row of body.getElementsByTagName('tr')) {
    const record = parser(row);
    if (record !== null) {
      result.push(record);
    }
  }

  return result;
}

function getBattingStats(root: HTMLElement, playerId: number): SeasonBatting[] {
  const battingStats = getTable(root, 'players_standard_batting');
  const allStats = parseTable<SeasonBatting>(battingStats, (r) => {
    const s = parseRow<SeasonBatting & { pos?: string }>(r, playerId);

    if (s !== null) {
      // Remove the position field, the batting stats pos looks like 9H/8
      delete s['pos'];
    }

    return s;
  });

  // Filter out records where g (games) is null ("Did not play" records)
  return allStats.filter((stat) => {
    return (
      stat.g != null &&
      stat.g !== undefined &&
      stat.team != null &&
      stat.team !== undefined &&
      stat.team.trim() !== '' &&
      stat.rowId != null &&
      stat.rowId !== undefined &&
      stat.rowId.trim() !== ''
    );
  });
}

function getFieldingStats(
  root: HTMLElement,
  playerId: number,
): SeasonFielding[] {
  const fieldingStats = getTable(root, 'players_standard_fielding');
  const allStats = parseTable<SeasonFielding>(fieldingStats, (r) =>
    parseRow(r, playerId),
  );

  // Filter out records where pos is null, undefined, or empty (e.g., "Did not play" records)
  return allStats.filter((stat) => {
    return (
      stat.pos != null &&
      stat.pos !== undefined &&
      stat.pos !== '' &&
      stat.pos.trim() !== '' &&
      stat.team != null &&
      stat.team !== undefined &&
      stat.team.trim() !== '' &&
      stat.rowId != null &&
      stat.rowId !== undefined &&
      stat.rowId.trim() !== ''
    );
  });
}

function getPitchingStats(
  root: HTMLElement,
  playerId: number,
): SeasonPitching[] {
  const pitchingStats = getTable(root, 'players_standard_pitching');
  const allStats = parseTable<SeasonPitching>(pitchingStats, (r) =>
    parseRow(r, playerId),
  );

  // Filter out records where g (games) is null ("Did not play" records)
  return allStats.filter((stat) => {
    return (
      stat.g != null &&
      stat.g !== undefined &&
      stat.team != null &&
      stat.team !== undefined &&
      stat.team.trim() !== '' &&
      stat.rowId != null &&
      stat.rowId !== undefined &&
      stat.rowId.trim() !== ''
    );
  });
}

export interface CareerStats {
  batting: SeasonBatting[];
  pitching: SeasonPitching[];
  fielding: SeasonFielding[];
}

export async function getCareerStats(player: Player): Promise<CareerStats> {
  const html = await getCareerStatsFromBref(player.brefId);
  const root = htmlParser(html, {
    comment: true,
  });

  return {
    batting: getBattingStats(root, player.id),
    fielding: getFieldingStats(root, player.id),
    pitching: getPitchingStats(root, player.id),
  };
}

export async function getGameBattingStats(
  player: Player,
  season: number,
  gameNumber: number,
): Promise<GameBatting | null> {
  const data = await getGameStats(player.brefId, 'b', season);
  const root = htmlParser(data);

  // Baseball Reference changed table ID from 'batting_gamelogs' to 'players_standard_batting'
  const table = getTable(root, 'players_standard_batting');

  if (table === null) {
    // Log details about what we got back to help debug
    const allTables = root
      .getElementsByTagName('table')
      .map((t) => t.getAttribute('id'));
    const bodyPreview = data.substring(0, 500);
    const error: ErrorWithDetails = new Error(
      'Could not find Game Batting Stats table',
    );
    error.details = {
      brefId: player.brefId,
      season,
      gameNumber,
      url: `https://www.baseball-reference.com/players/gl.fcgi?id=${player.brefId}&t=b&year=${season}`,
      tableIds: allTables,
      htmlPreview: bodyPreview,
      htmlLength: data.length,
    };
    throw error;
  }

  const gameRow = table.getElementsByTagName('tr').find((row) => {
    const rankerCell = row
      .getElementsByTagName('th')
      .find((c) => c.getAttribute('data-stat') === 'ranker');

    return rankerCell?.text === gameNumber.toString();
  });

  if (!gameRow) {
    // Player may not have played this specific game (injury, rest, etc.)
    LOGGER.debug(
      `No game record found for player ${player.brefId} game ${gameNumber} in ${season}`,
    );
    return null;
  }

  const result = parseRow<GameBatting>(gameRow, player.id);

  if (result === null) {
    return null;
  }

  const identifierCell = gameRow
    .getElementsByTagName('td')
    .find((cell) => cell.getAttribute('data-stat') === 'date_game');

  const link = identifierCell
    ?.getElementsByTagName('a')[0]
    ?.getAttribute('href');

  const match = link?.match(GAME_IDENTIFIER_REGEX);

  if (!match?.groups?.[GAME_IDENTIFIER_GROUP]) {
    throw new Error(
      `Failed to parse game_identifier from fielding box score link: ${link ?? 'no link found'} (game ${gameNumber})`,
    );
  }
  result.gameIdentifier = match.groups[GAME_IDENTIFIER_GROUP];
  result.season = season;
  result.gameNum = gameNumber;

  return result;
}

/**
 * Get ALL game fielding stats for a player in a season at a specific position.
 * Parses every row in the game log table for that position.
 * Returns empty array if player has no fielding stats at that position.
 */
export async function getAllGameFieldingStats(
  player: Player,
  season: number,
  pos: string,
): Promise<GameFielding[]> {
  // Handle null/undefined position (e.g., pitchers without fielding stats)
  if (!pos || pos === null || pos === undefined) {
    LOGGER.debug(
      `No position provided for player ${player.brefId} season ${season} - returning empty array`,
    );
    return [];
  }

  const data = await getGameStats(player.brefId, 'f', season);

  const root = htmlParser(data, { comment: true });

  let tableId: string;

  switch (pos.trim()) {
    case 'P':
      tableId = '_1';
      break;
    case 'C':
      tableId = '_2';
      break;
    case '1B':
      tableId = '_3';
      break;
    case '2B':
      tableId = '_4';
      break;
    case '3B':
      tableId = '_5';
      break;
    case 'SS':
      tableId = '_6';
      break;
    case 'LF':
      tableId = '_7';
      break;
    case 'CF':
      tableId = '_8';
      break;
    case 'RF':
      tableId = '_9';
      break;
    case 'DH':
    case 'XX':
    case 'OF':
    case 'PH':
    case 'PR':
      // DH (Designated Hitter), XX (Unknown), OF (Outfield), PH (Pinch Hitter), PR (Pinch Runner)
      // These positions don't have separate fielding tables on Baseball Reference
      LOGGER.debug(
        `Position ${pos} does not have fielding stats tables on Baseball Reference`,
      );
      return [];
    default:
      // Log warning but don't throw - return empty array gracefully
      LOGGER.warn(
        `Unknown position: ${pos} for player ${player.brefId} - returning empty array for fielding stats`,
      );
      return [];
  }

  const table = getTable(root, tableId);

  if (table === null) {
    // Player may not have fielding stats at this position for this season
    LOGGER.debug(
      `No fielding stats table found for player ${player.brefId} at position ${pos} in ${season}`,
    );
    return [];
  }

  const allRows = table.getElementsByTagName('tr');
  const results: GameFielding[] = [];

  for (const gameRow of allRows) {
    // Skip header rows and rows without game number
    const rankerCell = gameRow
      .getElementsByTagName('th')
      .find((c) => c.getAttribute('data-stat') === 'ranker');

    const gameNumberText = rankerCell?.text;
    if (!gameNumberText || gameNumberText === 'Rk') {
      continue;
    }

    const gameNumber = parseInt(gameNumberText, 10);
    if (isNaN(gameNumber)) {
      continue;
    }

    const result = parseRow<GameFielding>(gameRow, player.id);
    if (result === null) {
      continue;
    }

    const identifierCell = gameRow
      .getElementsByTagName('td')
      .find((cell) => cell.getAttribute('data-stat') === 'date_game');

    const link = identifierCell
      ?.getElementsByTagName('a')[0]
      ?.getAttribute('href');

    const match = link?.match(GAME_IDENTIFIER_REGEX);

    if (!match?.groups?.[GAME_IDENTIFIER_GROUP]) {
      throw new Error(
        `Failed to parse game_identifier from fielding box score link: ${link ?? 'no link found'} (game ${gameNumber}, player ${player.brefId}, season ${season})`,
      );
    }
    result.gameIdentifier = match.groups[GAME_IDENTIFIER_GROUP];
    result.season = season;
    result.gameNum = gameNumber;

    results.push(result);
  }

  LOGGER.info(
    `Loaded ${results.length} fielding games for player ${player.brefId} season ${season} position ${pos}`,
  );
  return results;
}

/**
 * Get ALL game batting stats for a player in a season.
 * Parses every row in the game log table, returning an array of all games.
 * This is much more efficient than calling getGameBattingStats() 162 times.
 */
export async function getAllGameBattingStats(
  player: Player,
  season: number,
): Promise<GameBatting[]> {
  const data = await getGameStats(player.brefId, 'b', season);
  const root = htmlParser(data);

  const table = getTable(root, 'players_standard_batting');

  if (table === null) {
    const allTables = root
      .getElementsByTagName('table')
      .map((t) => t.getAttribute('id'));
    const bodyPreview = data.substring(0, 500);
    const error: ErrorWithDetails = new Error(
      'Could not find Game Batting Stats table',
    );
    error.details = {
      brefId: player.brefId,
      season,
      url: `https://www.baseball-reference.com/players/gl.fcgi?id=${player.brefId}&t=b&year=${season}`,
      tableIds: allTables,
      htmlPreview: bodyPreview,
      htmlLength: data.length,
    };
    throw error;
  }

  const allRows = table.getElementsByTagName('tr');
  const results: GameBatting[] = [];

  for (const gameRow of allRows) {
    // Skip header rows and rows without game number
    const rankerCell = gameRow
      .getElementsByTagName('th')
      .find((c) => c.getAttribute('data-stat') === 'ranker');

    const gameNumberText = rankerCell?.text;
    if (!gameNumberText || gameNumberText === 'Rk') {
      continue;
    }

    const gameNumber = parseInt(gameNumberText, 10);
    if (isNaN(gameNumber)) {
      continue;
    }

    const result = parseRow<GameBatting>(gameRow, player.id);
    if (result === null) {
      continue;
    }

    const identifierCell = gameRow
      .getElementsByTagName('td')
      .find((cell) => cell.getAttribute('data-stat') === 'date');

    const link = identifierCell
      ?.getElementsByTagName('a')[0]
      ?.getAttribute('href');

    const match = link?.match(GAME_IDENTIFIER_REGEX);

    if (!match?.groups?.[GAME_IDENTIFIER_GROUP]) {
      throw new Error(
        `Failed to parse game_identifier from batting box score link: ${link ?? 'no link found'} (game ${gameNumber}, player ${player.brefId}, season ${season})`,
      );
    }
    result.gameIdentifier = match.groups[GAME_IDENTIFIER_GROUP];
    result.season = season;
    result.gameNum = gameNumber;

    results.push(result);
  }

  LOGGER.info(
    `Loaded ${results.length} batting games for player ${player.brefId} season ${season}`,
  );
  return results;
}

export async function getGamePitchingStats(
  player: Player,
  season: number,
  gameNumber: number,
): Promise<GamePitching | null> {
  const data = await getGameStats(player.brefId, 'p', season);
  const root = htmlParser(data);

  // Baseball Reference changed table ID from 'pitching_gamelogs' to 'players_standard_pitching'
  const table = getTable(root, 'players_standard_pitching');

  if (table === null) {
    // Position players don't have pitching stats - this is expected, not an error
    LOGGER.debug(
      `No pitching stats table found for player ${player.brefId} in ${season} - likely a position player`,
    );
    return null;
  }

  const gameRow = table.getElementsByTagName('tr').find((row) => {
    const rankerCell = row
      .getElementsByTagName('th')
      .find((c) => c.getAttribute('data-stat') === 'ranker');

    return rankerCell?.text === gameNumber.toString();
  });

  if (!gameRow) {
    // Pitcher may not have pitched in this specific game
    LOGGER.debug(
      `No game record found for pitcher ${player.brefId} game ${gameNumber} in ${season}`,
    );
    return null;
  }

  const result = parseRow<GamePitching>(gameRow, player.id);

  if (result === null) {
    return null;
  }

  const cells = gameRow.getElementsByTagName('td');

  const identifierCell = cells.find(
    (cell) => cell.getAttribute('data-stat') === 'date',
  );

  const link = identifierCell
    ?.getElementsByTagName('a')[0]
    ?.getAttribute('href');

  const match = link?.match(GAME_IDENTIFIER_REGEX);

  if (!match?.groups?.[GAME_IDENTIFIER_GROUP]) {
    throw new Error(
      `Failed to parse game_identifier from pitching box score link: ${link ?? 'no link found'} (game ${gameNumber})`,
    );
  }
  result.gameIdentifier = match.groups[GAME_IDENTIFIER_GROUP];
  result.season = season;
  result.gameNum = gameNumber;

  // Pitching specific stat parsing
  const decision =
    cells.find(
      (cell) => cell.getAttribute('data-stat') === 'player_game_result',
    )?.text || '';

  if (decision.includes('BW') || decision.startsWith('W')) {
    result.w = 1;
  }

  if (decision.includes('BL') || decision.startsWith('L')) {
    result.l = 1;
  }

  if (decision.startsWith('S')) {
    result.sv = 1;
  }

  const gameSpan =
    cells.find((cell) => cell.getAttribute('data-stat') === 'player_game_span')
      ?.text || '';

  if (gameSpan.includes('GS')) {
    result.gs = 1;
  } else if (gameSpan.includes('GF')) {
    result.gf = 1;
  } else if (gameSpan.includes('CG')) {
    result.gs = 1;
    result.gf = 1;
    result.cg = 1;
  } else if (gameSpan.includes('SHO')) {
    result.gs = 1;
    result.gf = 1;
    result.cg = 1;
    result.sho = 1;
  }

  return result;
}

/**
 * Get ALL game pitching stats for a player in a season.
 * Parses every row in the game log table, returning an array of all games.
 * Returns empty array if player has no pitching stats (position player).
 */
export async function getAllGamePitchingStats(
  player: Player,
  season: number,
): Promise<GamePitching[]> {
  const data = await getGameStats(player.brefId, 'p', season);
  const root = htmlParser(data);

  const table = getTable(root, 'players_standard_pitching');

  if (table === null) {
    // Position players don't have pitching stats - this is expected
    LOGGER.debug(
      `No pitching stats table found for player ${player.brefId} in ${season} - likely a position player`,
    );
    return [];
  }

  const allRows = table.getElementsByTagName('tr');
  const results: GamePitching[] = [];

  for (const gameRow of allRows) {
    // Skip header rows and rows without game number
    const rankerCell = gameRow
      .getElementsByTagName('th')
      .find((c) => c.getAttribute('data-stat') === 'ranker');

    const gameNumberText = rankerCell?.text;
    if (!gameNumberText || gameNumberText === 'Rk') {
      continue;
    }

    const gameNumber = parseInt(gameNumberText, 10);
    if (isNaN(gameNumber)) {
      continue;
    }

    const result = parseRow<GamePitching>(gameRow, player.id);
    if (result === null) {
      continue;
    }

    const cells = gameRow.getElementsByTagName('td');

    const identifierCell = cells.find(
      (cell) => cell.getAttribute('data-stat') === 'date',
    );

    const link = identifierCell
      ?.getElementsByTagName('a')[0]
      ?.getAttribute('href');

    const match = link?.match(GAME_IDENTIFIER_REGEX);

    if (!match?.groups?.[GAME_IDENTIFIER_GROUP]) {
      throw new Error(
        `Failed to parse game_identifier from pitching box score link: ${link ?? 'no link found'} (game ${gameNumber}, player ${player.brefId}, season ${season})`,
      );
    }
    result.gameIdentifier = match.groups[GAME_IDENTIFIER_GROUP];
    result.season = season;
    result.gameNum = gameNumber;

    // Pitching specific stat parsing
    const decision =
      cells.find(
        (cell) => cell.getAttribute('data-stat') === 'player_game_result',
      )?.text || '';

    if (decision.includes('BW') || decision.startsWith('W')) {
      result.w = 1;
    }

    if (decision.includes('BL') || decision.startsWith('L')) {
      result.l = 1;
    }

    if (decision.startsWith('S')) {
      result.sv = 1;
    }

    const gameSpan =
      cells.find(
        (cell) => cell.getAttribute('data-stat') === 'player_game_span',
      )?.text || '';

    if (gameSpan.includes('GS')) {
      result.gs = 1;
    } else if (gameSpan.includes('GF')) {
      result.gf = 1;
    } else if (gameSpan.includes('CG')) {
      result.gs = 1;
      result.gf = 1;
      result.cg = 1;
    } else if (gameSpan.includes('SHO')) {
      result.gs = 1;
      result.gf = 1;
      result.cg = 1;
      result.sho = 1;
    }

    results.push(result);
  }

  LOGGER.info(
    `Loaded ${results.length} pitching games for player ${player.brefId} season ${season}`,
  );
  return results;
}

export async function getGameFieldingStats(
  player: Player,
  season: number,
  gameNumber: number,
  pos: string,
): Promise<GameFielding | null> {
  // Handle null/undefined position (e.g., pitchers without fielding stats)
  if (!pos || pos === null || pos === undefined) {
    LOGGER.debug(
      `No position provided for player ${player.brefId} game ${gameNumber} season ${season} - returning null`,
    );
    return null;
  }

  const data = await getGameStats(player.brefId, 'f', season);

  const root = htmlParser(data, { comment: true });

  let tableId: string;

  switch (pos.trim()) {
    case 'P':
      tableId = '_1';
      break;
    case 'C':
      tableId = '_2';
      break;
    case '1B':
      tableId = '_3';
      break;
    case '2B':
      tableId = '_4';
      break;
    case '3B':
      tableId = '_5';
      break;
    case 'SS':
      tableId = '_6';
      break;
    case 'LF':
      tableId = '_7';
      break;
    case 'CF':
      tableId = '_8';
      break;
    case 'RF':
      tableId = '_9';
      break;
    case 'DH':
    case 'XX':
    case 'OF':
    case 'PH':
    case 'PR':
      // DH (Designated Hitter), XX (Unknown), OF (Outfield), PH (Pinch Hitter), PR (Pinch Runner)
      // These positions don't have separate fielding tables on Baseball Reference
      LOGGER.debug(
        `Position ${pos} does not have fielding stats tables on Baseball Reference`,
      );
      return null;
    default:
      // Log warning but don't throw - return null gracefully
      LOGGER.warn(
        `Unknown position: ${pos} for player ${player.brefId} - returning null for fielding stats`,
      );
      return null;
  }

  const table = getTable(root, tableId);

  if (table === null) {
    // Player may not have fielding stats at this position for this season
    // Baseball Reference may have also changed their table structure
    LOGGER.debug(
      `No fielding stats table found for player ${player.brefId} at position ${pos} in ${season}`,
    );
    return null;
  }

  const gameRow = table.getElementsByTagName('tr').find((row) => {
    const rankerCell = row
      .getElementsByTagName('th')
      .find((c) => c.getAttribute('data-stat') === 'ranker');

    return rankerCell?.text === gameNumber.toString();
  });

  if (!gameRow) {
    // Player may not have fielded at this position in this specific game
    LOGGER.debug(
      `No fielding record found for player ${player.brefId} game ${gameNumber} in ${season}`,
    );
    return null;
  }

  const result = parseRow<GameFielding>(gameRow, player.id);

  if (result === null) {
    return null;
  }

  const identifierCell = gameRow
    .getElementsByTagName('td')
    .find((cell) => cell.getAttribute('data-stat') === 'date');

  const link = identifierCell
    ?.getElementsByTagName('a')[0]
    ?.getAttribute('href');

  const match = link?.match(GAME_IDENTIFIER_REGEX);

  if (!match?.groups?.[GAME_IDENTIFIER_GROUP]) {
    throw new Error(
      `Failed to parse game_identifier from fielding box score link: ${link ?? 'no link found'} (game ${gameNumber}, player ${player.brefId})`,
    );
  }
  result.gameIdentifier = match.groups[GAME_IDENTIFIER_GROUP];
  result.season = season;
  result.gameNum = gameNumber;

  return result;
}
