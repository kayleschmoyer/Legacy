/**
 * Main matchup scheduler
 *
 * Orchestrates the scheduling process:
 * 1. Generate team pairings using selected strategy
 * 2. Select eligible seasons for each matchup
 * 3. Build complete schedule with all metadata
 */

import type { ScheduledMatchup, ScheduleParams, ScheduleResult } from './types';
import type { SchedulingStrategy } from './strategies/strategy-interface';
import { selectRandomSeason } from './season-selector';

export class MatchupScheduler {
  private strategy: SchedulingStrategy;

  constructor(strategy: SchedulingStrategy) {
    this.strategy = strategy;
  }

  /**
   * Generate a complete schedule for a league
   */
  generateSchedule(params: ScheduleParams): ScheduleResult {
    const { teams, numberOfWeeks, leagueConfig, eligibleSeasons } = params;
    const warnings: string[] = [];

    // Validate inputs
    if (teams.length < 2) {
      return {
        matchups: [],
        seasonUsage: new Map(),
        warnings: ['Cannot generate schedule: fewer than 2 teams'],
      };
    }

    if (numberOfWeeks < 1) {
      return {
        matchups: [],
        seasonUsage: new Map(),
        warnings: ['Cannot generate schedule: numberOfWeeks must be >= 1'],
      };
    }

    if (eligibleSeasons.length === 0) {
      warnings.push(
        'No eligible seasons available. Check league min_games_per_season configuration and player game counts.',
      );
    }

    // Step 1: Generate team pairings using strategy
    const pairings = this.strategy.generatePairings(teams, numberOfWeeks);

    // Step 2: Select seasons for each pairing
    const seasonUsage = new Map<number, number>();
    const matchups: ScheduledMatchup[] = [];

    for (const pairing of pairings) {
      // Select a season for this matchup
      const selectedSeason = selectRandomSeason({
        eligibleSeasons,
        teamIds: [pairing.team1Id, pairing.team2Id],
        usedSeasonCounts: seasonUsage,
      });

      if (selectedSeason === null) {
        warnings.push(
          `No eligible season found for matchup: Team ${pairing.team1Id} vs Team ${pairing.team2Id} (Week ${pairing.weekNumber})`,
        );
      }

      // Update season usage
      if (selectedSeason !== null) {
        seasonUsage.set(
          selectedSeason,
          (seasonUsage.get(selectedSeason) ?? 0) + 1,
        );
      }

      // Build scheduled matchup
      matchups.push({
        weekNumber: pairing.weekNumber,
        leagueId: leagueConfig.id,
        team1Id: pairing.team1Id,
        team2Id: pairing.team2Id,
        selectedSeason: selectedSeason,
        gamesPerMatchup:
          selectedSeason !== null ? leagueConfig.gamesPerMatchup : null,
        status: 'scheduled',
      });
    }

    return {
      matchups,
      seasonUsage,
      warnings,
    };
  }

  /**
   * Generate schedule for a single week
   */
  generateWeekSchedule(params: ScheduleParams): ScheduleResult {
    return this.generateSchedule({
      ...params,
      numberOfWeeks: 1,
    });
  }

  /**
   * Get the current strategy
   */
  getStrategy(): SchedulingStrategy {
    return this.strategy;
  }

  /**
   * Set a new strategy
   */
  setStrategy(strategy: SchedulingStrategy): void {
    this.strategy = strategy;
  }
}
