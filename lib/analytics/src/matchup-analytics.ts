import {
  CategoryBreakdown,
  HeadToHeadRecord,
  LeagueAnalytics,
  MatchupResult,
  PowerRanking,
  TeamStats,
  TeamTrend,
} from './types';

/**
 * Calculate team statistics for a league
 */
export function calculateTeamStats(
  matchups: Array<{
    id: number;
    weekNumber: number;
    team1Id: number | null;
    team2Id: number | null;
    team1Score: string | null;
    team2Score: string | null;
    status: string;
  }>,
  teams: Array<{ id: number; name: string }>,
  options?: { startWeek?: number; endWeek?: number }
): TeamStats[] {
  const teamStatsMap = new Map<number, TeamStats>();

  // Initialize stats for all teams
  teams.forEach((team) => {
    teamStatsMap.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      totalPoints: 0,
      averagePoints: 0,
      matchupsPlayed: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      winPercentage: 0,
      currentStreak: 'none',
      currentStreakCount: 0,
      longestWinStreak: 0,
      longestLoseStreak: 0,
    });
  });

  // Filter matchups by week range if specified
  const filteredMatchups = matchups.filter((matchup) => {
    if (options?.startWeek && matchup.weekNumber < options.startWeek) return false;
    if (options?.endWeek && matchup.weekNumber > options.endWeek) return false;
    return matchup.status === 'completed';
  });

  // Sort matchups by week number for streak calculation
  const sortedMatchups = [...filteredMatchups].sort((a, b) => a.weekNumber - b.weekNumber);

  // Calculate stats for each matchup
  sortedMatchups.forEach((matchup) => {
    if (!matchup.team1Id || !matchup.team2Id || !matchup.team1Score || !matchup.team2Score) {
      return;
    }

    const team1Score = parseFloat(matchup.team1Score);
    const team2Score = parseFloat(matchup.team2Score);

    const team1Stats = teamStatsMap.get(matchup.team1Id);
    const team2Stats = teamStatsMap.get(matchup.team2Id);

    if (!team1Stats || !team2Stats) return;

    // Update points
    team1Stats.totalPoints += team1Score;
    team1Stats.matchupsPlayed += 1;
    team2Stats.totalPoints += team2Score;
    team2Stats.matchupsPlayed += 1;

    // Determine winner
    if (team1Score > team2Score) {
      team1Stats.wins += 1;
      team2Stats.losses += 1;
      updateStreak(team1Stats, 'win');
      updateStreak(team2Stats, 'loss');
    } else if (team2Score > team1Score) {
      team2Stats.wins += 1;
      team1Stats.losses += 1;
      updateStreak(team2Stats, 'win');
      updateStreak(team1Stats, 'loss');
    } else {
      team1Stats.ties += 1;
      team2Stats.ties += 1;
      updateStreak(team1Stats, 'tie');
      updateStreak(team2Stats, 'tie');
    }
  });

  // Calculate averages and percentages
  teamStatsMap.forEach((stats) => {
    if (stats.matchupsPlayed > 0) {
      stats.averagePoints = stats.totalPoints / stats.matchupsPlayed;
      const totalGames = stats.wins + stats.losses + stats.ties;
      stats.winPercentage = totalGames > 0 ? stats.wins / totalGames : 0;
    }
  });

  return Array.from(teamStatsMap.values()).sort((a, b) => b.winPercentage - a.winPercentage);
}

/**
 * Helper function to update team streaks
 */
function updateStreak(stats: TeamStats, result: 'win' | 'loss' | 'tie'): void {
  if (stats.currentStreak === result) {
    stats.currentStreakCount += 1;
  } else {
    stats.currentStreak = result;
    stats.currentStreakCount = 1;
  }

  // Update longest streaks
  if (result === 'win' && stats.currentStreakCount > stats.longestWinStreak) {
    stats.longestWinStreak = stats.currentStreakCount;
  }
  if (result === 'loss' && stats.currentStreakCount > stats.longestLoseStreak) {
    stats.longestLoseStreak = stats.currentStreakCount;
  }
}

/**
 * Calculate head-to-head record between two teams
 */
