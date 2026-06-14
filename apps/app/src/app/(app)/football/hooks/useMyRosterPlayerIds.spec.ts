import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMyRosterPlayerIds } from './useMyRosterPlayerIds';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockClient = { query: mockQuery };

jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}));

const mockUseGetUserLeaguesQuery = jest.fn();
jest.mock('../../../../api/db/graphql.generated', () => ({
  GetTeamMembers: 'GetTeamMembers',
  Sport: { Football: 'football', Baseball: 'baseball' },
  useGetUserLeaguesQuery: (...args: unknown[]) =>
    mockUseGetUserLeaguesQuery(...args) as Record<string, unknown>,
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const { LOGGER: mockLogger } = jest.requireMock<{
  LOGGER: { error: jest.Mock; warn: jest.Mock; info: jest.Mock };
}>('@legacy-sports/logging');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLeague(teamId: number, sport = 'football') {
  return {
    id: teamId * 10,
    sport,
    userMembership: { teamId },
  };
}

function makeTeamMembersResult(playerIds: (number | null)[]) {
  return {
    data: {
      teamMembers: playerIds.map((playerId) => ({ playerId })),
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useMyRosterPlayerIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetUserLeaguesQuery.mockReturnValue({ data: undefined });
    mockQuery.mockResolvedValue(makeTeamMembersResult([]));
  });

  it('returns empty set and not loading when skip=true', () => {
    const { result } = renderHook(() => useMyRosterPlayerIds(true));
    expect(result.current.playerIds.size).toBe(0);
    expect(result.current.loading).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns empty set when there are no football leagues', async () => {
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: [makeLeague(1, 'baseball')] },
    });
    const { result } = renderHook(() => useMyRosterPlayerIds(false));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.playerIds.size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('fetches team members and returns their player IDs', async () => {
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: [makeLeague(42)] },
    });
    mockQuery.mockResolvedValue(makeTeamMembersResult([1, 2, 3]));

    const { result } = renderHook(() => useMyRosterPlayerIds(false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.playerIds).toEqual(new Set([1, 2, 3]));
    expect(mockQuery).toHaveBeenCalledWith({
      query: 'GetTeamMembers',
      variables: { teamId: 42 },
      fetchPolicy: 'cache-first',
    });
  });

  it('aggregates player IDs from multiple football leagues', async () => {
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: {
        userLeagues: [makeLeague(10), makeLeague(20)],
      },
    });
    mockQuery
      .mockResolvedValueOnce(makeTeamMembersResult([1, 2]))
      .mockResolvedValueOnce(makeTeamMembersResult([3, 4]));

    const { result } = renderHook(() => useMyRosterPlayerIds(false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.playerIds).toEqual(new Set([1, 2, 3, 4]));
  });

  it('skips null playerIds in team members', async () => {
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: [makeLeague(5)] },
    });
    mockQuery.mockResolvedValue(makeTeamMembersResult([1, null, 3]));

    const { result } = renderHook(() => useMyRosterPlayerIds(false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.playerIds).toEqual(new Set([1, 3]));
  });

  it('logs error and clears loading on network failure', async () => {
    const err = new Error('network error');
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: [makeLeague(7)] },
    });
    mockQuery.mockRejectedValue(err);

    const { result } = renderHook(() => useMyRosterPlayerIds(false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to fetch team members for My Rostered filter',
      err,
    );
    expect(result.current.playerIds.size).toBe(0);
  });

  it('resets to empty set and stops loading when skip flips to true', async () => {
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: [makeLeague(1)] },
    });
    mockQuery.mockResolvedValue(makeTeamMembersResult([99]));

    const { result, rerender } = renderHook(
      ({ skip }: { skip: boolean }) => useMyRosterPlayerIds(skip),
      { initialProps: { skip: false } },
    );

    await waitFor(() => {
      expect(result.current.playerIds.size).toBe(1);
    });

    void act(() => {
      rerender({ skip: true });
    });

    expect(result.current.playerIds.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });
});
