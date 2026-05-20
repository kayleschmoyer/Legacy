import { renderHook, waitFor } from '@testing-library/react';
import { useLeagueTakenPlayers } from './useLeagueTakenPlayers';

jest.mock('@apollo/client/react', () => ({
  useApolloClient: jest.fn(),
}));

jest.mock('../api/db/graphql.generated', () => ({
  GetTeamMembers: 'GET_TEAM_MEMBERS',
  useGetLeagueTeamsQuery: jest.fn(),
}));

const { useApolloClient } = jest.requireMock('@apollo/client/react');
const { useGetLeagueTeamsQuery } = jest.requireMock(
  '../api/db/graphql.generated',
);

describe('useLeagueTakenPlayers — refreshKey re-fetches roster (LS-4032)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useGetLeagueTeamsQuery.mockReturnValue({
      data: { leagueTeams: [{ id: 10 }, { id: 11 }] },
      loading: false,
    });
  });

  it('refetches team members when refreshKey changes even though teamsData is unchanged', async () => {
    let callCount = 0;
    const query = jest.fn().mockImplementation(() => {
      callCount += 1;
      // First batch: only player 1 is rostered. After bump: player 2 also rostered.
      const teamMembers =
        callCount <= 2
          ? [{ player: { id: 1 } }]
          : [{ player: { id: 1 } }, { player: { id: 2 } }];
      return Promise.resolve({ data: { teamMembers } });
    });
    useApolloClient.mockReturnValue({ query });

    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useLeagueTakenPlayers(1, key),
      { initialProps: { key: 0 } },
    );

    await waitFor(() =>
      expect(result.current.takenPlayerIds.has(1)).toBe(true),
    );
    expect(result.current.takenPlayerIds.has(2)).toBe(false);
    const callsAfterFirst = query.mock.calls.length;
    expect(callsAfterFirst).toBe(2); // one per team

    // Bump refreshKey (simulating pagination)
    rerender({ key: 1 });

    await waitFor(() =>
      expect(result.current.takenPlayerIds.has(2)).toBe(true),
    );
    expect(query.mock.calls.length).toBe(callsAfterFirst + 2);
  });

  it('does not re-fetch when refreshKey is stable across renders', async () => {
    const query = jest
      .fn()
      .mockResolvedValue({ data: { teamMembers: [{ player: { id: 5 } }] } });
    useApolloClient.mockReturnValue({ query });

    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useLeagueTakenPlayers(1, key),
      { initialProps: { key: 'a' } },
    );

    await waitFor(() =>
      expect(result.current.takenPlayerIds.has(5)).toBe(true),
    );
    const calls = query.mock.calls.length;

    rerender({ key: 'a' });
    rerender({ key: 'a' });

    expect(query.mock.calls.length).toBe(calls);
  });
});
