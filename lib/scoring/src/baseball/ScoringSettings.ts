export type ScoringDictionary = Partial<Record<string, number>>;

export interface BaseballScoringSettings {
  readonly batting: ScoringDictionary;
  readonly fielding: ScoringDictionary;
  readonly pitching: ScoringDictionary;
}
