/**
 * Tests for matchup scheduler
 */

import { MatchupScheduler } from './matchup-scheduler';
import { RoundRobinStrategy } from './strategies/round-robin-strategy';
import { RandomStrategy } from './strategies/random-strategy';
import type {
  LeagueConfig,
  ScheduleParams,
  SeasonInfo,
  TeamInfo,
} from './types';

describe('MatchupScheduler', () => {
  const teams: TeamInfo[] = [
    { id: 1, name: 'Team 1', leagueId: 1 },
    { id: 2, name: 'Team 2', leagueId: 1 },
    { id: 3, name: 'Team 3', leagueId: 1 },
    { id: 4, name: 'Team 4', leagueId: 1 },
  ];

  const leagueConfig: LeagueConfig = {
    id: 1,
    minGamesPerSeason: 10,
    gamesPerMatchup: 5,
  };

  const eligibleSeasons: SeasonInfo[] = [
    { season: 2023, eligibleTeamIds: [1, 2, 3, 4], totalGames: 1000 },
    { season: 2022, eligibleTeamIds: [1, 2, 3, 4], totalGames: 950 },
  ];

  it('should generate a complete schedule with round-robin strategy', () => {
    const strategy = new RoundRobinStrategy();
    const scheduler = new MatchupScheduler(strategy);

    const params: ScheduleParams = {
      teams,
      numberOfWeeks: 3,
      leagueConfig,
      eligibleSeasons,
    };

    const result = scheduler.generateSchedule(params);

    expect(result.matchups.length).toBe(6); // 3 weeks * 2 matches
    expect(result.warnings.length).toBe(0);

    // Check all matchups are properly configured
    for (const matchup of result.matchups) {
      // Note: selectedSeason removed - seasons are now per-player
      expect(matchup.gamesPerMatchup).toBe(5);
      expect(matchup.status).toBe('scheduled');
      expect(matchup.leagueId).toBe(1);
    }

    // Check season usage
    expect(result.seasonUsage.size).toBeGreaterThan(0);
    const totalUsage = Array.from(result.seasonUsage.values()).reduce(
      (sum, count) => sum + count,
      0,
    );
    expect(totalUsage).toBe(6);
  });

  it('should generate warnings when no eligible seasons', () => {
    const strategy = new RoundRobinStrategy();
    const scheduler = new MatchupScheduler(strategy);

    const params: ScheduleParams = {
      teams,
      numberOfWeeks: 3,
      leagueConfig,
      eligibleSeasons: [],
    };

    const result = scheduler.generateSchedule(params);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('No eligible seasons');

    // Matchups still generated
    expect(result.matchups.length).toBe(6);
    for (const matchup of result.matchups) {
      // Note: selectedSeason removed - seasons are now per-player
      // gamesPerMatchup comes from league config, not season selection
      expect(matchup.gamesPerMatchup).toBe(5);
    }
  });

  it('should handle partial season eligibility', () => {
    const strategy = new RoundRobinStrategy();
    const scheduler = new MatchupScheduler(strategy);

    const partialSeasons: SeasonInfo[] = [
      { season: 2023, eligibleTeamIds: [1, 2], totalGames: 500 }, // Only teams 1 & 2
      { season: 2022, eligibleTeamIds: [3, 4], totalGames: 500 }, // Only teams 3 & 4
    ];

    const params: ScheduleParams = {
      teams,
      numberOfWeeks: 3,
      leagueConfig,
      eligibleSeasons: partialSeasons,
    };

    const result = scheduler.generateSchedule(params);

    expect(result.warnings.length).toBeGreaterThan(0);

    // Note: selectedSeason removed - seasons are now per-player
    // Test that matchups are still created despite partial eligibility
    expect(result.matchups.length).toBeGreaterThan(0);
  });

  it('should handle fewer than 2 teams', () => {
    const strategy = new RoundRobinStrategy();
    const scheduler = new MatchupScheduler(strategy);

    const params: ScheduleParams = {
      teams: [teams[0]],
      numberOfWeeks: 3,
      leagueConfig,
      eligibleSeasons,
    };

    const result = scheduler.generateSchedule(params);

    expect(result.matchups).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('fewer than 2 teams');
  });

  it('should handle invalid numberOfWeeks', () => {
    const strategy = new RoundRobinStrategy();
    const scheduler = new MatchupScheduler(strategy);

    const params: ScheduleParams = {
      teams,
      numberOfWeeks: 0,
      leagueConfig,
      eligibleSeasons,
    };

    const result = scheduler.generateSchedule(params);

    expect(result.matchups).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('numberOfWeeks must be >= 1');
  });

  it('should support strategy switching', () => {
    const roundRobin = new RoundRobinStrategy();
    const random = new RandomStrategy();
    const scheduler = new MatchupScheduler(roundRobin);

    expect(scheduler.getStrategy().getName()).toBe('round-robin');

    scheduler.setStrategy(random);
    expect(scheduler.getStrategy().getName()).toBe('random');
  });

  it('should generate week schedule', () => {
    const strategy = new RoundRobinStrategy();
    const scheduler = new MatchupScheduler(strategy);

    const params: ScheduleParams = {
      teams,
      numberOfWeeks: 5, // This will be overridden
      leagueConfig,
      eligibleSeasons,
    };

    const result = scheduler.generateWeekSchedule(params);

    // Should only have 1 week
    const weeks = new Set(result.matchups.map((m) => m.weekNumber));
    expect(weeks.size).toBe(1);
    expect(weeks.has(1)).toBe(true);
  });

  it('should balance season usage', () => {
    const strategy = new RoundRobinStrategy();
    const scheduler = new MatchupScheduler(strategy);

    const params: ScheduleParams = {
      teams,
      numberOfWeeks: 10,
      leagueConfig,
      eligibleSeasons,
    };

    const result = scheduler.generateSchedule(params);

    // Both seasons should be used
    expect(result.seasonUsage.size).toBe(2);

    // Usage should be relatively balanced (not perfect due to randomness)
    const usage2023 = result.seasonUsage.get(2023) ?? 0;
    const usage2022 = result.seasonUsage.get(2022) ?? 0;

    expect(Math.abs(usage2023 - usage2022)).toBeLessThanOrEqual(10);
  });
});
