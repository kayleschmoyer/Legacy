/**
 * Standings Service
 *
 * Business logic layer for standings, history, and head-to-head operations.
 * Provides high-level operations for tracking matchup results and league standings.
 */

import {
  calculateStandings,
  type GenericDatabase,
  getHeadToHeadRecord,
  getMatchupStatusCounts,
  getPlayoffQualifications,
  getRecentMatchupsForTeam,
  getSeasonResults,
  type HeadToHeadRecord,
  type MatchupHistoryFilters,
  type MatchupStatusCounts,
  type PlayoffQualification,
  PublicSchema,
  queryHistoricalMatchups,
  type SeasonResults,
  type TeamStanding,
} from '@legacy-sports/db-client';

export interface GetStandingsParams {
  leagueId: number;
  season?: number | null;
  sortBy?: 'winPercentage' | 'pointsFor' | 'pointsAgainst';
  ascending?: boolean;
}

export interface GetHeadToHeadParams {
  leagueId: number;
  team1Id: number;
  team2Id: number;
}

export interface GetPlayoffRaceParams {
  leagueId: number;
  season: number | null;
  playoffSpots: number;
}

export interface MatchupHistoryParams {
  leagueId: number;
  season?: number | null;
  teamId?: number;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export class StandingsService {
  /**
   * Get current standings for a league
   * Supports custom sorting and filtering
   */
  static async getStandings(
    db: GenericDatabase<typeof PublicSchema>,
    params: GetStandingsParams,
  ): Promise<TeamStanding[]> {
    const {
      leagueId,
      season: _season,
      sortBy = 'winPercentage',
      ascending = false,
    } = params;

    // Note: Season parameter preserved for API compatibility but ignored
    // Standings are now calculated across all seasons
    const standings = await calculateStandings(db, leagueId);

    // Apply custom sorting if needed
    if (sortBy !== 'winPercentage') {
      standings.sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        return ascending ? aValue - bValue : bValue - aValue;
      });

      // Reassign ranks after custom sort
      standings.forEach((standing, index) => {
        standing.rank = index + 1;
      });
    } else if (ascending) {
      standings.reverse();
      standings.forEach((standing, index) => {
        standing.rank = index + 1;
      });
    }

