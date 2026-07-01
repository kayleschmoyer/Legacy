import {
  buildLeaderboard,
  filterChampions,
} from './useLeagueChampionsAnalytics';

const season = (
  seasonNumber: number,
  championTeamName: string | null,
  opts: {
    frozenAt?: string | null;
    leagueId?: number | null;
  } = {},
) => ({
  leagueId: opts.leagueId ?? seasonNumber,
  seasonNumber,
  frozenAt:
    opts.frozenAt !== undefined ? opts.frozenAt : '2024-01-01T00:00:00Z',
  championTeamName,
  runnerUpTeamName: null,
  championScore: null,
  runnerUpScore: null,
});

describe('filterChampions', () => {
  it('returns empty array for empty input', () => {
    expect(filterChampions([])).toEqual([]);
  });

  it('filters out seasons without frozenAt', () => {
    const seasons = [
      season(1, 'Team A', { frozenAt: null }),
      season(2, 'Team B'),
    ];
    const result = filterChampions(seasons);
    expect(result).toHaveLength(1);
    expect(result[0].seasonNumber).toBe(2);
  });

  it('filters out seasons without a champion name', () => {
    const seasons = [season(1, null), season(2, 'Team B')];
    const result = filterChampions(seasons);
    expect(result).toHaveLength(1);
    expect(result[0].championTeamName).toBe('Team B');
  });
});

describe('buildLeaderboard', () => {
  it('returns empty array for empty input', () => {
    expect(buildLeaderboard([])).toEqual([]);
  });

  it('sorts by titles descending', () => {
    const champions = [
      season(1, 'Team A'),
      season(2, 'Team B'),
      season(3, 'Team A'),
      season(4, 'Team A'),
      season(5, 'Team B'),
    ];
    const board = buildLeaderboard(champions);
    expect(board[0]).toEqual({ teamName: 'Team A', titles: 3 });
    expect(board[1]).toEqual({ teamName: 'Team B', titles: 2 });
  });

  it('handles a single winner correctly', () => {
    expect(buildLeaderboard([season(1, 'Solo Squad')])).toEqual([
      { teamName: 'Solo Squad', titles: 1 },
    ]);
  });
});
