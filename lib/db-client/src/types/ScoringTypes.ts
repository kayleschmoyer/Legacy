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

/**
 * Result row from the compute_career_scores(league_id) SQL function.
 * Contains per-player fantasy scoring computed at the database level
 * using league-specific (or default) scoring multipliers.
 */
export interface PlayerCareerScore {
  playerId: number;
  battingScore: number;
  pitchingScore: number;
  fieldingScore: number;
  totalScore: number;
  careerGames: number;
  avgPpg: number;
}
