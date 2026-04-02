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
        const t1 = teams.find((t) => t.id === p.team1Id);
        const t2 = teams.find((t) => t.id === p.team2Id);
        return (
          t1 !== undefined &&
          t2 !== undefined &&
          t1.divisionId === t2.divisionId
        );
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

  describe('7 teams across 3 divisions (3+2+2) — odd team bye week', () => {
    const teams = makeTeams(7, 3);
    const numberOfWeeks = 7;
    let pairings: ReturnType<typeof strategy.generatePairings>;

    beforeEach(() => {
      pairings = strategy.generatePairings(teams, numberOfWeeks);
    });

    it('generates exactly 3 matchups per week (floor(7/2))', () => {
      for (let week = 1; week <= numberOfWeeks; week++) {
        const weekPairings = pairings.filter((p) => p.weekNumber === week);
        expect(weekPairings.length).toBe(3);
      }
    });

    it('generates the correct total number of matchups', () => {
      expect(pairings.length).toBe(21); // 3 matchups/week * 7 weeks
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

    it('every team receives exactly one bye across 7 weeks', () => {
      const activeTeamIds = new Set(teams.map((t) => t.id));
      const byeCounts = new Map<number, number>();
      for (const id of activeTeamIds) byeCounts.set(id, 0);

      for (let week = 1; week <= numberOfWeeks; week++) {
        const weekPairings = pairings.filter((p) => p.weekNumber === week);
        const playingThisWeek = new Set<number>();
        for (const p of weekPairings) {
          playingThisWeek.add(p.team1Id);
          playingThisWeek.add(p.team2Id);
        }
        for (const id of activeTeamIds) {
          if (!playingThisWeek.has(id)) {
            byeCounts.set(id, (byeCounts.get(id) ?? 0) + 1);
          }
        }
      }

      // Each team should have exactly 1 bye in 7 weeks (7 teams × 1 bye each)
      for (const [, count] of byeCounts) {
        expect(count).toBe(1);
      }
    });
  });

  describe('7 teams across 3 divisions — bye distribution when weeks is not a multiple of team count (10 weeks)', () => {
    const teams = makeTeams(7, 3);
    const numberOfWeeks = 10;
    let pairings: ReturnType<typeof strategy.generatePairings>;

    beforeEach(() => {
      pairings = strategy.generatePairings(teams, numberOfWeeks);
    });

    it('bye counts differ by at most 1 across all teams', () => {
      const activeTeamIds = new Set(teams.map((t) => t.id));
      const byeCounts = new Map<number, number>();
      for (const id of activeTeamIds) byeCounts.set(id, 0);

      for (let week = 1; week <= numberOfWeeks; week++) {
        const weekPairings = pairings.filter((p) => p.weekNumber === week);
        const playingThisWeek = new Set<number>();
        for (const p of weekPairings) {
          playingThisWeek.add(p.team1Id);
          playingThisWeek.add(p.team2Id);
        }
        for (const id of activeTeamIds) {
          if (!playingThisWeek.has(id)) {
            byeCounts.set(id, (byeCounts.get(id) ?? 0) + 1);
          }
        }
      }

      const counts = [...byeCounts.values()];
      const min = Math.min(...counts);
      const max = Math.max(...counts);
      expect(max - min).toBeLessThanOrEqual(1);
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

  describe('5 teams in 1 division — odd team round-robin fallback', () => {
    const teams = makeTeams(5, 1);
    const numberOfWeeks = 5;
    let pairings: ReturnType<typeof strategy.generatePairings>;

    beforeEach(() => {
      pairings = strategy.generatePairings(teams, numberOfWeeks);
    });

    it('generates exactly 2 matchups per week (floor(5/2))', () => {
      for (let week = 1; week <= numberOfWeeks; week++) {
        const weekPairings = pairings.filter((p) => p.weekNumber === week);
        expect(weekPairings.length).toBe(2);
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

    it('every team receives exactly one bye across 5 weeks', () => {
      const activeTeamIds = new Set(teams.map((t) => t.id));
      const byeCounts = new Map<number, number>();
      for (const id of activeTeamIds) byeCounts.set(id, 0);

      for (let week = 1; week <= numberOfWeeks; week++) {
        const weekPairings = pairings.filter((p) => p.weekNumber === week);
        const playingThisWeek = new Set<number>();
        for (const p of weekPairings) {
          playingThisWeek.add(p.team1Id);
          playingThisWeek.add(p.team2Id);
        }
        for (const id of activeTeamIds) {
          if (!playingThisWeek.has(id)) {
            byeCounts.set(id, (byeCounts.get(id) ?? 0) + 1);
          }
        }
      }

      for (const [, count] of byeCounts) {
        expect(count).toBe(1);
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
