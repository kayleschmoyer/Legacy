import { describe, expect, it } from '@jest/globals';
import { calculatePlayoffProjections } from './playoff-projections';
import type { TeamStats } from './types';

function team(teamId: number, wins: number, losses: number): TeamStats {
  const played = wins + losses;
  return {
    teamId,
    teamName: `Team ${teamId}`,
    totalPoints: 0,
    averagePoints: 0,
    matchupsPlayed: played,
    wins,
    losses,
    ties: 0,
    winPercentage: played > 0 ? wins / played : 0,
    currentStreak: '',
    currentStreakCount: 0,
    longestWinStreak: 0,
    longestLoseStreak: 0,
  };
}

const zeroZeroLeague = Array.from({ length: 10 }, (_, i) => team(i + 1, 0, 0));

describe('calculatePlayoffProjections (LS-10759)', () => {
  it('projects every remaining matchup when remainingWeeks is wired', () => {
    const projections = calculatePlayoffProjections(zeroZeroLeague, {
      playoffTeams: 4,
      remainingWeeks: 10,
    });

    for (const p of projections) {
      expect(p.remainingMatchups).toBe(10);
      expect(p.projectedWins + p.projectedLosses).toBeCloseTo(10, 0);
    }
  });

  it('orders tied projections by teamId regardless of input order', () => {
    const options = { playoffTeams: 4, remainingWeeks: 10 };
    const forward = calculatePlayoffProjections(zeroZeroLeague, options);
    const reversed = calculatePlayoffProjections(
      [...zeroZeroLeague].reverse(),
      options,
    );

    expect(reversed.map((p) => p.teamId)).toEqual(forward.map((p) => p.teamId));
  });

  it('gives every team in an all-0-0 league the same magic number', () => {
    const projections = calculatePlayoffProjections(zeroZeroLeague, {
      playoffTeams: 4,
      remainingWeeks: 10,
    });

    const magicNumbers = new Set(projections.map((p) => p.magicNumber));
    expect(magicNumbers.size).toBe(1);
    expect(projections[0].magicNumber).toBeNull();
  });

  it('treats tied records symmetrically regardless of input order', () => {
    const standings = [team(1, 3, 1), team(2, 3, 1), team(3, 1, 3)];
    const forward = calculatePlayoffProjections(standings, {
      playoffTeams: 1,
      remainingWeeks: 2,
    });
    const reversed = calculatePlayoffProjections([...standings].reverse(), {
      playoffTeams: 1,
      remainingWeeks: 2,
    });

    const byTeam = (list: typeof forward) =>
      Object.fromEntries(list.map((p) => [p.teamId, p.magicNumber]));
    expect(byTeam(forward)[1]).toBe(byTeam(forward)[2]);
    expect(byTeam(forward)).toEqual(byTeam(reversed));
  });

  it('computes a clinch number once a team is clear of the field', () => {
    const projections = calculatePlayoffProjections(
      [team(1, 8, 0), team(2, 5, 3), team(3, 2, 6), team(4, 1, 7)],
      { playoffTeams: 2, remainingWeeks: 2 },
    );
    const leader = projections.find((p) => p.teamId === 1);
    // Third-best rival (2 wins) can reach 4; leader already has 8
    expect(leader?.magicNumber).toBe(0);
    const second = projections.find((p) => p.teamId === 2);
    // Must exceed 2 + 2 = 4 → already at 5
    expect(second?.magicNumber).toBe(0);
  });

  it('returns identical percentages on repeated calls with the same inputs', () => {
    const standings = [team(1, 3, 1), team(2, 2, 2), team(3, 1, 3)];
    const options = { playoffTeams: 2, remainingWeeks: 6 };

    const first = calculatePlayoffProjections(standings, options);
    expect(calculatePlayoffProjections(standings, options)).toEqual(first);
    const second = calculatePlayoffProjections(
      [...standings].reverse(),
      options,
    );

    expect(second).toEqual(first);
  });
});
