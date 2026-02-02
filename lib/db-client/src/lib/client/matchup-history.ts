import { and, desc, eq, or, sql } from 'drizzle-orm';
import { PublicDb } from './PublicDbClient';
import * as Schema from '../../drizzle/public/schema';
import { Matchup } from '../../types/DatabaseTypes';

/**
 * Head-to-head record between two teams
 */
export interface HeadToHeadRecord {
  team1Id: number;
  team2Id: number;
  team1Wins: number;
  team2Wins: number;
  ties: number;
  totalMatchups: number;
  team1TotalPoints: number;
  team2TotalPoints: number;
  averageTeam1Score: number;
  averageTeam2Score: number;
}

/**
 * Team standing in a league for a season or overall
 */
export interface TeamStanding {
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  totalMatchups: number;
  pointsFor: number;
  pointsAgainst: number;
  winPercentage: number;
  averagePointsFor: number;
  averagePointsAgainst: number;
  rank?: number;
}

/**
 * Season results summary
 */
export interface SeasonResults {
  leagueId: number;
  season: number | null;
  totalMatchups: number;
  completedMatchups: number;
  standings: TeamStanding[];
}

/**
 * Matchup history query filters
 */
export interface MatchupHistoryFilters {
  leagueId: number;
  season?: number | null;
  teamId?: number;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  startDate?: string;
  endDate?: string;
}

/**
 * Query historical matchups with flexible filtering
 */
export async function queryHistoricalMatchups(
  db: PublicDb,
  filters: MatchupHistoryFilters,
): Promise<Matchup[]> {
  const conditions = [eq(Schema.matchups.leagueId, filters.leagueId)];

  // Note: Season filtering removed - matchups no longer have a selected_season field.
  // Seasons are now per-player (league_week_player_seasons table).

  // Filter by team participation
  if (filters.teamId !== undefined) {
    conditions.push(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- Drizzle `or` typing limitation with multiple conditions
      or(
        eq(Schema.matchups.team1Id, filters.teamId),
        eq(Schema.matchups.team2Id, filters.teamId),
      ) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );
  }

  // Filter by status
  if (filters.status) {
    conditions.push(eq(Schema.matchups.status, filters.status));
  }

  // Filter by date range
  if (filters.startDate) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- sql template literal typing
    conditions.push(sql`${Schema.matchups.startTime} >= ${filters.startDate}`);
  }
  if (filters.endDate) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- sql template literal typing
    conditions.push(sql`${Schema.matchups.endTime} <= ${filters.endDate}`);
  }

  return await db
    .select()
    .from(Schema.matchups)
    .where(and(...conditions))
    .orderBy(desc(Schema.matchups.weekNumber));
}

/**
 * Get head-to-head record between two specific teams
 */
export async function getHeadToHeadRecord(
  db: PublicDb,
  leagueId: number,
  team1Id: number,
  team2Id: number,
): Promise<HeadToHeadRecord> {
  // Get all completed matchups between these two teams
  const matchups = await db
    .select()
    .from(Schema.matchups)
    .where(
      and(
        eq(Schema.matchups.leagueId, leagueId),
        eq(Schema.matchups.status, 'completed'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- Drizzle `or` typing limitation with multiple conditions
        or(
          and(
            eq(Schema.matchups.team1Id, team1Id),
            eq(Schema.matchups.team2Id, team2Id),
          ),
          and(
            eq(Schema.matchups.team1Id, team2Id),
            eq(Schema.matchups.team2Id, team1Id),
          ),
        ) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      ),
    );

  let team1Wins = 0;
  let team2Wins = 0;
  let ties = 0;
  let team1TotalPoints = 0;
  let team2TotalPoints = 0;

  for (const matchup of matchups) {
    const score1 = matchup.team1Score ? parseFloat(matchup.team1Score) : 0;
    const score2 = matchup.team2Score ? parseFloat(matchup.team2Score) : 0;

    // Determine which team is which in this matchup
    const isTeam1First = matchup.team1Id === team1Id;
    const team1Score = isTeam1First ? score1 : score2;
    const team2Score = isTeam1First ? score2 : score1;

    team1TotalPoints += team1Score;
    team2TotalPoints += team2Score;

    if (team1Score > team2Score) {
      team1Wins++;
    } else if (team2Score > team1Score) {
      team2Wins++;
    } else {
      ties++;
    }
  }

  const totalMatchups = matchups.length;

  return {
    team1Id,
    team2Id,
    team1Wins,
    team2Wins,
    ties,
    totalMatchups,
    team1TotalPoints,
    team2TotalPoints,
    averageTeam1Score: totalMatchups > 0 ? team1TotalPoints / totalMatchups : 0,
    averageTeam2Score: totalMatchups > 0 ? team2TotalPoints / totalMatchups : 0,
  };
}

/**
 * Calculate standings for a league (optionally filtered by season)
 */
export async function calculateStandings(
  db: PublicDb,
  leagueId: number,
): Promise<TeamStanding[]> {
  // Get all teams in the league
  const teams = await db
    .select({
      id: Schema.teams.id,
      name: Schema.teams.name,
    })
    .from(Schema.teams)
    .where(eq(Schema.teams.leagueId, leagueId));

  if (teams.length === 0) {
    return [];
  }

  // Build matchup query conditions
  const matchupConditions = [
    eq(Schema.matchups.leagueId, leagueId),
    eq(Schema.matchups.status, 'completed'),
  ];

  // Note: Season filtering removed - matchups no longer have a selected_season field.
  // Seasons are now per-player (league_week_player_seasons table).

  // Get all completed matchups for the league/season
  const matchups = await db
    .select()
    .from(Schema.matchups)
    .where(and(...matchupConditions));

  // Calculate stats for each team
  const standingsMap = new Map<number, TeamStanding>();

  for (const team of teams) {
    standingsMap.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      wins: 0,
      losses: 0,
      ties: 0,
      totalMatchups: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      winPercentage: 0,
      averagePointsFor: 0,
      averagePointsAgainst: 0,
    });
  }

  // Process each matchup
  for (const matchup of matchups) {
    if (!matchup.team1Id || !matchup.team2Id) continue;

    const score1 = matchup.team1Score ? parseFloat(matchup.team1Score) : 0;
    const score2 = matchup.team2Score ? parseFloat(matchup.team2Score) : 0;

    const team1Standing = standingsMap.get(matchup.team1Id);
    const team2Standing = standingsMap.get(matchup.team2Id);

    if (!team1Standing || !team2Standing) continue;

    // Update stats for both teams
    team1Standing.totalMatchups++;
    team2Standing.totalMatchups++;
    team1Standing.pointsFor += score1;
    team1Standing.pointsAgainst += score2;
    team2Standing.pointsFor += score2;
    team2Standing.pointsAgainst += score1;

    // Determine winner
    if (score1 > score2) {
      team1Standing.wins++;
      team2Standing.losses++;
    } else if (score2 > score1) {
      team2Standing.wins++;
      team1Standing.losses++;
    } else {
      team1Standing.ties++;
      team2Standing.ties++;
    }
  }

  // Calculate derived stats and convert to array
  const standings = Array.from(standingsMap.values()).map((standing) => {
    const totalGames = standing.wins + standing.losses + standing.ties;

    return {
      ...standing,
      winPercentage:
        totalGames > 0 ? (standing.wins + standing.ties * 0.5) / totalGames : 0,
      averagePointsFor:
        standing.totalMatchups > 0
          ? standing.pointsFor / standing.totalMatchups
          : 0,
      averagePointsAgainst:
        standing.totalMatchups > 0
          ? standing.pointsAgainst / standing.totalMatchups
          : 0,
    };
  });

  // Sort by win percentage (primary), then by points for (tiebreaker)
  standings.sort((a, b) => {
    if (b.winPercentage !== a.winPercentage) {
      return b.winPercentage - a.winPercentage;
    }
    return b.pointsFor - a.pointsFor;
  });

  // Assign ranks
  standings.forEach((standing, index) => {
    standing.rank = index + 1;
  });

  return standings;
}

