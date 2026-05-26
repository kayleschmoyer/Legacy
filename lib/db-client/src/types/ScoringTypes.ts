import { ScoringStatGroup } from './DatabaseTypes';

export type ScoringMultiplierGroup = Extract<
  ScoringStatGroup,
  | 'batting'
  | 'pitching'
  | 'fielding'
  | 'passing'
  | 'rushing'
  | 'receiving'
  | 'kicking'
  | 'defense'
  | 'idp'
>;

export interface LeagueScoringMultipliers {
  batting: Record<string, number>;
  pitching: Record<string, number>;
  fielding: Record<string, number>;
  passing?: Record<string, number>;
  rushing?: Record<string, number>;
  receiving?: Record<string, number>;
  kicking?: Record<string, number>;
  defense?: Record<string, number>;
  idp?: Record<string, number>;
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
  /** battingScore + fieldingScore — the combined hitter-only contribution */
  hitterScore: number;
  totalScore: number;
  careerGames: number;
  avgPpg: number;
  /** hitterScore / careerGames — per-game hitter average */
  hitterAvgPpg: number;
  /** pitchingScore / careerGames — per-game pitching average */
  pitchingAvgPpg: number;
}