export function calculateHeadToHead(
  matchups: Array<{
    id: number;
    weekNumber: number;
    team1Id: number | null;
    team2Id: number | null;
    team1Score: string | null;
    team2Score: string | null;
    status: string;
    startTime: string | null;
  }>,
  team1: { id: number; name: string },
  team2: { id: number; name: string },
  limit = 5
): HeadToHeadRecord {
  const h2hMatchups = matchups
    .filter((m) => {
      if (m.status !== 'completed') return false;
      return (
        (m.team1Id === team1.id && m.team2Id === team2.id) ||
        (m.team1Id === team2.id && m.team2Id === team1.id)
      );
    })
    .sort((a, b) => b.weekNumber - a.weekNumber);

  let team1Wins = 0;
  let team2Wins = 0;
  let ties = 0;
  let team1TotalPoints = 0;
  let team2TotalPoints = 0;

  const lastFiveResults: MatchupResult[] = [];

  h2hMatchups.forEach((matchup, index) => {
    if (!matchup.team1Score || !matchup.team2Score) return;

    const score1 = parseFloat(matchup.team1Score);
    const score2 = parseFloat(matchup.team2Score);

    const isTeam1First = matchup.team1Id === team1.id;
    const team1Score = isTeam1First ? score1 : score2;
    const team2Score = isTeam1First ? score2 : score1;

    team1TotalPoints += team1Score;
    team2TotalPoints += team2Score;

    let winnerId: number | null = null;
    if (team1Score > team2Score) {
      team1Wins += 1;
      winnerId = team1.id;
    } else if (team2Score > team1Score) {
      team2Wins += 1;
      winnerId = team2.id;
    } else {
      ties += 1;
    }

    if (index < limit) {
      lastFiveResults.push({
        matchupId: matchup.id,
        weekNumber: matchup.weekNumber,
        team1Score,
        team2Score,
        winnerId,
        startTime: matchup.startTime,
      });
    }
  });

  const totalMatchups = h2hMatchups.length;

  return {
    team1Id: team1.id,
    team1Name: team1.name,
    team2Id: team2.id,
    team2Name: team2.name,
    team1Wins,
    team2Wins,
    ties,
    totalMatchups,
    team1AveragePoints: totalMatchups > 0 ? team1TotalPoints / totalMatchups : 0,
    team2AveragePoints: totalMatchups > 0 ? team2TotalPoints / totalMatchups : 0,
    lastFiveResults,
  };
}

/**
 * Calculate category performance breakdown
 * Note: This is a placeholder - actual implementation would need category-specific scoring data
 */
export function calculateCategoryBreakdown(teamStats: TeamStats[]): CategoryBreakdown[] {
  // For now, return estimated breakdowns based on total points
  // In a real implementation, this would query actual category scores
  return teamStats.map((stats, index) => ({
    teamId: stats.teamId,
    teamName: stats.teamName,
    batting: {
      averageScore: stats.averagePoints * 0.4, // Estimate 40% from batting
      totalScore: stats.totalPoints * 0.4,
      rank: index + 1,
      percentile: (1 - index / teamStats.length) * 100,
    },
    pitching: {
      averageScore: stats.averagePoints * 0.4, // Estimate 40% from pitching
      totalScore: stats.totalPoints * 0.4,
      rank: index + 1,
      percentile: (1 - index / teamStats.length) * 100,
    },
    fielding: {
      averageScore: stats.averagePoints * 0.2, // Estimate 20% from fielding
      totalScore: stats.totalPoints * 0.2,
      rank: index + 1,
      percentile: (1 - index / teamStats.length) * 100,
    },
  }));
}

/**
 * Calculate historical trends for teams
 */
export function calculateTrends(
  matchups: Array<{
    weekNumber: number;
    team1Id: number | null;
    team2Id: number | null;
    team1Score: string | null;
    team2Score: string | null;
    status: string;
    startTime: string | null;
  }>,
  teams: Array<{ id: number; name: string }>,
  weeks = 10
): TeamTrend[] {
  const teamTrends: TeamTrend[] = [];

  teams.forEach((team) => {
    const teamMatchups = matchups
      .filter((m) => {
        if (m.status !== 'completed') return false;
        return m.team1Id === team.id || m.team2Id === team.id;
      })
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .slice(-weeks);

    const trends = teamMatchups.map((matchup) => {
      const isTeam1 = matchup.team1Id === team.id;
      const score = isTeam1
        ? parseFloat(matchup.team1Score || '0')
        : parseFloat(matchup.team2Score || '0');

      return {
        weekNumber: matchup.weekNumber,
        date: matchup.startTime,
        points: score,
        rank: 0, // Would need all teams' scores for that week to calculate rank
      };
    });

    // Calculate moving average (last 3 weeks)
    const movingAverage: number[] = [];
    for (let i = 0; i < trends.length; i++) {
      const start = Math.max(0, i - 2);
      const window = trends.slice(start, i + 1);
      const avg = window.reduce((sum, t) => sum + t.points, 0) / window.length;
      movingAverage.push(avg);
    }

    // Project next week's points based on moving average
    const projectedPoints =
      movingAverage.length > 0 ? movingAverage[movingAverage.length - 1] : 0;

    teamTrends.push({
      teamId: team.id,
      teamName: team.name,
      trends,
      movingAverage,
      projectedPoints,
    });
  });

  return teamTrends;
}

