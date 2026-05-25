import type { ScoringDictionary } from '../ScoringTypes';

export type { ScoringDictionary };

export interface BaseballScoringSettings {
  readonly batting: ScoringDictionary;
  readonly fielding: ScoringDictionary;
  readonly pitching: ScoringDictionary;
}
