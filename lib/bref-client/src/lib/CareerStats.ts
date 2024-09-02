import { getTable, getTableFooter, parseTable } from "./HtmlParser";
import htmlParser, {HTMLElement} from 'node-html-parser'
import {getCareerStats as getCareerStatsFromBref} from './BRefSession';
import { CareerBatting, CareerFielding, CareerPitching, PlayerFragment } from "../api/db/graphql.generated";

const StatMapping: Record<
  string,
  keyof CareerBatting | keyof CareerFielding | keyof CareerPitching
> = {
  '2B': '_2B',
  '3B': '_3B',
  A: 'a',
  AB: 'ab',
  award_summary: 'awardSummary',
  bases_on_balls_per_nine: 'basesOnBallsPerNine',
  batters_faced: 'battersFaced',
  batting_avg: 'battingAvg',
  BB: 'bb',
  BK: 'bk',
  caught_stealing_perc_lg: 'caughtStealingPercLg',
  caught_stealing_perc: 'caughtStealingPerc',
  CG: 'cg',
  chances: 'chances',
  CS: 'cs',
  DP_def: 'dpDef',
  E_def: 'eDef',
  earned_run_avg_plus: 'earnedRunAvgPlus',
  earned_run_avg: 'earnedRunAvg',
  ER: 'er',
  fielding_perc_lg: 'fieldingPercLg',
  fielding_perc: 'fieldingPerc',
  fip: 'fip',
  G_of_parts: 'gOfParts',
  G: 'g',
  GF: 'gf',
  GIDP: 'gidp',
  GS: 'gs',
  H: 'h',
  HBP: 'hbp',
  hits_per_nine: 'hitsPerNine',
  home_runs_per_nine: 'homeRunsPerNine',
  HR: 'hr',
  IBB: 'ibb',
  Inn_def: 'innDef',
  IP: 'ip',
  L: 'l',
  lg_ID: 'lgId',
  onbase_perc: 'onbasePerc',
  onbase_plus_slugging_plus: 'onbasePlusSluggingPlus',
  onbase_plus_slugging: 'onbasePlusSlugging',
  PA: 'pa',
  pickoffs: 'pickoffs',
  PO: 'po',
  pos_season: 'posSeason',
  R: 'r',
  range_factor_per_game_lg: 'rangeFactorPerGameLg',
  range_factor_per_game: 'rangeFactorPerGame',
  range_factor_per_nine_lg: 'rangeFactorPerNineLg',
  range_factor_per_nine: 'rangeFactorPerNine',
  RBI: 'rbi',
  SB: 'sb',
  SF: 'sf',
  SH: 'sh',
  SHO: 'sho',
  slugging_perc: 'sluggingPerc',
  SO: 'so',
  strikeouts_per_base_on_balls: 'strikeoutsPerBaseOnBalls',
  strikeouts_per_nine: 'strikeoutsPerNine',
  SV: 'sv',
  TB: 'tb',
  W: 'w',
  whip: 'whip',
  win_loss_perc: 'winLossPerc',
  WP: 'wp',
};

const NUMERIC_STATS = Object.freeze(
  new Set<keyof CareerBatting | keyof CareerFielding | keyof CareerPitching>([
    '_2B',
    '_3B',
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
    'w',
    'whip',
    'winLossPerc',
    'wp'
  ]),
);


function parseRow<T extends object>(row: HTMLElement, playerId: number): T {
  const cols = row.getElementsByTagName('td');

  const stats: T = {
    playerId: playerId,
  } as T;

  for (const col of cols) {
    const stat = col.getAttribute('data-stat');

    if (stat === undefined) {
      continue;
    }

    const text = col.text.trim();

    const statField = StatMapping[stat];

    if (!statField) {
      continue;
    }

    Object.assign(stats, {
      [statField]: NUMERIC_STATS.has(statField) ? parseFloat(text) : text,
    });
  }

  return stats;
}


function getBattingStats(
  root: HTMLElement,
  playerId: number,
): CareerBatting | null {
  const battingStats = getTable(root, 'batting_standard');
  return parseTable<CareerBatting>(battingStats, (r) => parseRow(r, playerId));
}

function getFieldingStats(
  root: HTMLElement,
  playerId: number,
): CareerFielding | null {
  const fieldingStats = getTable(root, 'standard_fielding');

  if (fieldingStats === null) {
    return null;
  }

  const footer = getTableFooter(fieldingStats);

  if (!footer) {
    return null;
  }

  // Fielding stats are formatted differently
  for (const row of footer.getElementsByTagName('tr')) {
    const cell = row.querySelector('[data-stat="pos"]');

    if (cell === null) {
      continue;
    }

    if (cell.text.trim() != 'TOT') {
      continue;
    }

    const data = parseRow<CareerFielding>(row, playerId);
    return data;
  }

  return null;
}

function getPitchingStats(
  root: HTMLElement,
  playerId: number,
): CareerPitching | null {
  const pitchingStats = getTable(root, 'pitching_standard');
  return parseTable(pitchingStats, (r) => parseRow(r, playerId));
}

export async function getCareerStats(player: PlayerFragment) {
  const html = await getCareerStatsFromBref(player.brefId);
  const root = htmlParser(html, {
    comment: true,
  });

  return {
    batting: getBattingStats(root, player.id),
    pitching: getPitchingStats(root, player.id),
    fielding: getFieldingStats(root, player.id),
  };
}