/**
 * Calculate power rankings based on multiple factors
 */
export function calculatePowerRankings(
  teamStats: TeamStats[],
  trends: TeamTrend[]
): PowerRanking[] {
  const rankings: PowerRanking[] = [];

  teamStats.forEach((stats) => {
    const teamTrend = trends.find((t) => t.teamId === stats.teamId);

    // Calculate recent form score (last 3 matchups)
    const recentMatchups = teamTrend?.trends.slice(-3) || [];
    const recentFormScore =
      recentMatchups.length > 0
        ? recentMatchups.reduce((sum, t) => sum + t.points, 0) / recentMatchups.length
        : stats.averagePoints;

    // Calculate strength of schedule (placeholder - would need opponent data)
    const strengthOfScheduleScore = stats.averagePoints * 0.9;

    // Calculate point differential (simplified)
    const pointDifferential =
      stats.matchupsPlayed > 0
        ? stats.totalPoints / stats.matchupsPlayed - stats.averagePoints * 0.95
        : 0;

    // Power score combines win percentage (40%), recent form (30%), and points (30%)
    const powerScore =
      stats.winPercentage * 0.4 +
      (recentFormScore / (stats.averagePoints || 1)) * 0.3 +
      (stats.averagePoints / 100) * 0.3;

    rankings.push({
      rank: 0, // Will be set after sorting
      teamId: stats.teamId,
      teamName: stats.teamName,
      powerScore,
      trend: 'stable', // Will be calculated after sorting
      rankChange: 0,
      recentFormScore,
      strengthOfScheduleScore,
      pointDifferential,
    });
  });

  // Sort by power score and assign ranks
  rankings.sort((a, b) => b.powerScore - a.powerScore);
  rankings.forEach((ranking, index) => {
    ranking.rank = index + 1;
    // For now, set trend to stable - would need historical rankings to calculate
    ranking.trend = 'stable';
    ranking.rankChange = 0;
  });

  return rankings;
}

/**
 * Generate comprehensive league analytics
 */
export function generateLeagueAnalytics(
  leagueId: number,
  leagueName: string,
  currentWeek: number,
  matchups: Array<{
    id: number;
    weekNumber: number;
    team1Id: number | null;
    team2Id: number | null;
    team1Score: string | null;
    team2Score: string | null;
    status: string;
    startTime: string | null;
  }>,
  teams: Array<{ id: number; name: string }>
): LeagueAnalytics {
  const teamStats = calculateTeamStats(matchups, teams);
  const trends = calculateTrends(matchups, teams);
  const powerRankings = calculatePowerRankings(teamStats, trends);

  // Calculate average points per matchup
  const completedMatchups = matchups.filter((m) => m.status === 'completed');
  const totalPoints = completedMatchups.reduce((sum, m) => {
    const score1 = parseFloat(m.team1Score || '0');
    const score2 = parseFloat(m.team2Score || '0');
    return sum + score1 + score2;
  }, 0);
  const averagePointsPerMatchup =
    completedMatchups.length > 0 ? totalPoints / completedMatchups.length : 0;

  return {
    leagueId,
    leagueName,
    currentWeek,
    totalTeams: teams.length,
    teamStats,
    powerRankings,
    playoffProjections: [], // Will be populated by playoff-projections module
    averagePointsPerMatchup,
    highestScoringTeam: teamStats[0] || null,
    lowestScoringTeam: teamStats[teamStats.length - 1] || null,
  };
}

/**
 * Export analytics data to CSV format
 */
export function exportToCSV(data: TeamStats[] | PowerRanking[]): string {
  if (data.length === 0) return '';

  // Get headers from first object
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');

  // Convert data to CSV rows
  const csvRows = data.map((item) => {
    return headers
      .map((header) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const value = item[header as keyof typeof item] as unknown;
        // Handle nested objects and arrays
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(value);
        }
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return String(value ?? '');
      })
      .join(',');
  });

  return [csvHeaders, ...csvRows].join('\n');
}

/**
 * Export analytics data to JSON format
 */
export function exportToJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
