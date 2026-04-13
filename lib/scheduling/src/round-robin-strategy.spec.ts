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

  it('should produce correct matchups for all weeks in seasons longer than two full cycles', () => {
    // 10 teams = 9 rounds per cycle. A 20-week season spans slightly more than 2 full cycles.
    // Bug: `week % baseSchedule.length` uses 45 (total pairing objects) instead of 9 (unique weeks),
    // so weeks 19-20 receive no matchups.
    const teams: TeamInfo[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Team ${i + 1}`,
      leagueId: 1,
    }));

    const numberOfWeeks = 20;
    const pairings = strategy.generatePairings(teams, numberOfWeeks);

    // Every week must have exactly 5 matchups (10 teams / 2)
    for (let week = 1; week <= numberOfWeeks; week++) {
      const weekPairings = pairings.filter((p) => p.weekNumber === week);
      expect(weekPairings.length).toBe(5);
    }
  });

  it('should never schedule the same team pair in consecutive weeks', () => {
    const teams: TeamInfo[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Team ${i + 1}`,
      leagueId: 1,
    }));

    const numberOfWeeks = 20;
    const pairings = strategy.generatePairings(teams, numberOfWeeks);

    for (let week = 1; week < numberOfWeeks; week++) {
      const thisWeekPairs = pairings
        .filter((p) => p.weekNumber === week)
        .map((p) => [p.team1Id, p.team2Id].sort().join('-'));

      const nextWeekPairs = pairings
        .filter((p) => p.weekNumber === week + 1)
        .map((p) => [p.team1Id, p.team2Id].sort().join('-'));

      for (const pair of thisWeekPairs) {
        expect(nextWeekPairs).not.toContain(pair);
      }
    }
  });

  it('should correctly repeat schedule for a 4-team league over 3 full cycles (12 weeks)', () => {
    // 4 teams = 3 rounds per cycle. 12 weeks = exactly 4 full cycles.
    const teams: TeamInfo[] = [
      { id: 1, name: 'Team 1', leagueId: 1 },
      { id: 2, name: 'Team 2', leagueId: 1 },
      { id: 3, name: 'Team 3', leagueId: 1 },
      { id: 4, name: 'Team 4', leagueId: 1 },
    ];

    const numberOfWeeks = 12;
    const pairings = strategy.generatePairings(teams, numberOfWeeks);

    // Every week must have exactly 2 matchups (4 teams / 2)
    for (let week = 1; week <= numberOfWeeks; week++) {
      const weekPairings = pairings.filter((p) => p.weekNumber === week);
      expect(weekPairings.length).toBe(2);
    }

    // Total matchups should be 12 weeks * 2 = 24
    expect(pairings.length).toBe(24);
  });

  it('should not cluster the same pair 3+ times in any 5-week window', () => {
    // Regression test: when weeks are added by generating a full schedule and
    // extracting the tail, the round-robin cycle must remain evenly distributed.
    // This covers team counts 3-10 across various season lengths.
    const pairKey = (t1: number, t2: number): string =>
      t1 < t2 ? `${t1}-${t2}` : `${t2}-${t1}`;

    for (let teamCount = 3; teamCount <= 10; teamCount++) {
      const teams: TeamInfo[] = Array.from({ length: teamCount }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        leagueId: 1,
      }));

      for (const numberOfWeeks of [5, 10, 15, 20, 25]) {
        const pairings = strategy.generatePairings(teams, numberOfWeeks);

        // Build week -> pair keys map
        const weekPairs = new Map<number, string[]>();
        for (const p of pairings) {
          const key = pairKey(p.team1Id, p.team2Id);
          if (!weekPairs.has(p.weekNumber)) weekPairs.set(p.weekNumber, []);
          const weekList = weekPairs.get(p.weekNumber);
          if (weekList) weekList.push(key);
        }

        // Sliding 5-week window: no pair should appear 3+ times
        for (let start = 1; start <= numberOfWeeks - 4; start++) {
          const pairCounts = new Map<string, number>();
          for (let w = start; w < start + 5; w++) {
            for (const pair of weekPairs.get(w) ?? []) {
              pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
            }
          }
          for (const [pair, count] of pairCounts) {
            if (count >= 3) {
              throw new Error(
                `${teamCount} teams, ${numberOfWeeks} weeks: pair ${pair} ` +
                  `appears ${count}x in weeks ${start}-${start + 4}`,
              );
            }
          }
        }
      }
    }
  });

  it('should not repeat boundary pairings when the full schedule tail is used for added weeks', () => {
    // Regression: adjustMatchupsForNewTotal generates a full N-week schedule
    // and inserts only weeks > highestWeek. This verifies the tail of the full
    // schedule doesn't duplicate pairings from the last existing week, and that
    // a fresh M-week generation (old approach) would produce different pairings
    // than the correct full-schedule tail.
    const teams: TeamInfo[] = [
      { id: 1, name: 'Team 1', leagueId: 1 },
      { id: 2, name: 'Team 2', leagueId: 1 },
      { id: 3, name: 'Team 3', leagueId: 1 },
      { id: 4, name: 'Team 4', leagueId: 1 },
    ];

    const initialWeeks = 4;
    const totalWeeks = 7;
    const addedWeeks = totalWeeks - initialWeeks;

    const pairKey = (t1: number, t2: number): string =>
      t1 < t2 ? `${t1}-${t2}` : `${t2}-${t1}`;

    // Correct approach: generate full schedule, extract tail
    const fullPairings = strategy.generatePairings(teams, totalWeeks);
    const tailPairings = fullPairings.filter(
      (p) => p.weekNumber > initialWeeks,
    );

    // Old (buggy) approach: generate fresh schedule for just the added weeks
    const freshPairings = strategy.generatePairings(teams, addedWeeks);

    // The fresh generation restarts from round 0, so week 1 of fresh == week 1
    // of full — that's different from the correct tail (weeks 5-7).
    const freshWeek1Pairs = freshPairings
      .filter((p) => p.weekNumber === 1)
      .map((p) => pairKey(p.team1Id, p.team2Id))
      .sort();
    const tailWeek5Pairs = tailPairings
      .filter((p) => p.weekNumber === initialWeeks + 1)
      .map((p) => pairKey(p.team1Id, p.team2Id))
      .sort();

    expect(freshWeek1Pairs).not.toEqual(tailWeek5Pairs);

    // Boundary check: no pair in the last original week should appear in the
    // first added week of the correct tail
    const lastOriginalWeekPairs = fullPairings
      .filter((p) => p.weekNumber === initialWeeks)
      .map((p) => pairKey(p.team1Id, p.team2Id));

    for (const pair of tailWeek5Pairs) {
      expect(lastOriginalWeekPairs).not.toContain(pair);
    }
  });
});
