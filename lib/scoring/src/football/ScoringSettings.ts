import type { IDPScoringSettings } from './IDPScoring';
import type { ScoringDictionary } from '../ScoringTypes';

export interface DefensePointsAllowedBands {
  pts_0: number;
  pts_1_6: number;
  pts_7_13: number;
  pts_14_17: number;
  pts_18_27: number;
  pts_28_34: number;
  pts_35_plus: number;
}

/**
 * Position-scoped scoring bonuses (LS-9104), applied additively on top of
 * the base per-stat-group multiplier for players rostered at that position —
 * e.g. a TE-premium PPR bonus (`receiving.rec`) or a per-position IDP tweak.
 * Keyed by roster position (e.g. 'TE', 'DL').
 */
export interface FootballPositionScoringBonuses {
  passing?: ScoringDictionary;
  rushing?: ScoringDictionary;
  receiving?: ScoringDictionary;
  kicking?: ScoringDictionary;
  idp?: Partial<IDPScoringSettings>;
}

export interface FootballScoringSettings {
  passing: ScoringDictionary;
  rushing: ScoringDictionary;
  receiving: ScoringDictionary;
  kicking: ScoringDictionary;
  defense: ScoringDictionary;
  defenseBands: DefensePointsAllowedBands;
  idp: ScoringDictionary;
  positionBonuses: Record<string, FootballPositionScoringBonuses>;
}
