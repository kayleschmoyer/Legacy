import { ScoringStatGroup } from './DatabaseTypes';

export type ScoringMultiplierGroup = Extract<
  ScoringStatGroup,
  'batting' | 'pitching' | 'fielding'
>;

export interface LeagueScoringMultipliers {
  batting: Record<string, number>;
  pitching: Record<string, number>;
  fielding: Record<string, number>;
}

export interface LeagueScoringProfileSummary {
  profileId: number | null;
  leagueId: number | null;
  profileName: string | null;
}
