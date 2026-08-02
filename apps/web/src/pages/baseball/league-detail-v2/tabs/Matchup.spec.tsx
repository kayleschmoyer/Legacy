/**
 * Tests for MatchupTab (LS-5343).
 *
 * Covers:
 *   1. Football league: games-progress bar is not rendered regardless of totalGames.
 *   2. Baseball league: games-progress bar IS rendered when totalGames > 0.
 *   3. Loading state: spinner shown while matchup is loading.
 *   4. Error state: red error card shown on matchup query failure.
 *   5. No-active-matchup empty state: shown when no matchupId is resolvable.
 *   6. Commissioner shortcut: "Go to Commissioner tab" button shown to commissioners.
 *   7. Schedule card: rendered when matchup has startTime / endTime.
 *   8. Schedule card: NOT rendered when matchup has no startTime / endTime.
 *   9. Bye/no-team empty state (LS-5902): shown instead of a stranger's
 *      matchup when the user's team isn't in this week's matchups.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { MatchupTab } from './Matchup';

// --- websocket client (LS-6355: matchup-scoped context) --------------------
const mockUpdateContext = jest.fn();
const mockUseLeagueWebSocketClient = jest.fn<
  { client: { updateContext: jest.Mock } | null; connected: boolean },
  []
>(() => ({
  client: { updateContext: mockUpdateContext },
  connected: true,
}));
jest.mock('../../../../context/LeagueWebSocketContext', () => ({
  useLeagueWebSocketClient: () => mockUseLeagueWebSocketClient(),
}));

// --- hooks -----------------------------------------------------------------
const mockUseMatchupById = jest.fn<
  {
    matchup: object | null;
    loading: boolean;
    error: Error | null;
    refetch: jest.Mock;
  },
  [number | null]
>();

const mockUseMatchupsByWeek = jest.fn<
  { matchups: object[]; refetch: jest.Mock },
  [number | null, number | null]
>();

const mockUseMatchupsForLeague = jest.fn<
  { matchups: Array<{ weekNumber: number }> },
  [number | null]
>(() => ({ matchups: [] }));

jest.mock('../../../../hooks/useMatchup', () => ({
  useCurrentWeek: () => ({ currentWeek: 1 }),
  useMatchupsByWeek: (leagueId: number | null, week: number | null) =>
    mockUseMatchupsByWeek(leagueId, week),
  useMatchupById: (matchupId: number | null) => mockUseMatchupById(matchupId),
  useMatchupsForLeague: (leagueId: number | null) =>
    mockUseMatchupsForLeague(leagueId),
}));
const mockUseLeagueWebSocket = jest.fn<{ connected: boolean }, [unknown]>(
  () => ({ connected: true }),
);
jest.mock('../../../../hooks/useLeagueWebSocket', () => ({
  useLeagueWebSocket: (options: unknown) => mockUseLeagueWebSocket(options),
}));
jest.mock('../../../../lib/scoring', () => ({
  useLeagueScoringSettings: () => ({
    settings: null,
    loading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('../../../../lib/scoring/mapGraphQLToScoringFormat', () => ({
  mapMatchupPlayerToSeasonStats: () => null,
}));

// --- generated types -------------------------------------------------------
jest.mock('@legacy-sports/graphql', () => ({
  MatchupStatus: {
    InProgress: 'in_progress',
    Scheduled: 'scheduled',
    Completed: 'completed',
  },
  Sport: { Baseball: 'baseball', Football: 'football' },
  useGetMatchupPlayersQuery: jest.fn(() => ({
    data: { getMatchupPlayers: [] },
    error: null,
  })),
}));

// --- heavy sub-components --------------------------------------------------
jest.mock('../../../../features/matchup/MatchupRosterComparison', () => ({
  MatchupRosterComparison: () => (
    <div data-testid="matchup-roster-comparison" />
  ),
}));
jest.mock('../../../../features/matchup/MatchupScoreboard', () => ({
  computeMatchupScores: () => ({
    team1Score: 0,
    team2Score: 0,
    team1Projected: 0,
    team2Projected: 0,
    gamesPlayed: 2,
    totalGames: 5,
  }),
}));
jest.mock('@legacy-sports/shared-components/matchup', () => ({
  MatchupScoreboardHero: () => <div data-testid="scoreboard-hero" />,
}));

// ---------------------------------------------------------------------------

const baseMatchup = {
  id: 1,
  weekNumber: 1,
  team1Id: 10,
  team2Id: 20,
  status: 'scheduled',
  gamesPerMatchup: 5,
  selectedGamesCount: 5,
  startTime: null,
  endTime: null,
  team1: { id: 10, name: 'Alpha' },
  team2: { id: 20, name: 'Beta' },
};

const baseLeague = {
  id: 1,
  name: 'Test League',
  sport: 'baseball',
  currentWeekNumber: 1,
  totalMatchups: 10,
  gamesPerMatchup: 5,
};

function renderTab(
  leagueOverrides: Partial<typeof baseLeague> = {},
  extra: {
    isCommissioner?: boolean;
    onCommish?: jest.Mock;
    /** Pass null to test the no-matchup state (matchupId=null path). */
    initialMatchupId?: string | null;
    myTeamId?: number | null;
  } = {},
) {
  const initialMatchupId =
    'initialMatchupId' in extra ? extra.initialMatchupId : '1';
  return render(
    <MatchupTab
      league={{ ...baseLeague, ...leagueOverrides }}
      myTeamId={'myTeamId' in extra ? (extra.myTeamId ?? null) : 10}
      initialMatchupId={initialMatchupId ?? null}
      onTeam={jest.fn()}
      isCommissioner={extra.isCommissioner}
      onCommish={extra.onCommish}
    />,
  );
}

