/**
 * Tests for random scheduling strategy
 */

import { RandomStrategy } from '../strategies/random-strategy';
import type { TeamInfo } from '../types';

describe('RandomStrategy', () => {
  const strategy = new RandomStrategy();

  it('should generate pairings for even number of teams', () => {
    const teams: TeamInfo[] = [
      { id: 1, name: 'Team 1', leagueId: 1 },
      { id: 2, name: 'Team 2', leagueId: 1 },
      { id: 3, name: 'Team 3', leagueId: 1 },
      { id: 4, name: 'Team 4', leagueId: 1 },
    ];

    const numberOfWeeks = 5;
    const pairings = strategy.generatePairings(teams, numberOfWeeks);

    expect(pairings.length).toBe(10); // 5 weeks * 2 matches per week

    // Check each team plays exactly once per week
    for (let week = 1; week <= numberOfWeeks; week++) {
      const weekPairings = pairings.filter((p) => p.weekNumber === week);
      const teamsInWeek = new Set<number>();

      for (const pairing of weekPairings) {
        teamsInWeek.add(pairing.team1Id);
        teamsInWeek.add(pairing.team2Id);
      }

      expect(teamsInWeek.size).toBe(4); // All teams play
      expect(weekPairings.length).toBe(2); // 2 matches
    }
  });

  it('should generate pairings for odd number of teams', () => {
    const teams: TeamInfo[] = [
      { id: 1, name: 'Team 1', leagueId: 1 },
      { id: 2, name: 'Team 2', leagueId: 1 },
      { id: 3, name: 'Team 3', leagueId: 1 },
    ];

    const numberOfWeeks = 5;
    const pairings = strategy.generatePairings(teams, numberOfWeeks);

    expect(pairings.length).toBe(5); // 5 weeks * 1 match per week

    // Check each week has exactly 1 match (one team gets bye)
    for (let week = 1; week <= numberOfWeeks; week++) {
      const weekPairings = pairings.filter((p) => p.weekNumber === week);
      expect(weekPairings.length).toBe(1);

      const teamsInWeek = new Set<number>();
      for (const pairing of weekPairings) {
        teamsInWeek.add(pairing.team1Id);
        teamsInWeek.add(pairing.team2Id);
      }

      expect(teamsInWeek.size).toBe(2);
    }
  });

  it('should return empty array for fewer than 2 teams', () => {
    const teams: TeamInfo[] = [{ id: 1, name: 'Team 1', leagueId: 1 }];

    const pairings = strategy.generatePairings(teams, 5);

    expect(pairings).toEqual([]);
  });

  it('should maintain home/away balance', () => {
    const teams: TeamInfo[] = [
      { id: 1, name: 'Team 1', leagueId: 1 },
      { id: 2, name: 'Team 2', leagueId: 1 },
      { id: 3, name: 'Team 3', leagueId: 1 },
      { id: 4, name: 'Team 4', leagueId: 1 },
    ];

    const numberOfWeeks = 10;
    const pairings = strategy.generatePairings(teams, numberOfWeeks);

    // Count home appearances for each team
    const homeCount = new Map<number, number>();
    for (const team of teams) {
      homeCount.set(team.id, 0);
    }

    for (const pairing of pairings) {
      homeCount.set(pairing.team1Id, (homeCount.get(pairing.team1Id) ?? 0) + 1);
    }

    // All teams should have roughly balanced home game counts
    const counts = Array.from(homeCount.values());
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    
    // With 10 weeks and 4 teams, each team plays 10 games
    // Home games should be roughly 5 each, within a reasonable range
    expect(max - min).toBeLessThanOrEqual(3);
  });

  it('should produce different schedules on repeated calls', () => {
    const teams: TeamInfo[] = [
      { id: 1, name: 'Team 1', leagueId: 1 },
      { id: 2, name: 'Team 2', leagueId: 1 },
      { id: 3, name: 'Team 3', leagueId: 1 },
      { id: 4, name: 'Team 4', leagueId: 1 },
    ];

    const numberOfWeeks = 3;
    const schedule1 = strategy.generatePairings(teams, numberOfWeeks);
    const schedule2 = strategy.generatePairings(teams, numberOfWeeks);

    // Convert to strings for comparison
    const schedule1Str = schedule1
      .map((p) => `${p.weekNumber}:${p.team1Id}-${p.team2Id}`)
      .join('|');
    const schedule2Str = schedule2
      .map((p) => `${p.weekNumber}:${p.team1Id}-${p.team2Id}`)
      .join('|');

    // Schedules should be different (with very high probability)
    expect(schedule1Str).not.toBe(schedule2Str);
  });

  it('should have correct strategy name', () => {
    expect(strategy.getName()).toBe('random');
  });
});
