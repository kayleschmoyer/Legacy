/**
 * Matchup Analytics Types
 */

export interface TeamStats {
  teamId: number;
  teamName: string;
  totalPoints: number;
  averagePoints: number;
  matchupsPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
  currentStreak: string;
  currentStreakCount: number;
  longestWinStreak: number;
  longestLoseStreak: number;
}

export interface Streak {
  type: 'win' | 'loss' | 'tie' | 'none';
  count: number;
}

export interface HeadToHeadRecord {
  team1Id: number;
  team1Name: string;
  team2Id: number;
  team2Name: string;
  team1Wins: number;
  team2Wins: number;
  ties: number;
  totalMatchups: number;
  team1AveragePoints: number;
  team2AveragePoints: number;
  lastFiveResults: MatchupResult[];
}

export interface MatchupResult {
  matchupId: number;
  weekNumber: number;
  team1Score: number;
  team2Score: number;
  winnerId: number | null;
  startTime: string | null;
}

export interface CategoryBreakdown {
  teamId: number;
  teamName: string;
  batting: CategoryStats;
  pitching: CategoryStats;
  fielding: CategoryStats;
}

export interface CategoryStats {
  averageScore: number;
  totalScore: number;
  rank: number;
  percentile: number;
}

export interface TrendData {
  weekNumber: number;
  date: string | null;
  points: number;
  rank: number;
}

export interface TeamTrend {
  teamId: number;
  teamName: string;
  trends: TrendData[];
  movingAverage: number[];
  projectedPoints: number;
}

export interface PlayoffProjection {
  teamId: number;
  teamName: string;
  currentRecord: string;
  playoffProbability: number;
  projectedWins: number;
  projectedLosses: number;
  strengthOfSchedule: number;
  remainingMatchups: number;
  magicNumber: number | null;
  eliminationNumber: number | null;
}

export interface PowerRanking {
  rank: number;
  teamId: number;
  teamName: string;
  powerScore: number;
  trend: 'up' | 'down' | 'stable';
  rankChange: number;
  recentFormScore: number;
  strengthOfScheduleScore: number;
  pointDifferential: number;
}

export interface LeagueAnalytics {
  leagueId: number;
  leagueName: string;
  currentWeek: number;
  totalTeams: number;
  teamStats: TeamStats[];
  powerRankings: PowerRanking[];
  playoffProjections: PlayoffProjection[];
  averagePointsPerMatchup: number;
  highestScoringTeam: TeamStats | null;
  lowestScoringTeam: TeamStats | null;
}

export interface ExportFormat {
  format: 'csv' | 'json';
  data: unknown;
  filename: string;
}

/**
 * Input types for analytics functions
 */

export interface AnalyticsOptions {
  leagueId: number;
  startWeek?: number;
  endWeek?: number;
  teamId?: number;
}

export interface HeadToHeadOptions {
  leagueId: number;
  team1Id: number;
  team2Id: number;
  limit?: number;
}

export interface TrendOptions {
  leagueId: number;
  teamId?: number;
  weeks?: number;
}

export interface PlayoffOptions {
  leagueId: number;
  playoffTeams?: number;
  simulationCount?: number;
}
