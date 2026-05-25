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

export interface FootballScoringSettings {
  passing: ScoringDictionary;
  rushing: ScoringDictionary;
  receiving: ScoringDictionary;
  kicking: ScoringDictionary;
  defense: ScoringDictionary;
  defenseBands: DefensePointsAllowedBands;
  idp: ScoringDictionary;
}
