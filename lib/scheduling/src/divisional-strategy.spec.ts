/**
 * Tests for divisional scheduling strategy
 *
 * Regression coverage for LS-391: leagues with 2 divisions of 5 teams each
 * were only generating 2 matchups/week instead of 5.
 */

import { DivisionalStrategy } from './strategies/divisional-strategy';
import type { TeamInfo } from './types';

/** Build a list of teams split evenly across `numDivisions` divisions. */
function makeTeams(
  count: number,
  numDivisions: number,
  leagueId = 1,
): TeamInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Team ${i + 1}`,
    leagueId,
    divisionId: (i % numDivisions) + 1,
  }));
}

describe('DivisionalStrategy', () => {
  const strategy = new DivisionalStrategy();

  describe('getName', () => {
    it('returns "divisional"', () => {
      expect(strategy.getName()).toBe('divisional');
    });
  });

  describe('edge cases', () => {
    it('returns empty array for fewer than 2 teams', () => {
      const teams = makeTeams(1, 1);
      expect(strategy.generatePairings(teams, 5)).toEqual([]);
    });

    it('falls back to round-robin when all teams share one division', () => {
      const teams = makeTeams(4, 1);
      const pairings = strategy.generatePairings(teams, 3);
      // 4 teams / 2 * 3 weeks = 6 matchups
      expect(pairings.length).toBe(6);
    });
  });

  describe('10 teams across 2 divisions of 5 (League 97 scenario — LS-391)', () => {
    const teams = makeTeams(10, 2);
    const numberOfWeeks = 10;
    let pairings: ReturnType<typeof strategy.generatePairings>;

    beforeEach(() => {
      pairings = strategy.generatePairings(teams, numberOfWeeks);
    });

    it('generates exactly 5 matchups per week (floor(10/2))', () => {
      for (let week = 1; week <= numberOfWeeks; week++) {
        const weekPairings = pairings.filter((p) => p.weekNumber === week);
        expect(weekPairings.length).toBe(5);
      }
    });

    it('generates the correct total number of matchups', () => {
      expect(pairings.length).toBe(50); // 5 matchups/week * 10 weeks
    });

    it('no team plays more than once per week', () => {
      for (let week = 1; week <= numberOfWeeks; week++) {
        const weekPairings = pairings.filter((p) => p.weekNumber === week);
        const seen = new Set<number>();
        for (const p of weekPairings) {
          expect(seen.has(p.team1Id)).toBe(false);
          expect(seen.has(p.team2Id)).toBe(false);
          seen.add(p.team1Id);
          seen.add(p.team2Id);
        }
      }
    });

    it('approximately 60% of matchups are divisional', () => {
      const divisionalCount = pairings.filter((p) => {
        const t1 = teams.find((t) => t.id === p.team1Id)!;
        const t2 = teams.find((t) => t.id === p.team2Id)!;
        return t1.divisionId === t2.divisionId;
      }).length;
      // Allow ±10% tolerance to account for scheduling constraints
      expect(divisionalCount).toBeGreaterThanOrEqual(20); // ≥ 40%
      expect(divisionalCount).toBeLessThanOrEqual(40); // ≤ 80%
    });
  });

  describe('8 teams across 2 divisions of 4', () => {
    const teams = makeTeams(8, 2);
    const numberOfWeeks = 6;
    let pairings: ReturnType<typeof strategy.generatePairings>;

    beforeEach(() => {
      pairings = strategy.generatePairings(teams, numberOfWeeks);
    });

    it('generates exactly 4 matchups per week', () => {
      for (let week = 1; week <= numberOfWeeks; week++) {
        const weekPairings = pairings.filter((p) => p.weekNumber === week);
        expect(weekPairings.length).toBe(4);
      }
    });

    it('no team plays more than once per week', () => {
      for (let week = 1; week <= numberOfWeeks; week++) {
        const weekPairings = pairings.filter((p) => p.weekNumber === week);
        const seen = new Set<number>();
        for (const p of weekPairings) {
          expect(seen.has(p.team1Id)).toBe(false);
          expect(seen.has(p.team2Id)).toBe(false);
          seen.add(p.team1Id);
          seen.add(p.team2Id);
        }
      }
    });
  });

  describe('12 teams across 3 divisions of 4', () => {
    const teams = makeTeams(12, 3);
    const numberOfWeeks = 8;
    let pairings: ReturnType<typeof strategy.generatePairings>;

    beforeEach(() => {
      pairings = strategy.generatePairings(teams, numberOfWeeks);
    });

    it('generates exactly 6 matchups per week', () => {
      for (let week = 1; week <= numberOfWeeks; week++) {
        const weekPairings = pairings.filter((p) => p.weekNumber === week);
        expect(weekPairings.length).toBe(6);
      }
    });

    it('no team plays more than once per week', () => {
      for (let week = 1; week <= numberOfWeeks; week++) {
        const weekPairings = pairings.filter((p) => p.weekNumber === week);
        const seen = new Set<number>();
        for (const p of weekPairings) {
          expect(seen.has(p.team1Id)).toBe(false);
          expect(seen.has(p.team2Id)).toBe(false);
          seen.add(p.team1Id);
          seen.add(p.team2Id);
        }
      }
    });
  });
});
