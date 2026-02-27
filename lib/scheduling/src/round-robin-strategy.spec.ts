/**
 * Tests for round-robin scheduling strategy
 */

import { RoundRobinStrategy } from './strategies/round-robin-strategy';
import type { TeamInfo } from './types';

describe('RoundRobinStrategy', () => {
  const strategy = new RoundRobinStrategy();

  it('should generate pairings for even number of teams', () => {
    const teams: TeamInfo[] = [
      { id: 1, name: 'Team 1', leagueId: 1 },
      { id: 2, name: 'Team 2', leagueId: 1 },
      { id: 3, name: 'Team 3', leagueId: 1 },
      { id: 4, name: 'Team 4', leagueId: 1 },
    ];

    const numberOfWeeks = 3; // 4 teams = 3 rounds for full round-robin
    const pairings = strategy.generatePairings(teams, numberOfWeeks);

    // Each team plays 3 games (against each other team once)
    expect(pairings.length).toBe(6); // 3 weeks * 2 matches per week

    // Check each team plays exactly once per week
    for (let week = 1; week <= numberOfWeeks; week++) {
      const weekPairings = pairings.filter((p) => p.weekNumber === week);
      const teamsInWeek = new Set<number>();

      for (const pairing of weekPairings) {
        teamsInWeek.add(pairing.team1Id);
        teamsInWeek.add(pairing.team2Id);
      }

      expect(teamsInWeek.size).toBe(4); // All teams play
    }

    // Check no duplicate pairings
    const pairingSet = new Set<string>();
    for (const pairing of pairings) {
      const key = [pairing.team1Id, pairing.team2Id].sort().join('-');
      expect(pairingSet.has(key)).toBe(false);
      pairingSet.add(key);
    }
  });

  it('should generate pairings for odd number of teams', () => {
    const teams: TeamInfo[] = [
      { id: 1, name: 'Team 1', leagueId: 1 },
      { id: 2, name: 'Team 2', leagueId: 1 },
      { id: 3, name: 'Team 3', leagueId: 1 },
    ];

    const numberOfWeeks = 3;
    const pairings = strategy.generatePairings(teams, numberOfWeeks);

    // 3 teams = 3 rounds, 1 match per round
    expect(pairings.length).toBe(3);

    // Check each week has exactly 1 match (one team gets bye)
    for (let week = 1; week <= numberOfWeeks; week++) {
      const weekPairings = pairings.filter((p) => p.weekNumber === week);
      expect(weekPairings.length).toBe(1);
    }
  });

  it('should handle extended season with repeat pairings', () => {
    const teams: TeamInfo[] = [
      { id: 1, name: 'Team 1', leagueId: 1 },
      { id: 2, name: 'Team 2', leagueId: 1 },
    ];

    const numberOfWeeks = 5; // More than 1 round
    const pairings = strategy.generatePairings(teams, numberOfWeeks);

    expect(pairings.length).toBe(5); // 5 weeks, 1 match per week

    // All pairings should be between teams 1 and 2
    for (const pairing of pairings) {
      const teams = [pairing.team1Id, pairing.team2Id].sort();
      expect(teams).toEqual([1, 2]);
    }

    // Check home/away alternates in repeated rounds
    expect(pairings[0].team1Id).not.toBe(pairings[1].team1Id);
  });

  it('should return empty array for fewer than 2 teams', () => {
    const teams: TeamInfo[] = [{ id: 1, name: 'Team 1', leagueId: 1 }];

    const pairings = strategy.generatePairings(teams, 5);

    expect(pairings).toEqual([]);
  });

  it('should ensure home/away balance', () => {
    const teams: TeamInfo[] = [
      { id: 1, name: 'Team 1', leagueId: 1 },
      { id: 2, name: 'Team 2', leagueId: 1 },
      { id: 3, name: 'Team 3', leagueId: 1 },
      { id: 4, name: 'Team 4', leagueId: 1 },
    ];

    const numberOfWeeks = 6; // 2 full round-robins
    const pairings = strategy.generatePairings(teams, numberOfWeeks);

    // Count home appearances for each team
    const homeCount = new Map<number, number>();
    for (const team of teams) {
      homeCount.set(team.id, 0);
    }

    for (const pairing of pairings) {
      homeCount.set(pairing.team1Id, (homeCount.get(pairing.team1Id) ?? 0) + 1);
    }

    // All teams should have similar home game counts (within 1)
    const counts = Array.from(homeCount.values());
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    expect(max - min).toBeLessThanOrEqual(1);
  });

  it('should have correct strategy name', () => {
    expect(strategy.getName()).toBe('round-robin');
  });
});