    return standings;
  }

  /**
   * Get head-to-head record between two teams
   */
  static async getHeadToHead(
    db: GenericDatabase<typeof PublicSchema>,
    params: GetHeadToHeadParams,
  ): Promise<HeadToHeadRecord> {
    const { leagueId, team1Id, team2Id } = params;
    return await getHeadToHeadRecord(db, leagueId, team1Id, team2Id);
  }

  /**
   * Get complete season results including standings
   */
  static async getSeasonSummary(
    db: GenericDatabase<typeof PublicSchema>,
    leagueId: number,
    _season: number | null,
  ): Promise<SeasonResults> {
    // Note: Season parameter preserved for API compatibility but ignored
    // Results are now calculated across all seasons
    return await getSeasonResults(db, leagueId);
  }

  /**
   * Get playoff qualification status for all teams
   */
  static async getPlayoffRace(
    db: GenericDatabase<typeof PublicSchema>,
    params: GetPlayoffRaceParams,
  ): Promise<PlayoffQualification[]> {
    const { leagueId, season, playoffSpots } = params;
    return await getPlayoffQualifications(db, leagueId, season, playoffSpots);
  }

  /**
   * Get recent matchups for a team (used for team profile pages)
   */
  static async getTeamRecentMatchups(
    db: GenericDatabase<typeof PublicSchema>,
    teamId: number,
    limit = 10,
  ) {
    return await getRecentMatchupsForTeam(db, teamId, limit);
  }

  /**
   * Get historical matchups with flexible filtering
   */
  static async getMatchupHistory(
    db: GenericDatabase<typeof PublicSchema>,
    params: MatchupHistoryParams,
  ) {
    const { leagueId, season, teamId, status, startDate, endDate, limit } =
      params;

    const filters: MatchupHistoryFilters = {
      leagueId,
      season,
      teamId,
      status,
      startDate,
      endDate,
    };

    const results = await queryHistoricalMatchups(db, filters);

    // Apply limit if specified
    return limit ? results.slice(0, limit) : results;
  }

  /**
   * Get matchup status counts for a league/season
   */
  static async getMatchupStats(
    db: GenericDatabase<typeof PublicSchema>,
    leagueId: number,
    _season?: number | null,
  ): Promise<MatchupStatusCounts> {
    // Note: Season parameter preserved for API compatibility but ignored
    // Matchup counts are now across all seasons per league
    return await getMatchupStatusCounts(db, leagueId);
  }

  /**
   * Get comprehensive league overview including standings and stats.
   *
   * Runs calculateStandings and getMatchupStatusCounts in parallel. The
   * in-flight memoization on calculateStandings means any other concurrent
   * resolver that also requests standings (e.g. getSeasonResults) will share
   * the same single DB query.
   */
  static async getLeagueOverview(
    db: GenericDatabase<typeof PublicSchema>,
    leagueId: number,
    _season?: number | null,
  ) {
    // Note: Season parameter preserved for API compatibility
    const [standings, statusCounts] = await Promise.all([
      calculateStandings(db, leagueId),
      getMatchupStatusCounts(db, leagueId),
    ]);

    const seasonResults: SeasonResults = {
      leagueId,
      season: null,
      totalMatchups: statusCounts.total,
      completedMatchups: statusCounts.completed,
      standings,
    };

    return {
      standings,
      statusCounts,
      seasonResults,
    };
  }

  /**
   * Calculate win streak for a team (consecutive wins)
   */
  static async getTeamWinStreak(
    db: GenericDatabase<typeof PublicSchema>,
    teamId: number,
  ): Promise<number> {
    const recentMatchups = await getRecentMatchupsForTeam(db, teamId, 50);

    let streak = 0;

    for (const matchup of recentMatchups) {
      const isTeam1 = matchup.team1Id === teamId;
      const teamScore = isTeam1
        ? parseFloat(matchup.team1Score || '0')
        : parseFloat(matchup.team2Score || '0');
      const opponentScore = isTeam1
        ? parseFloat(matchup.team2Score || '0')
        : parseFloat(matchup.team1Score || '0');

      if (teamScore > opponentScore) {
        streak++;
      } else {
        break; // Streak ended
      }
    }

    return streak;
  }

  /**
   * Get power rankings based on points differential
   */
  static async getPowerRankings(
    db: GenericDatabase<typeof PublicSchema>,
    leagueId: number,
    _season?: number | null,
  ): Promise<
    Array<
      TeamStanding & {
        powerRank: number;
        pointsDifferential: number;
      }
    >
  > {
    // Note: Season parameter preserved for API compatibility but ignored
    // Standings are now calculated across all seasons
    const standings = await calculateStandings(db, leagueId);

    // Calculate power rankings based on points differential
    const withDifferentials = standings.map((standing) => ({
      ...standing,
      pointsDifferential: standing.pointsFor - standing.pointsAgainst,
      powerRank: 0,
    }));

    // Sort by points differential (best first)
    withDifferentials.sort(
      (a, b) => b.pointsDifferential - a.pointsDifferential,
    );

    // Assign power ranks
    withDifferentials.forEach((standing, index) => {
      standing.powerRank = index + 1;
    });

    return withDifferentials;
  }

  /**
   * Get closest matchups (games decided by smallest margins)
   */
  static async getClosestMatchups(
    db: GenericDatabase<typeof PublicSchema>,
    leagueId: number,
    season?: number | null,
    limit = 10,
  ) {
    const filters: MatchupHistoryFilters = {
      leagueId,
      season,
      status: 'completed',
    };

    const matchups = await queryHistoricalMatchups(db, filters);

    // Calculate margins and sort
    const withMargins = matchups
      .filter((m) => m.team1Score && m.team2Score)
      .map((m) => ({
        matchup: m,
        margin: Math.abs(
          parseFloat(m.team1Score ?? '0') - parseFloat(m.team2Score ?? '0'),
        ),
      }))
      .sort((a, b) => a.margin - b.margin)
      .slice(0, limit);

    return withMargins.map((m) => m.matchup);
  }

  /**
   * Get blowout matchups (largest score differentials)
   */
  static async getBlowoutMatchups(
    db: GenericDatabase<typeof PublicSchema>,
    leagueId: number,
    season?: number | null,
    limit = 10,
  ) {
    const filters: MatchupHistoryFilters = {
      leagueId,
      season,
      status: 'completed',
    };

    const matchups = await queryHistoricalMatchups(db, filters);

    // Calculate margins and sort (largest first)
    const withMargins = matchups
      .filter((m) => m.team1Score && m.team2Score)
      .map((m) => ({
        matchup: m,
        margin: Math.abs(
          parseFloat(m.team1Score ?? '0') - parseFloat(m.team2Score ?? '0'),
        ),
      }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, limit);

    return withMargins.map((m) => m.matchup);
  }
}
