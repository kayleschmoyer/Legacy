import { renderHook, waitFor } from '@testing-library/react-native';

import {
  MatchupHighlightLeague,
  useFootballMatchupHighlights,
} from './useFootballMatchupHighlights';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockClient = { query: mockQuery };

jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}));

jest.mock('@legacy-sports/graphql', () => ({
  GetMatchupById: 'GetMatchupById',
  MatchupStatus: {
    InProgress: 'in_progress',
    Completed: 'completed',
    Cancelled: 'cancelled',
    Scheduled: 'scheduled',
  },
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const { LOGGER: mockLogger } = jest.requireMock<{
  LOGGER: { error: jest.Mock; warn: jest.Mock; info: jest.Mock };
}>('@legacy-sports/logging');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMatchupResult(matchup: Record<string, unknown> | null) {
  return { data: { getMatchupById: matchup } };
}

// `leagues` must stay a referentially-stable array across re-renders (the
// same contract `FootballHomeScreen` fulfils via `useMemo`) — a fresh array
// literal inside the `renderHook` callback would look like a new dependency
// every effect run and infinite-loop the hook's `setHighlights` effect.
function renderHighlights(
  leagues: MatchupHighlightLeague[],
  onPressLeague: (leagueId: string | number, matchupId?: number) => void,
) {
  return renderHook(() => useFootballMatchupHighlights(leagues, onPressLeague));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useFootballMatchupHighlights', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns no highlights for an empty league list', () => {
    const onPressLeague = jest.fn();
    const { result } = renderHighlights([], onPressLeague);

    expect(result.current.highlights).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('resolves a matchup highlight for a league with a current matchup', async () => {
    mockQuery.mockResolvedValue(
      makeMatchupResult({
        status: 'scheduled',
        weekNumber: 4,
        team1: { name: 'Home Team' },
        team2: { name: 'Away Team' },
      }),
    );
    const onPressLeague = jest.fn();

    const { result } = renderHighlights(
      [{ id: 1, name: 'My League', currentMatchup: 99 }],
      onPressLeague,
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockQuery).toHaveBeenCalledWith({
      query: 'GetMatchupById',
      variables: { id: 99 },
    });
    const { onPress, ...highlight } = result.current.highlights[0];
    expect(highlight).toEqual({
      leagueId: 1,
      leagueName: 'My League',
      weekNumber: 4,
      awayTeamName: 'Away Team',
      homeTeamName: 'Home Team',
      status: 'pre',
    });

    expect(typeof onPress).toBe('function');
    onPress?.();
    expect(onPressLeague).toHaveBeenCalledWith(1, 99);
  });

  it('maps in-progress and completed statuses to live/final', async () => {
    mockQuery.mockResolvedValueOnce(
      makeMatchupResult({
        status: 'in_progress',
        weekNumber: 1,
        team1: { name: 'A' },
        team2: { name: 'B' },
      }),
    );
    const { result } = renderHighlights(
      [{ id: 1, currentMatchup: 1 }],
      jest.fn(),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.highlights[0].status).toBe('live');
  });

  it('produces a bye-week highlight for an active league with no current matchup', async () => {
    const onPressLeague = jest.fn();
    const { result } = renderHighlights(
      [
        {
          id: 2,
          name: 'Bye League',
          currentMatchup: null,
          leaguePhase: 'active',
          currentWeekNumber: 6,
        },
      ],
      onPressLeague,
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    const { onPress, ...highlight } = result.current.highlights[0];
    expect(highlight).toEqual({
      leagueId: 2,
      leagueName: 'Bye League',
      weekNumber: 6,
      awayTeamName: 'Bye League',
      homeTeamName: '',
      status: 'bye',
      noOpponent: true,
    });
    expect(mockQuery).not.toHaveBeenCalled();

    expect(typeof onPress).toBe('function');
    onPress?.();
    expect(onPressLeague).toHaveBeenCalledWith(2);
  });

  it('omits a league with no current matchup that has not started its season', async () => {
    const { result } = renderHighlights(
      [
        {
          id: 3,
          currentMatchup: null,
          leaguePhase: 'pre-draft',
          currentWeekNumber: 1,
        },
      ],
      jest.fn(),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.highlights).toEqual([]);
  });

  it('filters out a cancelled matchup', async () => {
    mockQuery.mockResolvedValue(
      makeMatchupResult({
        status: 'cancelled',
        weekNumber: 2,
        team1: { name: 'A' },
        team2: { name: 'B' },
      }),
    );
    const { result } = renderHighlights(
      [{ id: 1, currentMatchup: 5 }],
      jest.fn(),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.highlights).toEqual([]);
  });

  it('logs an error and falls back to bye highlights on network failure', async () => {
    const err = new Error('network error');
    mockQuery.mockRejectedValue(err);

    const { result } = renderHighlights(
      [
        { id: 1, currentMatchup: 5 },
        {
          id: 2,
          name: 'Bye League',
          currentMatchup: null,
          leaguePhase: 'active',
          currentWeekNumber: 3,
        },
      ],
      jest.fn(),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to resolve football matchup highlights',
      err,
    );
    expect(result.current.highlights).toEqual([
      expect.objectContaining({ leagueId: 2, status: 'bye' }),
    ]);
  });
});