beforeEach(() => {
  mockUseMatchupById.mockReturnValue({
    matchup: baseMatchup,
    loading: false,
    error: null,
    refetch: jest.fn(),
  });
  mockUseMatchupsByWeek.mockReturnValue({ matchups: [], refetch: jest.fn() });
  mockUseMatchupsForLeague.mockReturnValue({ matchups: [] });
  mockUpdateContext.mockClear();
  mockUseLeagueWebSocketClient.mockReturnValue({
    client: { updateContext: mockUpdateContext },
    connected: true,
  });
});

describe('MatchupTab — football-awareness', () => {
  it('renders the games-progress bar for a baseball league when games are scheduled', () => {
    renderTab({ sport: 'baseball' });
    expect(document.querySelector('.ls-games-remaining')).toBeInTheDocument();
  });

  it('does not render the games-progress bar for a football league', () => {
    renderTab({ sport: 'football' });
    expect(
      document.querySelector('.ls-games-remaining'),
    ).not.toBeInTheDocument();
  });

  it('shows Head-to-Head label in meta for a default football league', () => {
    const { container } = render(
      <MatchupTab
        league={{ ...baseLeague, sport: 'football' }}
        myTeamId={10}
        initialMatchupId="1"
        onTeam={jest.fn()}
      />,
    );
    const meta = container.querySelector('.meta');
    expect(meta?.textContent).toContain('Head-to-Head');
  });
});

describe('MatchupTab — matchup-scoped stats-complete refetch (LS-6358)', () => {
  it('refetches when matchup-stats-complete fires for the currently displayed matchup', () => {
    const refetch = jest.fn();
    mockUseMatchupById.mockReturnValue({
      matchup: baseMatchup,
      loading: false,
      error: null,
      refetch,
    });
    renderTab({}, { initialMatchupId: '1' });

    const { onMatchupStatsComplete } = mockUseLeagueWebSocket.mock.calls[0][0];
    onMatchupStatsComplete({ matchupId: 1, leagueId: 1 });

    expect(refetch).toHaveBeenCalled();
  });

  it('does not refetch when matchup-stats-complete fires for a different matchup', () => {
    const refetch = jest.fn();
    mockUseMatchupById.mockReturnValue({
      matchup: baseMatchup,
      loading: false,
      error: null,
      refetch,
    });
    renderTab({}, { initialMatchupId: '1' });

    const { onMatchupStatsComplete } = mockUseLeagueWebSocket.mock.calls[0][0];
    onMatchupStatsComplete({ matchupId: 999, leagueId: 1 });

    expect(refetch).not.toHaveBeenCalled();
  });
});

describe('MatchupTab — loading state', () => {
  it('shows loading indicator while matchup is being fetched', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: null,
      loading: true,
      error: null,
      refetch: jest.fn(),
    });
    renderTab({}, { initialMatchupId: '1' });
    expect(screen.getByTestId('matchup-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading matchup…')).toBeInTheDocument();
  });

  it('does not show main content while loading', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: null,
      loading: true,
      error: null,
      refetch: jest.fn(),
    });
    renderTab({}, { initialMatchupId: '1' });
    expect(document.querySelector('.ls-week-nav')).not.toBeInTheDocument();
  });
});

