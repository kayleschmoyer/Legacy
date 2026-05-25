import type { DefensePointsAllowedBands } from './ScoringSettings';
import type { ScoringDictionary } from '../ScoringTypes';

export interface GameFootballDefense {
  sacks?: number | null;
  int?: number | null;
  fumbles_rec?: number | null;
  def_td?: number | null;
  safeties?: number | null;
  pts_allowed?: number | null;
  yds_allowed?: number | null;
  pass_yds_allowed?: number | null;
  rush_yds_allowed?: number | null;
}

function getPtsAllowedBandScore(
  ptsAllowed: number,
  bands: DefensePointsAllowedBands,
): number {
  if (isNaN(ptsAllowed)) return 0;
  if (ptsAllowed === 0) return bands.pts_0;
  if (ptsAllowed <= 6) return bands.pts_1_6;
  if (ptsAllowed <= 13) return bands.pts_7_13;
  if (ptsAllowed <= 17) return bands.pts_14_17;
  if (ptsAllowed <= 27) return bands.pts_18_27;
  if (ptsAllowed <= 34) return bands.pts_28_34;
  return bands.pts_35_plus;
}

export function computeDefenseScore(
  stats: GameFootballDefense,
  flatMultipliers: ScoringDictionary,
  bands: DefensePointsAllowedBands,
): number {
  let flatScore = 0;

  for (const key of Object.keys(stats) as (keyof GameFootballDefense)[]) {
    if (key === 'pts_allowed') {
      continue;
    }
    const multiplier = flatMultipliers[key];
    const value = stats[key];
    if (
      typeof multiplier !== 'number' ||
      isNaN(multiplier) ||
      value == null ||
      isNaN(value)
    ) {
      continue;
    }
    flatScore += multiplier * value;
  }

  const ptsAllowed = stats.pts_allowed;
  if (ptsAllowed == null) {
    return flatScore;
  }

  return flatScore + getPtsAllowedBandScore(ptsAllowed, bands);
}
