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

const GAME_IDENTIFIER_GROUP = 'gameIdentifier';
const GAME_IDENTIFIER_REGEX = new RegExp(
  `^\\/boxes\\/\\w{3}\\/(?<${GAME_IDENTIFIER_GROUP}>\\w{12}).shtml$`
);

const StatMapping: Record<
  string,
  keyof SeasonBatting | keyof SeasonFielding | keyof SeasonPitching
> = {
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
  YEAR_ID: 'season',
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
  ])
);

function parseRow<T extends object>(
  row: HTMLElement,
  playerId: number
): T | null {
  const headers = row.getElementsByTagName('th');
  const cols = row.getElementsByTagName('td');

  const allCells = headers.concat(cols);

  const yearCell = allCells.find(
    (c) => c.getAttribute('data-stat') === 'year_ID'
  );

  const rowId = yearCell?.getAttribute('csk');

  const stats: T = {
    playerId: playerId,
    rowId: !rowId ? yearCell?.text : rowId,
  } as T;

  for (const col of allCells) {
    const stat = col.getAttribute('data-stat');

    if (stat === undefined) {
      continue;
    }

    const text = col.text.trim();

    const statField = StatMapping[stat.toUpperCase()];

    if (!statField) {
      LOGGER.debug(`Skipping field ${stat}`);
      continue;
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
              statField
            )}: ${text} is not a number`
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
  parser: RowParser<T>
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
  const battingStats = getTable(root, 'batting_standard');
  return parseTable<SeasonBatting>(battingStats, (r) => {
    const s = parseRow<SeasonBatting & { pos?: string }>(r, playerId);

    if (s !== null) {
      // Remove the position field, the batting stats pos looks like 9H/8
      delete s['pos'];
    }

    return s;
  });
}

function getFieldingStats(
  root: HTMLElement,
  playerId: number
): SeasonFielding[] {
  const fieldingStats = getTable(root, 'standard_fielding');
  return parseTable<SeasonFielding>(fieldingStats, (r) =>
    parseRow(r, playerId)
  );
}

function getPitchingStats(
  root: HTMLElement,
  playerId: number
): SeasonPitching[] {
  const pitchingStats = getTable(root, 'pitching_standard');
  return parseTable(pitchingStats, (r) => parseRow(r, playerId));
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
  gameNumber: number
): Promise<GameBatting | null> {
  const data = await getGameStats(player.brefId, 'b', season);
  const root = htmlParser(data);

  const table = getTable(root, 'batting_gamelogs');

  if (table === null) {
    throw new Error('Could not find Game Batting Stats table');
  }

  const gameRow = table.getElementsByTagName('tr').find((row) => {
    const rankerCell = row
      .getElementsByTagName('th')
      .find((c) => c.getAttribute('data-stat') === 'ranker');

    return rankerCell?.text === gameNumber.toString();
  });

  if (!gameRow) {
    throw new Error('Could not find game record');
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

  result.gameIdentifier = match?.groups
    ? match.groups[GAME_IDENTIFIER_GROUP]
    : '';
  result.season = season;
  result.gameNum = gameNumber;

  return result;
}

export async function getGamePitchingStats(
  player: Player,
  season: number,
  gameNumber: number
): Promise<GamePitching | null> {
  const data = await getGameStats(player.brefId, 'p', season);
  const root = htmlParser(data);

  const table = getTable(root, 'pitching_gamelogs');

  if (table === null) {
    throw new Error('Could not find Game Pitching Stats table');
  }

  const gameRow = table.getElementsByTagName('tr').find((row) => {
    const rankerCell = row
      .getElementsByTagName('th')
      .find((c) => c.getAttribute('data-stat') === 'ranker');

    return rankerCell?.text === gameNumber.toString();
  });

  if (!gameRow) {
    throw new Error('Could not find game record');
  }

  const result = parseRow<GamePitching>(gameRow, player.id);

  if (result === null) {
    return null;
  }

  const cells = gameRow.getElementsByTagName('td');

  const identifierCell = cells.find(
    (cell) => cell.getAttribute('data-stat') === 'date_game'
  );

  const link = identifierCell
    ?.getElementsByTagName('a')[0]
    ?.getAttribute('href');

  const match = link?.match(GAME_IDENTIFIER_REGEX);

  result.gameIdentifier = match?.groups
    ? match.groups[GAME_IDENTIFIER_GROUP]
    : '';
  result.season = season;
  result.gameNum = gameNumber;

  // Pitching specific stat parsing
  const decision =
    cells.find(
      (cell) => cell.getAttribute('data-stat') === 'player_game_result'
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

export async function getGameFieldingStats(
  player: Player,
  season: number,
  gameNumber: number,
  pos: string
): Promise<GameFielding | null> {
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
    default:
      throw new Error(`Invalid position: ${pos}`);
  }

  const table = getTable(root, tableId);

  if (table === null) {
    throw new Error('Could not find Game Fielding Stats table');
  }

  const gameRow = table.getElementsByTagName('tr').find((row) => {
    const rankerCell = row
      .getElementsByTagName('th')
      .find((c) => c.getAttribute('data-stat') === 'ranker');

    return rankerCell?.text === gameNumber.toString();
  });

  if (!gameRow) {
    throw new Error('Could not find game record');
  }

  const result = parseRow<GameFielding>(gameRow, player.id);

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

  result.gameIdentifier = match?.groups
    ? match.groups[GAME_IDENTIFIER_GROUP]
    : '';
  result.season = season;
  result.gameNum = gameNumber;

  return result;
}