describe('MatchupTab — error state', () => {
  it('shows error card when matchup query fails', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: null,
      loading: false,
      error: new Error('Network error'),
      refetch: jest.fn(),
    });
    renderTab({}, { initialMatchupId: '1' });
    expect(screen.getByTestId('matchup-error')).toBeInTheDocument();
    expect(screen.getByText('Failed to load matchup.')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });
});

describe('MatchupTab — no active matchup empty state', () => {
  beforeEach(() => {
    mockUseMatchupById.mockReturnValue({
      matchup: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('shows empty state when no matchupId can be resolved', () => {
    renderTab({}, { initialMatchupId: null });
    expect(screen.getByTestId('matchup-empty')).toBeInTheDocument();
    expect(screen.getByText('No Active Matchup')).toBeInTheDocument();
  });

  it('shows commissioner button to commissioners', () => {
    const onCommish = jest.fn();
    renderTab({}, { isCommissioner: true, onCommish, initialMatchupId: null });
    const btn = screen.getByTestId('go-to-commish');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onCommish).toHaveBeenCalledTimes(1);
  });

  it('does not show commissioner button to non-commissioners', () => {
    renderTab({}, { isCommissioner: false, initialMatchupId: null });
    expect(screen.queryByTestId('go-to-commish')).not.toBeInTheDocument();
  });
});

describe('MatchupTab — games-remaining dots clamping (LS-5882)', () => {
  it('renders one dot per game when totalGames is within bounds', () => {
    renderTab();
    expect(document.querySelectorAll('.ls-game-dot')).toHaveLength(5);
    expect(screen.queryByTestId('games-dots-overflow')).not.toBeInTheDocument();
  });

  it('falls back to numeric X/Y text instead of rendering dots when totalGames exceeds the cap', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: {
        ...baseMatchup,
        gamesPerMatchup: 100000,
        selectedGamesCount: 3,
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    renderTab();
    expect(document.querySelectorAll('.ls-game-dot')).toHaveLength(0);
    const overflow = screen.getByTestId('games-dots-overflow');
    expect(overflow).toBeInTheDocument();
    expect(overflow.textContent).toBe('3/100000');
  });
});

describe('MatchupTab — week stepper Next-button bound (LS-5888)', () => {
  it('disables Next once week reaches totalMatchups when totalMatchups is set', () => {
    renderTab({ totalMatchups: 1, currentWeekNumber: 1 });
    expect(screen.getByLabelText('Next week')).toBeDisabled();
  });

  it('falls back to the max week number from allMatchups when totalMatchups is null', () => {
    mockUseMatchupsForLeague.mockReturnValue({
      matchups: [{ weekNumber: 1 }, { weekNumber: 3 }, { weekNumber: 2 }],
    });
    renderTab({ totalMatchups: null, currentWeekNumber: 3 });
    expect(screen.getByLabelText('Next week')).toBeDisabled();
  });

  it('keeps Next enabled when the current week is below the max week fallback', () => {
    mockUseMatchupsForLeague.mockReturnValue({
      matchups: [{ weekNumber: 1 }, { weekNumber: 3 }, { weekNumber: 2 }],
    });
    renderTab({ totalMatchups: null, currentWeekNumber: 2 });
    expect(screen.getByLabelText('Next week')).not.toBeDisabled();
  });

  it('disables Next when totalMatchups is null and no matchups exist yet for the league', () => {
    mockUseMatchupsForLeague.mockReturnValue({ matchups: [] });
    renderTab({ totalMatchups: null, currentWeekNumber: 1 });
    expect(screen.getByLabelText('Next week')).toBeDisabled();
  });
});

describe('MatchupTab — zero totalGames guard (LS-5884)', () => {
  it('does not divide by zero and shows "No games scheduled" when totalGames is 0', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: {
        ...baseMatchup,
        gamesPerMatchup: 0,
        selectedGamesCount: 0,
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    renderTab({ gamesPerMatchup: 0 });
    expect(screen.getByText('No games scheduled')).toBeInTheDocument();
    expect(
      document.querySelector('.ls-games-remaining'),
    ).not.toBeInTheDocument();
  });
});

describe('MatchupTab — live-dot final-game race (LS-5883)', () => {
  it('does not mark any dot live when gamesPlayed reaches totalGames even if status is still InProgress', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: {
        ...baseMatchup,
        status: 'in_progress',
        gamesPerMatchup: 5,
        selectedGamesCount: 5,
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    renderTab();
    const dots = document.querySelectorAll('.ls-game-dot');
    expect(dots).toHaveLength(5);
    dots.forEach((dot) => expect(dot.className).not.toContain('live'));
  });

  it('still marks the current dot live while gamesPlayed is below totalGames and status is InProgress', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: {
        ...baseMatchup,
        status: 'in_progress',
        gamesPerMatchup: 5,
        selectedGamesCount: 2,
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    renderTab();
    const dots = document.querySelectorAll('.ls-game-dot');
    expect(dots[2].className).toContain('live');
  });
});

describe('MatchupTab — schedule card', () => {
  it('renders schedule card when matchup has startTime and endTime', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: {
        ...baseMatchup,
        startTime: '2025-04-07T00:00:00.000Z',
        endTime: '2025-04-13T23:59:59.000Z',
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    renderTab();
    expect(screen.getByTestId('matchup-schedule-card')).toBeInTheDocument();
  });

  it('does not render schedule card when matchup has no startTime or endTime', () => {
    renderTab();
    expect(
      screen.queryByTestId('matchup-schedule-card'),
    ).not.toBeInTheDocument();
  });
});

describe('MatchupTab — bye / no-team-in-week empty state (LS-5902)', () => {
  const strangerMatchup = {
    ...baseMatchup,
    id: 2,
    team1Id: 30,
    team2Id: 40,
    team1: { id: 30, name: 'Charlie' },
    team2: { id: 40, name: 'Delta' },
  };

  beforeEach(() => {
    mockUseMatchupsByWeek.mockReturnValue({
      matchups: [strangerMatchup],
      refetch: jest.fn(),
    });
    mockUseMatchupById.mockReturnValue({
      matchup: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('shows the bye empty state instead of a stranger matchup when the user has no team this week', () => {
    renderTab({}, { initialMatchupId: null, myTeamId: 10 });
    expect(screen.getByTestId('matchup-bye')).toBeInTheDocument();
    expect(
      screen.getByText('Your team is on a bye this week'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Browse other matchups below.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('matchup-empty')).not.toBeInTheDocument();
  });

  it('does not show the bye empty state when an explicit matchup id is requested', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: strangerMatchup,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    renderTab({}, { initialMatchupId: '2', myTeamId: 10 });
    expect(screen.queryByTestId('matchup-bye')).not.toBeInTheDocument();
  });

  it('does not show the bye empty state for observer-mode users (no team)', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: strangerMatchup,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    renderTab({}, { initialMatchupId: null, myTeamId: null });
    expect(screen.queryByTestId('matchup-bye')).not.toBeInTheDocument();
  });

  it('lets the user browse another matchup from the bye empty state', () => {
    renderTab({}, { initialMatchupId: null, myTeamId: 10 });
    mockUseMatchupById.mockReturnValue({
      matchup: strangerMatchup,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    fireEvent.click(screen.getByTestId('bye-browse-matchup'));
    expect(mockUseMatchupById).toHaveBeenLastCalledWith(2);
  });

  it('jumps to the next week from the bye empty state', () => {
    renderTab({}, { initialMatchupId: null, myTeamId: 10 });
    fireEvent.click(screen.getByTestId('bye-next-week'));
    expect(mockUseMatchupsByWeek).toHaveBeenLastCalledWith(1, 2);
  });
});

describe('MatchupTab — matchup-scoped WebSocket context (LS-6355)', () => {
  it('narrows the shared connection to viewContext=matchup with matchupId on mount', () => {
    renderTab({}, { initialMatchupId: '1' });
    expect(mockUpdateContext).toHaveBeenCalledWith({
      matchupId: 1,
      viewContext: 'matchup',
    });
  });

  it('reverts the shared connection to viewContext=league on unmount', () => {
    const { unmount } = renderTab({}, { initialMatchupId: '1' });
    mockUpdateContext.mockClear();
    unmount();
    expect(mockUpdateContext).toHaveBeenCalledWith({ viewContext: 'league' });
  });

  it('does not call updateContext when there is no resolvable matchupId', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    renderTab({}, { initialMatchupId: null });
    expect(mockUpdateContext).not.toHaveBeenCalled();
  });

  it('does not throw when no shared client is available yet', () => {
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });
    expect(() => renderTab({}, { initialMatchupId: '1' })).not.toThrow();
    expect(mockUpdateContext).not.toHaveBeenCalled();
  });
});
