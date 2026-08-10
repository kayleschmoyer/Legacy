import type {
  DefensePointsAllowedBands,
  FootballScoringSettings,
} from './ScoringSettings';
import type { IDPScoringSettings } from './IDPScoring';

export const DEFAULT_PASSING_SCORING = Object.freeze({
  yds: 0.04,
  td: 4,
  int: -2,
  sacked: -0.5,
});

export const DEFAULT_RUSHING_SCORING = Object.freeze({
  yds: 0.1,
  td: 6,
  fumbles: -2,
});

export const DEFAULT_RECEIVING_SCORING = Object.freeze({
  rec: 1,
  yds: 0.1,
  td: 6,
  fumbles: -2,
});

export const DEFAULT_KICKING_SCORING = Object.freeze({
  fgm: 3,
  fg_50m: 5,
  xpm: 1,
});

export const DEFAULT_DEFENSE_SCORING = Object.freeze({
  sacks: 1,
  int: 2,
  fumbles_rec: 2,
  def_td: 6,
  safeties: 2,
});

export const DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS =
  Object.freeze<DefensePointsAllowedBands>({
    pts_0: 10,
    pts_1_6: 7,
    pts_7_13: 4,
    pts_14_17: 1,
    pts_18_27: 0,
    pts_28_34: -1,
    pts_35_plus: -4,
  });

export const DEFAULT_IDP_SCORING = Object.freeze<IDPScoringSettings>({
  solo_tkl: 1,
  ast_tkl: 0.5,
  sacks: 2,
  int: 3,
  pd: 1,
  ff: 2,
  fr: 2,
  def_td: 6,
  safeties: 2,
});

/**
 * The hardcoded scoring weights every football league used before league
 * scoring profiles were wired in (LS-9041). Used as the fallback settings for
 * leagues with no custom profile, and as the base a profile's overrides are
 * merged on top of.
 */
export function getDefaultFootballScoringSettings(): FootballScoringSettings {
  return {
    passing: { ...DEFAULT_PASSING_SCORING },
    rushing: { ...DEFAULT_RUSHING_SCORING },
    receiving: { ...DEFAULT_RECEIVING_SCORING },
    kicking: { ...DEFAULT_KICKING_SCORING },
    defense: { ...DEFAULT_DEFENSE_SCORING },
    defenseBands: { ...DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS },
    idp: { ...DEFAULT_IDP_SCORING },
    positionBonuses: {},
  };
}
