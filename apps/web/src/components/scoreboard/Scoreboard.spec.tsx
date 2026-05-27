/**
 * Unit tests for `partitionScoreboardGames` — the pure helper that backs the
 * Scoreboard page's game bucketing.
 *
 * Regression coverage for LS-4838: postponed games were being lumped into
 * the "Upcoming" section even though they will not be played that day.
 */
import type { ScoreboardGame } from '@legacy-sports/shared-components';
import { partitionScoreboardGames } from './Scoreboard';

function makeGame(
  gamePk: number,
  status: ScoreboardGame['status'],
): ScoreboardGame {
  return {
    gamePk,
    status,
    homeTeam: {
      teamName: 'Home',
      abbreviation: 'HOM',
      runs: 0,
      hits: 0,
      errors: 0,
    },
    awayTeam: {
      teamName: 'Away',
      abbreviation: 'AWY',
      runs: 0,
      hits: 0,
      errors: 0,
    },
  };
}

describe('partitionScoreboardGames', () => {
  it('routes Postponed games into their own bucket, not Upcoming', () => {
    const games = [makeGame(1, 'Postponed')];

    const { upcomingGames, postponedGames } = partitionScoreboardGames(games);

    expect(postponedGames).toHaveLength(1);
    expect(postponedGames[0].gamePk).toBe(1);
    expect(upcomingGames).toHaveLength(0);
  });

  it('partitions Live, Upcoming, Final, and Postponed games independently', () => {
    const games = [
      makeGame(1, 'Live'),
      makeGame(2, 'Preview'),
      makeGame(3, 'Final'),
      makeGame(4, 'Postponed'),
      makeGame(5, 'Suspended'),
    ];

    const { liveGames, upcomingGames, finalGames, postponedGames } =
      partitionScoreboardGames(games);

    expect(liveGames.map((g) => g.gamePk)).toEqual([1]);
    // Preview and Suspended are not Postponed, so they remain in Upcoming.
    expect(upcomingGames.map((g) => g.gamePk)).toEqual([2, 5]);
    expect(finalGames.map((g) => g.gamePk)).toEqual([3]);
    expect(postponedGames.map((g) => g.gamePk)).toEqual([4]);
  });

  it('returns empty buckets for an empty input', () => {
    const result = partitionScoreboardGames([]);

    expect(result.liveGames).toEqual([]);
    expect(result.upcomingGames).toEqual([]);
    expect(result.finalGames).toEqual([]);
    expect(result.postponedGames).toEqual([]);
  });
});
