/**
 * Types for matchup narrative generation.
 */

// ── Input Types ───────────────────────────────────────────────────────────────

/** Stats for a single player's performance across the matchup's games. */
export interface PlayerPerformance {
  playerId: number;
  playerName: string;
  /** Historical season year (e.g. 1998). Null if unknown. */
  season: number | null;
  /** Estimated fantasy points for the matchup period. */
  fantasyPoints: number;

  // Batting stats
  h?: number;
  hr?: number;
  rbi?: number;
  bb?: number;
  sb?: number;
  /** Season batting average (e.g. 0.305). */
  ba?: number;

  // Pitching stats
  isPitcher?: boolean;
  /** Innings pitched, e.g. 7.1 */
  ip?: number;
  /** Strikeouts */
  k?: number;
  /** Walks */
  w?: number;
  /** Earned runs */
  er?: number;
}

/** Summary of a team's performance in a completed matchup. */
export interface TeamRecap {
  teamId: number;
  teamName: string;
  score: number;
  performers: PlayerPerformance[];
}

/** Full context passed to the narrative generator. */
export interface MatchupContext {
  matchupId: number;
  weekNumber: number;
  leagueId: number;
  team1: TeamRecap;
  team2: TeamRecap;
}

// ── Output Types ──────────────────────────────────────────────────────────────

/** Categorization of the matchup outcome. */
export type MatchupNarrativeType = 'blowout' | 'close' | 'normal';

/** The generated narrative for a completed matchup. */
export interface MatchupNarrativeResult {
  /** Short headline (≤ 80 chars). */
  headline: string;
  /** 2–3 sentence narrative paragraph. */
  narrative: string;
  /** Bullet-style highlights for notable performances (max 5). */
  highlights: string[];
  /** Categorization of the match result. */
  matchupType: MatchupNarrativeType;
  /** The winning team id, or null on tie. */
  winnerId: number | null;
}
