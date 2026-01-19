/**
 * Matchup Service
 * 
 * Business logic layer for matchup operations.
 * Integrates scheduling algorithms with database operations.
 */

import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { and, eq, inArray } from 'drizzle-orm';
import {
  determineEligibleSeasons,
  DivisionalStrategy,
  type LeagueConfig,
  MatchupScheduler,
  type PlayerGameCount,
  RandomStrategy,
  RoundRobinStrategy,
  type ScheduleResult,
  type SchedulingStrategy,
  type SeasonInfo,
  type TeamInfo,
  type TeamRoster,
} from '@legacy-sports/scheduling';

export interface GenerateScheduleParams {
  leagueId: number;
  numberOfWeeks: number;
  strategyType: 'round-robin' | 'divisional' | 'random';
}

export interface CreateMatchupParams {
  leagueId: number;
  weekNumber: number;
  team1Id: number | null;
  team2Id: number | null;
  selectedSeason: number | null;
  gamesPerMatchup: number | null;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

export class MatchupService {
  /**
   * Generate a complete schedule for a league
   */
  static async generateSchedule(
    params: GenerateScheduleParams
  ): Promise<ScheduleResult> {
    const { leagueId, numberOfWeeks, strategyType } = params;

    return await runWithPublicClient(getDbOptions(), async (db) => {
      // 1. Fetch league configuration
      const leagueResult = await db
        .select({
          id: PublicSchema.leagues.id,
          minGamesPerSeason: PublicSchema.leagues.minGamesPerSeason,
          gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      if (leagueResult.length === 0) {
        throw new Error(`League ${leagueId} not found`);
      }

      const league = leagueResult[0];
      const leagueConfig: LeagueConfig = {
        id: league.id,
        minGamesPerSeason: league.minGamesPerSeason ?? 10,
        gamesPerMatchup: league.gamesPerMatchup ?? 5,
      };

      // 2. Fetch teams in the league
      const teamsResult = await db
        .select({
          id: PublicSchema.teams.id,
          name: PublicSchema.teams.name,
          leagueId: PublicSchema.teams.leagueId,
        })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, leagueId));

      const teams: TeamInfo[] = teamsResult.map((t) => ({
        id: t.id,
        name: t.name,
        leagueId: t.leagueId,
      }));

      if (teams.length < 2) {
        return {
          matchups: [],
          seasonUsage: new Map(),
          warnings: ['League must have at least 2 teams to generate schedule'],
        };
      }

      // 3. Fetch team rosters (team_members)
      const teamIds = teams.map((t) => t.id);
      const teamMembersResult = await db
        .select({
          teamId: PublicSchema.teamMembers.teamId,
          playerId: PublicSchema.teamMembers.playerId,
        })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            inArray(PublicSchema.teamMembers.teamId, teamIds),
            eq(PublicSchema.teamMembers.leagueId, leagueId)
          )
        );

      const teamRosters: TeamRoster[] = [];
      const teamPlayerMap = new Map<number, number[]>();

      for (const tm of teamMembersResult) {
        if (!tm.teamId) continue;
        if (!teamPlayerMap.has(tm.teamId)) {
          teamPlayerMap.set(tm.teamId, []);
        }
        teamPlayerMap.get(tm.teamId).push(tm.playerId);
      }

      for (const teamId of teamIds) {
        teamRosters.push({
          teamId,
          playerIds: teamPlayerMap.get(teamId) ?? [],
        });
      }

      // 4. Fetch player game counts across all seasons
      const allPlayerIds = Array.from(
        new Set(teamMembersResult.map((tm) => tm.playerId))
      );

      if (allPlayerIds.length === 0) {
        return {
          matchups: [],
          seasonUsage: new Map(),
          warnings: ['No players found on teams. Cannot determine eligible seasons.'],
        };
      }

      // Query season_batting and season_fielding to get game counts per season
      // We'll use the maximum games from batting or fielding for each player/season
      const battingStats = await db
        .select({
          playerId: PublicSchema.seasonBatting.playerId,
          season: PublicSchema.seasonBatting.season,
          g: PublicSchema.seasonBatting.g,
        })
        .from(PublicSchema.seasonBatting)
        .where(inArray(PublicSchema.seasonBatting.playerId, allPlayerIds));

      const fieldingStats = await db
        .select({
          playerId: PublicSchema.seasonFielding.playerId,
          season: PublicSchema.seasonFielding.season,
          g: PublicSchema.seasonFielding.g,
        })
        .from(PublicSchema.seasonFielding)
        .where(inArray(PublicSchema.seasonFielding.playerId, allPlayerIds));

      // Aggregate game counts per player per season (take max from batting/fielding)
      const gameCountMap = new Map<string, number>(); // key: "playerId-season"
      
      for (const stat of battingStats) {
        const key = `${stat.playerId}-${stat.season}`;
        const games = stat.g ?? 0;
        gameCountMap.set(key, Math.max(gameCountMap.get(key) ?? 0, games));
      }

      for (const stat of fieldingStats) {
        const key = `${stat.playerId}-${stat.season}`;
        const games = stat.g ?? 0;
        gameCountMap.set(key, Math.max(gameCountMap.get(key) ?? 0, games));
      }

      const playerGameCounts: PlayerGameCount[] = [];
      for (const [key, count] of gameCountMap) {
        const [playerIdStr, seasonStr] = key.split('-');
        playerGameCounts.push({
          playerId: parseInt(playerIdStr),
          season: parseInt(seasonStr),
          gamesPlayed: count,
        });
      }

      // 5. Determine eligible seasons
      const eligibleSeasons: SeasonInfo[] = determineEligibleSeasons({
        teamRosters,
        playerGameCounts,
        minGamesPerSeason: leagueConfig.minGamesPerSeason,
      });

      // 6. Create appropriate strategy
      const strategy = this.createStrategy(strategyType);

      // 7. Generate schedule
      const scheduler = new MatchupScheduler(strategy);
      const scheduleResult = scheduler.generateSchedule({
        teams,
        numberOfWeeks,
        leagueConfig,
        eligibleSeasons,
      });

      return scheduleResult;
    });
  }

  /**
   * Save generated schedule to database
   */
  static async saveSchedule(
    leagueId: number,
    scheduleResult: ScheduleResult
  ): Promise<void> {
    await runWithPublicClient(getDbOptions(), async (db) => {
      // Delete existing matchups for this league (if regenerating)
      await db
        .delete(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.leagueId, leagueId));

      // Insert new matchups
      for (const matchup of scheduleResult.matchups) {
        await db.insert(PublicSchema.matchups).values({
          weekNumber: matchup.weekNumber,
          leagueId: matchup.leagueId,
          team1Id: matchup.team1Id,
          team2Id: matchup.team2Id,
          selectedSeason: matchup.selectedSeason,
          gamesPerMatchup: matchup.gamesPerMatchup,
          status: matchup.status,
          team1Score: null,
          team2Score: null,
          startTime: null,
          endTime: null,
        });
      }
    });
  }

  /**
   * Generate and save schedule in one operation
   */
  static async generateAndSaveSchedule(
    params: GenerateScheduleParams
  ): Promise<ScheduleResult> {
    const scheduleResult = await this.generateSchedule(params);
    await this.saveSchedule(params.leagueId, scheduleResult);
    return scheduleResult;
  }

  /**
   * Create a single matchup
   */
  static async createMatchup(params: CreateMatchupParams): Promise<number> {
    return await runWithPublicClient(getDbOptions(), async (db) => {
      const result = await db
        .insert(PublicSchema.matchups)
        .values({
          weekNumber: params.weekNumber,
          leagueId: params.leagueId,
          team1Id: params.team1Id,
          team2Id: params.team2Id,
          selectedSeason: params.selectedSeason,
          gamesPerMatchup: params.gamesPerMatchup,
          status: params.status ?? 'scheduled',
          team1Score: null,
          team2Score: null,
          startTime: null,
          endTime: null,
        })
        .returning({ id: PublicSchema.matchups.id });

      return result[0].id;
    });
  }

  /**
   * Get matchups for a league
   */
  static async getLeagueMatchups(leagueId: number) {
    return await runWithPublicClient(getDbOptions(), async (db) => {
      return await db
        .select()
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.leagueId, leagueId));
    });
  }

  /**
   * Get matchups for a specific week
   */
  static async getWeekMatchups(leagueId: number, weekNumber: number) {
    return await runWithPublicClient(getDbOptions(), async (db) => {
      return await db
        .select()
        .from(PublicSchema.matchups)
        .where(
          and(
            eq(PublicSchema.matchups.leagueId, leagueId),
            eq(PublicSchema.matchups.weekNumber, weekNumber)
          )
        );
    });
  }

  /**
   * Factory method for creating strategies
   */
  private static createStrategy(
    strategyType: 'round-robin' | 'divisional' | 'random'
  ): SchedulingStrategy {
    switch (strategyType) {
      case 'round-robin':
        return new RoundRobinStrategy();
      case 'divisional':
        return new DivisionalStrategy();
      case 'random':
        return new RandomStrategy();
    }
  }
}
