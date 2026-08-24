/**
 * Tests for MatchupDetailPage PageMeta description sport-gating (LS-5892 / BMD-022)
 * and the error state (LS-5901 / BMD-031).
 *
 * Covers:
 *   1. Baseball league: description reads "fantasy baseball".
 *   2. Football league: description reads "fantasy football" (not hardcoded baseball).
 *   3. League data not yet loaded: description falls back to "fantasy baseball".
 *   4. Error state: shows a generic message instead of the raw error.
 *   5. Error state: does not leak the raw error message to the user.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { MatchupDetailPage } from './MatchupDetailPage';
import { trackMatchupViewed } from '../../utils/analytics';

// --- router ------------------------------------------------------------------
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ leagueId: '100', matchupId: '1' }),
}));

// --- analytics -----------------------------------------------------------------
jest.mock('../../utils/analytics', () => ({
  trackMatchupViewed: jest.fn(),
}));

const mockTrackMatchupViewed = trackMatchupViewed as jest.MockedFunction<
  typeof trackMatchupViewed
>;

// --- hooks ---------------------------------------------------------------------
const baseMatchup = {
  id: 1,
  weekNumber: 3,
  leagueId: 100,
  team1Id: 10,
  team2Id: 20,
  status: 'scheduled',
  gamesPerMatchup: 5,
  selectedGamesCount: 2,
};

interface MockMatchupByIdResult {
  matchup: typeof baseMatchup | undefined;
  loading: boolean;
  error: Error | undefined;
  refetch?: jest.Mock;
}

const mockUseMatchupById = jest.fn<MockMatchupByIdResult, [number | null]>(
  () => ({
    matchup: baseMatchup,
    loading: false,
    error: undefined,
  }),
);

const mockUseMatchupsForLeague = jest.fn<
  { matchups: object[]; refetch?: jest.Mock },
  [number | null]
>(() => ({ matchups: [] }));

const mockUseCurrentWeek = jest.fn<{ currentWeek: number }, [number | null]>(
  () => ({ currentWeek: 3 }),
);

jest.mock('../../hooks/useMatchup', () => ({
  useMatchupById: (matchupId: number | null) => mockUseMatchupById(matchupId),
  useMatchupsForLeague: (leagueId: number | null) =>
    mockUseMatchupsForLeague(leagueId),
  useCurrentWeek: (leagueId: number | null) => mockUseCurrentWeek(leagueId),
}));

// --- websocket (LS-5425: live score updates + reconnect refetch) -----------
// This route has no LeagueWebSocketContext.Provider ancestor (it isn't
// nested under LeagueDetailPage/LeagueDetailPageV2 — see MatchupDetailPage's
// own doc comment), so the page opens its own connection via the raw
// shared-components `useWebSocket` hook directly instead of `useLeagueWebSocket`.
const mockUseWebSocket = jest.fn<{ connected: boolean }, [unknown]>(() => ({
  connected: true,
}));
jest.mock('@legacy-sports/shared-components/ui', () => ({
  useWebSocket: (options: unknown) => mockUseWebSocket(options),
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'test-token' }),
}));

jest.mock('../../hooks/useIsPremium', () => ({
  useHasEntitlement: jest.fn(() => false),
}));

let mockLeagueSport: string | undefined = 'baseball';
jest.mock('@legacy-sports/graphql', () => ({
  MatchupStatus: {
    Scheduled: 'scheduled',
    InProgress: 'in_progress',
    Completed: 'completed',
    Cancelled: 'cancelled',
  },
  Sport: {
    Baseball: 'baseball',
    Football: 'football',
  },
  useGetUserTeamIdQuery: jest.fn(() => ({ data: { userTeamId: 10 } })),
  useGetLeagueByIdQuery: jest.fn(() => ({
    data: mockLeagueSport ? { league: { sport: mockLeagueSport } } : undefined,
  })),
}));

// --- PageMeta: capture the description prop instead of rendering meta tags -----
jest.mock('../../components/PageMeta', () => ({
  PageMeta: ({ description }: { description?: string }) => (
    <div data-testid="page-meta-description">{description}</div>
  ),
}));

// --- heavy sub-components -------------------------------------------------------
jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../features/matchup/MatchupScoreboard', () => ({
  MatchupScoreboard: ({ liveUpdateSignal }: { liveUpdateSignal?: number }) => (
    <div data-testid="scoreboard" data-live-update-signal={liveUpdateSignal} />
  ),
}));
jest.mock('../../features/matchup/MatchupWinProbabilityPanel', () => ({
  MatchupWinProbabilityPanel: () => <div data-testid="win-probability" />,
}));
const mockMatchupRosterComparison = jest.fn();
jest.mock('../../features/matchup/MatchupRosterComparison', () => ({
  MatchupRosterComparison: (props: { sport?: string | null }) => {
    mockMatchupRosterComparison(props);
    return <div data-testid="roster-comparison" />;
  },
}));
jest.mock('../../features/matchup/MatchupRosterEditor', () => ({
  MatchupRosterEditor: () => <div data-testid="roster-editor" />,
}));
jest.mock('@legacy-sports/shared-components/matchup', () => ({
  MatchupDetailLayout: (props: {
    header?: React.ReactNode;
    scoreboard?: React.ReactNode;
    winProbabilityPanel?: React.ReactNode;
    rosterEditor?: React.ReactNode;
    recapPanel?: React.ReactNode;
    rosterComparison?: React.ReactNode;
    additionalSections?: React.ReactNode;
  }) => (
    <div data-testid="matchup-detail-layout">
      {props.header}
      {props.scoreboard}
      {props.winProbabilityPanel}
      {props.rosterEditor}
      {props.recapPanel}
      {props.rosterComparison}
      {props.additionalSections}
    </div>
  ),
  MatchupRecapPanel: () => <div data-testid="recap-panel" />,
  MatchupAdditionalSections: () => <div data-testid="additional-sections" />,
}));

describe('MatchupDetailPage – PageMeta description sport-gating (LS-5892)', () => {
  beforeEach(() => {
    mockLeagueSport = 'baseball';
    mockUseMatchupById.mockReturnValue({
      matchup: baseMatchup,
      loading: false,
      error: undefined,
    });
  });

  it('describes the matchup as fantasy baseball for a baseball league', () => {
    mockLeagueSport = 'baseball';
    render(<MatchupDetailPage />);

    expect(screen.getByTestId('page-meta-description')).toHaveTextContent(
      'View Week 3 fantasy baseball matchup scores, rosters, and stats on Legacy Sports.',
    );
  });

  it('describes the matchup as fantasy football for a football league', () => {
    mockLeagueSport = 'football';
    render(<MatchupDetailPage />);

    expect(screen.getByTestId('page-meta-description')).toHaveTextContent(
      'View Week 3 fantasy football matchup scores, rosters, and stats on Legacy Sports.',
    );
  });

  it('falls back to fantasy baseball while league data has not loaded yet', () => {
    mockLeagueSport = undefined;
    render(<MatchupDetailPage />);

    expect(screen.getByTestId('page-meta-description')).toHaveTextContent(
      'View Week 3 fantasy baseball matchup scores, rosters, and stats on Legacy Sports.',
    );
  });
});

const RAW_ERROR_MESSAGE =
  'relation "matchups" does not exist at character 15 in SELECT * FROM matchups';

describe('MatchupDetailPage error state (LS-5901)', () => {
  beforeEach(() => {
    mockUseMatchupById.mockReturnValue({
      matchup: undefined,
      loading: false,
      error: new Error(RAW_ERROR_MESSAGE),
    });
  });

  afterEach(() => {
    mockUseMatchupById.mockReturnValue({
      matchup: baseMatchup,
      loading: false,
      error: undefined,
    });
  });

  it('shows a generic message instead of the raw error', () => {
    render(<MatchupDetailPage />);
    expect(
      screen.getByText(
        'Something went wrong loading this matchup. Please try again.',
      ),
    ).toBeInTheDocument();
  });

  it('does not leak the raw error message to the user', () => {
    render(<MatchupDetailPage />);
    expect(screen.queryByText(RAW_ERROR_MESSAGE)).not.toBeInTheDocument();
  });
});

describe('MatchupDetailPage "Back to League" navigation (LS-5893 / BMD-023)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockUseMatchupById.mockReturnValue({
      matchup: baseMatchup,
      loading: false,
      error: undefined,
    });
  });

  it('navigates to the baseball league route for a baseball league', () => {
    mockLeagueSport = 'baseball';
    render(<MatchupDetailPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to League' }));

    expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/100');
  });

  it('navigates to the football league route for a football league, not a hardcoded baseball route', () => {
    mockLeagueSport = 'football';
    render(<MatchupDetailPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to League' }));

    expect(mockNavigate).toHaveBeenCalledWith('/football/league/100');
  });
});

describe('MatchupDetailPage forbidden vs not-found state (LS-5900)', () => {
  afterEach(() => {
    mockUseMatchupById.mockReturnValue({
      matchup: baseMatchup,
      loading: false,
      error: undefined,
    });
  });

  it('shows a distinct message when the server returns FORBIDDEN (lost league access)', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: undefined,
      loading: false,
      error: new CombinedGraphQLErrors({
        errors: [
          {
            message: 'User is not a member of this league',
            extensions: { code: 'FORBIDDEN' },
          },
        ],
      }),
    });

    render(<MatchupDetailPage />);

    expect(
      screen.getByText('You no longer have access to this league'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Matchup not found')).not.toBeInTheDocument();
  });

  it('shows "Matchup not found" when the matchup genuinely does not exist (no error, null result)', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: undefined,
      loading: false,
      error: undefined,
    });

    render(<MatchupDetailPage />);

    expect(screen.getByText('Matchup not found')).toBeInTheDocument();
    expect(
      screen.queryByText('You no longer have access to this league'),
    ).not.toBeInTheDocument();
  });
});

describe('MatchupDetailPage – roster comparison sport wiring (LS-5431)', () => {
  beforeEach(() => {
    mockMatchupRosterComparison.mockClear();
    mockUseMatchupById.mockReturnValue({
      matchup: baseMatchup,
      loading: false,
      error: undefined,
    });
  });

  it('passes sport="football" for a football league, so MatchupRosterComparison renders football labels/position groups/click-routing instead of defaulting to baseball', () => {
    mockLeagueSport = 'football';
    render(<MatchupDetailPage />);

    expect(mockMatchupRosterComparison).toHaveBeenCalledWith(
      expect.objectContaining({ sport: 'football' }),
    );
  });

  it('passes sport="baseball" for a baseball league', () => {
    mockLeagueSport = 'baseball';
    render(<MatchupDetailPage />);

    expect(mockMatchupRosterComparison).toHaveBeenCalledWith(
      expect.objectContaining({ sport: 'baseball' }),
    );
  });
});

describe('MatchupDetailPage – GA4 matchup_viewed tracking (LS-7628)', () => {
  beforeEach(() => {
    mockTrackMatchupViewed.mockClear();
    mockUseMatchupById.mockReturnValue({
      matchup: baseMatchup,
      loading: false,
      error: undefined,
    });
    mockUseCurrentWeek.mockReturnValue({ currentWeek: 3 });
  });

  it('fires once on initial mount with the (league, matchup, week) tuple', () => {
    render(<MatchupDetailPage />);

    // useParams is mocked to leagueId: '100', matchupId: '1'; the third
    // argument is currentWeek from useCurrentWeek (mocked to 3 in
    // beforeEach), not baseMatchup.weekNumber — they just happen to match.
    expect(mockTrackMatchupViewed).toHaveBeenCalledTimes(1);
    expect(mockTrackMatchupViewed).toHaveBeenCalledWith(1, 100, 3);
  });

  it('does not re-fire on re-render when the tuple is unchanged, even if the matchup object identity changes', () => {
    const { rerender } = render(<MatchupDetailPage />);
    expect(mockTrackMatchupViewed).toHaveBeenCalledTimes(1);

    // Simulate an Apollo cache update returning a new object reference for
    // the same matchup — the effect re-runs (matchup identity changed) but
    // lastTrackedMatchupViewKeyRef must suppress a duplicate event since
    // league/matchup/week are unchanged.
    mockUseMatchupById.mockReturnValue({
      matchup: { ...baseMatchup },
      loading: false,
      error: undefined,
    });
    rerender(<MatchupDetailPage />);

    expect(mockTrackMatchupViewed).toHaveBeenCalledTimes(1);
  });

  it('fires again when navigating to a new (league, matchup, week) tuple', () => {
    const { rerender } = render(<MatchupDetailPage />);
    expect(mockTrackMatchupViewed).toHaveBeenCalledTimes(1);

    mockUseCurrentWeek.mockReturnValue({ currentWeek: 4 });
    rerender(<MatchupDetailPage />);

    expect(mockTrackMatchupViewed).toHaveBeenCalledTimes(2);
    expect(mockTrackMatchupViewed).toHaveBeenLastCalledWith(1, 100, 4);
  });
});

describe('MatchupDetailPage — live score updates + reconnect refetch (LS-5425)', () => {
  let matchupRefetch: jest.Mock;
  let matchupsRefetch: jest.Mock;

  beforeEach(() => {
    mockUseWebSocket.mockClear();
    matchupRefetch = jest.fn();
    matchupsRefetch = jest.fn();
    mockUseMatchupById.mockReturnValue({
      matchup: baseMatchup,
      loading: false,
      error: undefined,
      refetch: matchupRefetch,
    });
    mockUseMatchupsForLeague.mockReturnValue({
      matchups: [],
      refetch: matchupsRefetch,
    });
  });

  afterEach(() => {
    mockUseMatchupById.mockReturnValue({
      matchup: baseMatchup,
      loading: false,
      error: undefined,
    });
    mockUseMatchupsForLeague.mockReturnValue({ matchups: [] });
  });

  function getWebSocketOptions() {
    const options = mockUseWebSocket.mock.calls[0]?.[0] as {
      onMatchupStatsComplete?: (n: { matchupId: number }) => void;
      onReconnect?: () => void;
    };
    if (!options) throw new Error('useWebSocket was not called');
    return options;
  }

  it('connects with the matchup viewContext and this matchup/league ids', () => {
    render(<MatchupDetailPage />);

    const options = mockUseWebSocket.mock.calls[0]?.[0] as {
      viewContext?: string;
      leagueId?: number;
      matchupId?: number;
      autoConnect?: boolean;
    };
    expect(options.viewContext).toBe('matchup');
    expect(options.leagueId).toBe(100);
    expect(options.matchupId).toBe(1);
    expect(options.autoConnect).toBe(true);
  });

  it('refetches the matchup and league matchups when a stats-complete notification arrives for this matchup', () => {
    render(<MatchupDetailPage />);

    act(() => {
      getWebSocketOptions().onMatchupStatsComplete?.({ matchupId: 1 });
    });

    expect(matchupRefetch).toHaveBeenCalled();
    expect(matchupsRefetch).toHaveBeenCalled();
  });

  it('does not refetch when a stats-complete notification arrives for a different matchup', () => {
    render(<MatchupDetailPage />);

    act(() => {
      getWebSocketOptions().onMatchupStatsComplete?.({ matchupId: 999 });
    });

    expect(matchupRefetch).not.toHaveBeenCalled();
    expect(matchupsRefetch).not.toHaveBeenCalled();
  });

  it('refetches the matchup and league matchups when the websocket reconnects', () => {
    render(<MatchupDetailPage />);

    act(() => {
      getWebSocketOptions().onReconnect?.();
    });

    expect(matchupRefetch).toHaveBeenCalled();
    expect(matchupsRefetch).toHaveBeenCalled();
  });

  it('bumps liveUpdateSignal passed to MatchupScoreboard when a stats-complete notification arrives for this matchup', () => {
    const { getByTestId } = render(<MatchupDetailPage />);

    expect(
      getByTestId('scoreboard').getAttribute('data-live-update-signal'),
    ).toBe('0');

    act(() => {
      getWebSocketOptions().onMatchupStatsComplete?.({ matchupId: 1 });
    });

    expect(
      getByTestId('scoreboard').getAttribute('data-live-update-signal'),
    ).toBe('1');
  });

  it('bumps liveUpdateSignal passed to MatchupScoreboard on reconnect', () => {
    const { getByTestId } = render(<MatchupDetailPage />);

    act(() => {
      getWebSocketOptions().onReconnect?.();
    });

    expect(
      getByTestId('scoreboard').getAttribute('data-live-update-signal'),
    ).toBe('1');
  });
});