/**
 * Get season results summary with standings
 */
export async function getSeasonResults(
  db: PublicDb,
  leagueId: number,
): Promise<SeasonResults> {
  const matchupConditions = [eq(Schema.matchups.leagueId, leagueId)];

  // Note: Season filtering removed - matchups no longer have a selected_season field.
  // Seasons are now per-player (league_week_player_seasons table).

  // Get all matchups for the season
  const allMatchups = await db
    .select()
    .from(Schema.matchups)
    .where(and(...matchupConditions));

  const completedMatchups = allMatchups.filter((m) => m.status === 'completed');

  // Calculate standings
  const standings = await calculateStandings(db, leagueId);

  return {
    leagueId,
    season: null,
    totalMatchups: allMatchups.length,
    completedMatchups: completedMatchups.length,
    standings,
  };
}

/**
 * Get playoff qualification data for teams
 * Returns teams sorted by standings, with playoff indicators
 */
export interface PlayoffQualification {
  teamId: number;
  teamName: string;
  isQualified: boolean;
  seedNumber: number | null;
  standing: TeamStanding;
}

export async function getPlayoffQualifications(
  db: PublicDb,
  leagueId: number,
  season: number | null,
  playoffSpots: number,
): Promise<PlayoffQualification[]> {
  // Note: Season parameter preserved for API compatibility but ignored
  // Standings are now calculated across all seasons
  const standings = await calculateStandings(db, leagueId);

  return standings.map((standing, index) => ({
    teamId: standing.teamId,
    teamName: standing.teamName,
    isQualified: index < playoffSpots,
    seedNumber: index < playoffSpots ? index + 1 : null,
    standing,
  }));
}

/**
 * Get recent matchups for a team (most recent first)
 */
export async function getRecentMatchupsForTeam(
  db: PublicDb,
  teamId: number,
  limit = 10,
): Promise<Matchup[]> {
  return await db
    .select()
    .from(Schema.matchups)
    .where(
      and(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- Drizzle `or` typing limitation with multiple conditions
        or(
          eq(Schema.matchups.team1Id, teamId),
          eq(Schema.matchups.team2Id, teamId),
        ) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        eq(Schema.matchups.status, 'completed'),
      ),
    )
    .orderBy(desc(Schema.matchups.endTime))
    .limit(limit);
}

/**
 * Get matchup count by status for a league
 */
export interface MatchupStatusCounts {
  scheduled: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  total: number;
}

export async function getMatchupStatusCounts(
  db: PublicDb,
  leagueId: number,
): Promise<MatchupStatusCounts> {
  const conditions = [eq(Schema.matchups.leagueId, leagueId)];

  // Note: Season filtering removed - matchups no longer have a selected_season field.
  // Seasons are now per-player (league_week_player_seasons table).

  const matchups = await db
    .select()
    .from(Schema.matchups)
    .where(and(...conditions));

  const counts = {
    scheduled: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    total: matchups.length,
  };

  for (const matchup of matchups) {
    switch (matchup.status) {
      case 'scheduled':
        counts.scheduled++;
        break;
      case 'in_progress':
        counts.inProgress++;
        break;
      case 'completed':
        counts.completed++;
        break;
      case 'cancelled':
        counts.cancelled++;
        break;
    }
  }

  return counts;
}
