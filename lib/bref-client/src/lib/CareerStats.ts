import htmlParser, { HTMLElement } from 'node-html-parser';
import { LOGGER } from '@legacy-sports/logging';
import {
  Player,
  SeasonBatting,
  SeasonFielding,
  SeasonPitching,
} from '@legacy-sports/db-client';
import { getCareerStats as getCareerStatsFromBref } from './BRefSession';
import { getTable, getTableBody, RowParser } from './HtmlParser';

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
    'basesOnBallsPerNine',
    'battersFaced',
    'battingAvg',
    'bb',
    'bk',
    'caughtStealingPerc',
    'caughtStealingPercLg',
    'caughtStealingPercLg',
    'cg',
    'chances',
    'cs',
    'doubles',
    'dpDef',
    'earnedRunAvg',
    'earnedRunAvgPlus',
    'eDef',
    'er',
    'fieldingPerc',
    'fieldingPercLg',
    'fip',
    'g',
    'gf',
    'gidp',
    'gOfParts',
    'gs',
    'h',
    'hbp',
    'hitsPerNine',
    'homeRunsPerNine',
    'hr',
    'ibb',
    'innDef',
    'ip',
    'l',
    'onbasePerc',
    'onbasePlusSlugging',
    'onbasePlusSluggingPlus',
    'pa',
    'pickoffs',
    'po',
    'r',
    'rangeFactorPerGame',
    'rangeFactorPerGameLg',
    'rangeFactorPerGameLg',
    'rangeFactorPerNine',
    'rangeFactorPerNineLg',
    'rangeFactorPerNineLg',
    'rbi',
    'sb',
    'sh',
    'sho',
    'sluggingPerc',
    'so',
    'strikeoutsPerBaseOnBalls',
    'strikeoutsPerNine',
    'sv',
    'tb',
    'triples',
    'w',
    'whip',
    'winLossPerc',
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
            `Unable to parse field ${statField}: ${text} is not a number`
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
