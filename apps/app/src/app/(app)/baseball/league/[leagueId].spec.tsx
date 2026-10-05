import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import BaseballLeagueId from './[leagueId]';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

type NextActionLike = {
  headline: string;
  body: string;
  ctaLabel: string;
  onPress: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

// Captures TradingCenter's/PendingWaiverClaims' onSubscribeRefresh so
// pull-to-refresh tests can assert the page wired them up (LS-8862).
let mockCapturedTradesSubscribeRefresh:
  | ((refetch: () => void) => (() => void) | void)
  | null = null;
const mockCapturedWaiverSubscribeRefresh: Array<
  ((refetch: () => void) => (() => void) | void) | null
> = [];

const mockNavigate = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ leagueId: '42' })),
  useGlobalSearchParams: jest.fn(() => ({ leagueId: '42' })),
  useRouter: () => ({ navigate: mockNavigate, push: mockPush }),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Controllable app-config: lets each test set the configured base URL (or leave
// it undefined to exercise the `?? 'https://legacysports.app'` fallback baked
// into the share-invite handler). Read lazily via a getter so the component
// picks up the current value at render time.
let mockAppBaseUrl: string | undefined = 'https://legacysports.app';
jest.mock('@legacy-sports/app-config/native', () => ({
  config: {
    get appBaseUrl() {
      return mockAppBaseUrl;
    },
    // Deterministic so the WS-token effect's autoConnect gating
    // (!isNaN(numLeagueId) && !!wsUrl && !!wsToken) hinges only on the token (LS-7627).
    get websocketUrl() {
      return 'wss://ws.test.example';
    },
  },
}));

jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

// The 'react-native' index exposes `Share` via `get Share() { return
// require('./Libraries/Share/Share').default }`, so the mock must expose the
// share object as the module's *default* export — a bare named-shape mock makes
// `Share` resolve to undefined under test (the code path was never exercised
// before GAP-002 / LS-7626). Controlled per-test via `mockShareFn`.
const mockShareFn = jest.fn();
jest.mock('react-native/Libraries/Share/Share', () => ({
  __esModule: true,
  default: {
    share: mockShareFn,
    dismissedAction: 'dismissedAction',
    sharedAction: 'sharedAction',
  },
}));

jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../../__test-utils__/tamagui-mocks')
  >('../../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

jest.mock('@tamagui/tabs', () => {
  const { View, Text } = jest.requireActual<RNComponents>('react-native');
  const Tab = ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value?: string;
    [key: string]: unknown;
  }) => <View testID={`tab-${value ?? 'unknown'}`}>{children}</View>;
  const Content = ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value?: string;
    [key: string]: unknown;
  }) => <View testID={`tab-content-${value ?? 'unknown'}`}>{children}</View>;
  const List = ({ children }: { children: React.ReactNode }) => (
    <View testID="tabs-list">{children}</View>
  );
  const TabsRoot = ({
    children,
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <View testID="tabs-root">{children}</View>;
  Object.assign(TabsRoot, { Tab, Content, List });

  return {
    createTokens: (tokens: unknown) => tokens,
    Tabs: TabsRoot,
    Text: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <Text>{children}</Text>,
  };
});

jest.mock('@legacy-sports/shared-components', () => {
  const { View, Text, TouchableOpacity } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const LeagueDetailShell = ({
    tabs,
    isCommissioner,
    isMember,
    onTabChange,
    onInvite,
    children,
  }: {
    tabs: ReadonlyArray<{
      id: string;
      label: string;
      memberOnly?: boolean;
      commishOnly?: boolean;
    }>;
    isCommissioner: boolean;
    isMember: boolean;
    onTabChange: (id: string) => void;
    onInvite?: () => void;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <View>
      <View testID="tabs-list">
        {tabs
          .filter(
            (t) =>
              (!t.memberOnly || isMember) && (!t.commishOnly || isCommissioner),
          )
          .map((t) => (
            <TouchableOpacity
              key={t.id}
              testID={`tab-${t.id}`}
              onPress={() => onTabChange(t.id)}
            >
              <Text>{t.label}</Text>
            </TouchableOpacity>
          ))}
      </View>
      {onInvite ? (
        <TouchableOpacity testID="invite-share-button" onPress={onInvite}>
          <Text>Invite</Text>
        </TouchableOpacity>
      ) : null}
      {children}
    </View>
  );
  return {
    isDraftPaused: (status: string | null | undefined) => status === 'paused',
    isDraftRoomReachable: (status: string | null | undefined) =>
      status === 'in-progress' || status === 'drafting' || status === 'paused',
    LeagueDetailShell,
    CommissionerAuditLog: () => <View testID="commissioner-audit-log" />,
    CommissionerNoteControl: () => <View testID="commissioner-note-control" />,
    DeleteLeagueControl: () => <View testID="delete-league-control" />,
    LeagueActivityFeed: () => <View testID="league-activity-feed" />,
    LeagueDuesPaymentStatus: () => <View testID="league-dues-payment-status" />,
    LeagueScoringSummary: () => <View testID="league-scoring-summary" />,
    OnThisDayFeed: () => <View testID="on-this-day-feed" />,
    PanelCard: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
    PendingTradeOfferBanner: () => <View testID="pending-trade-offer-banner" />,
    PendingWaiverClaims: (props: {
      onSubscribeRefresh?: (refetch: () => void) => (() => void) | void;
    }) => {
      // Push once per mount (not per render) — the page re-renders as data
      // resolves, and each instance's onSubscribeRefresh identity is stable
      // across those re-renders, so an effect avoids double-counting.
      ReactActual.useEffect(() => {
        mockCapturedWaiverSubscribeRefresh.push(
          props.onSubscribeRefresh ?? null,
        );
      }, []);
      return <View testID="pending-waiver-claims" />;
    },
    PlayoffBracket: () => <View testID="playoff-bracket" />,
    StandingsTable: () => <View testID="standings-table" />,
    TradingCenter: (props: {
      onSubscribeRefresh?: (refetch: () => void) => (() => void) | void;
    }) => {
      mockCapturedTradesSubscribeRefresh = props.onSubscribeRefresh ?? null;
      return <View testID="trading-center" />;
    },
    usePlayoffBracket: jest.fn(() => ({
      bracket: null,
      loading: false,
      error: undefined,
    })),
  };
});

jest.mock('@legacy-sports/shared-components/ui', () => {
  const { Text, TouchableOpacity } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ErrorState: ({
      error,
      onRetry,
    }: {
      error: Error | string | null | undefined;
      onRetry?: () => void;
    }) => (
      <TouchableOpacity testID="error-state-retry" onPress={onRetry}>
        <Text>
          {typeof error === 'string' ? error : (error?.message ?? '')}
        </Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock('../../../../hooks/useLeagueWebSocketLifecycle', () => ({
  useLeagueWebSocketLifecycle: jest.fn(() => ({
    client: null,
    connected: false,
  })),
}));

// Spy fired once per mount of the mocked roster subtree. Keep-alive means it
// stays mounted across tab switches, so a re-visit must NOT re-fire it.
const mockRosterMount = jest.fn();
jest.mock('../../../../features/roster/LeagueRosterManagement', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueRosterManagement: () => {
      ReactActual.useEffect(() => {
        mockRosterMount();
      }, []);
      return <View testID="league-roster-management" />;
    },
  };
});

jest.mock('../../../../features/matchup/hooks/useStandings', () => ({
  useStandings: jest.fn(() => ({
    standings: [],
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  })),
}));

jest.mock('../../../../features/leagues/LeagueChatTab', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueChatTab: () => <View testID="league-chat-tab" />,
  };
});

jest.mock('../../../../features/leagues/LeagueHistoryTab', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueHistoryTab: () => <View testID="league-history-tab" />,
  };
});

jest.mock('../../../../features/scoring/LeagueScoringEditor', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueScoringEditor: () => <View testID="league-scoring-editor" />,
  };
});

jest.mock('../../../../features/commissioner/LeagueDuesSetup', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueDuesSetup: () => <View testID="league-dues-setup" />,
  };
});

jest.mock('../../../../features/commissioner/LeagueDuesPaymentStatus', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueDuesPaymentStatus: () => <View testID="league-dues-payment-status" />,
  };
});

jest.mock('../../../../features/commissioner/CommissionerScreen', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    CommissionerScreen: () => <View testID="commissioner-screen" />,
  };
});

jest.mock('../../../../features/matchup/components/MatchupList', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    MatchupList: () => <View testID="matchup-list" />,
  };
});

// LeagueGuidedHomeTab's own rendering (matchup mapping, standings window, nav
// tile badges, generic up-next card rendering) is covered by its dedicated
// spec — stubbed here the same way as the other feature-tab components in
// this file, so this spec stays focused on [leagueId].tsx's own
// orchestration. The `nextAction` prop is captured so this file can still
// assert the draft-paused/live → priority-card derivation, which is
// [leagueId].tsx's own logic (LS-8988 superseded the old standalone
// "Draft Paused"/"Draft Is Live" banner (LS-8843) with this derivation).
let lastGuidedHomeNextAction: NextActionLike | null | undefined;
jest.mock('../../../../features/leagues/LeagueGuidedHomeTab', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueGuidedHomeTab: (props: { nextAction: NextActionLike | null }) => {
      lastGuidedHomeNextAction = props.nextAction;
      return <View testID="league-guided-home-tab" />;
    },
  };
});

jest.mock('../../../../features/matchup/hooks/useMatchup', () => ({
  useMatchupsForLeague: jest.fn(() => ({ matchups: [], loading: false })),
}));

jest.mock('../../../../features/leagues/hooks/useChatUnreadCount', () => ({
  useChatUnreadCount: jest.fn(() => ({
    unreadCount: 0,
    markRead: jest.fn(),
  })),
}));

jest.mock('../../../../common/scoring', () => ({
  useLeagueScoringSettings: jest.fn(() => ({
    profile: null,
    settings: { batting: {}, fielding: {}, pitching: {} },
    profileName: 'Default',
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  })),
}));

jest.mock('../../../../common/utilities/ErrorHandler', () => ({
  handleError: jest.fn(),
}));

jest.mock('../../../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: jest.fn(() => ({ id: 1, isAdmin: false })),
}));

jest.mock('../../../../common/auth/AuthHooks', () => ({
  readKeychainValue: jest.fn().mockResolvedValue('mock-jwt'),
  Secret: { INTERNAL_JWT: 'INTERNAL_JWT' },
}));

jest.mock('../../../../features/subscription/useSubscription', () => ({
  useSubscription: () => ({ isPremium: false }),
}));

jest.mock('../../../../common/utilities/RouteUtils', () => ({
  toIntId: (v: unknown) => {
    const n = parseInt(String(Array.isArray(v) ? v[0] : v), 10);
    return isNaN(n) ? null : n;
  },
}));

// ── GraphQL mocks ─────────────────────────────────────────────────────────────

const mockLeague = {
  id: 42,
  name: 'Test Baseball League',
  owner: 99,
  inviteCode: 'TESTCODE',
  lmNotes: '',
  sport: 'baseball',
};

const mockGetLeagueByIdQuery = jest.fn(() => ({
  data: { league: mockLeague },
  loading: false,
}));
const mockGetPositionsForLeagueQuery = jest.fn(() => ({
  data: { leaguePositions: [] },
  loading: false,
}));
const mockGetTeamMembersQuery = jest.fn(() => ({
  data: { teamMembers: [] },
  loading: false,
}));
const mockGetUserTeamIdLazyQuery = jest.fn(() => [
  jest.fn(),
  { data: { userTeamId: 10 }, loading: false },
]);
const mockUpdateTeamMemberPositionMutation = jest.fn(() => [jest.fn()]);
const mockGetTeamTradeOffersQuery = jest.fn(() => ({
  data: { teamTradeOffers: [] },
  loading: false,
}));
const mockGetLeagueDuesStatusQuery = jest.fn(() => ({
  data: { leagueDuesSettings: { enabled: false }, leagueDuesStatus: [] },
  loading: false,
}));
const mockGetTeamByIdQuery = jest.fn(() => ({
  data: undefined,
  loading: false,
}));

jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  useGetLeagueByIdQuery: (...args: unknown[]) =>
    mockGetLeagueByIdQuery(...args),
  useGetPositionsForLeagueQuery: (...args: unknown[]) =>
    mockGetPositionsForLeagueQuery(...args),
  useGetTeamMembersQuery: (...args: unknown[]) =>
    mockGetTeamMembersQuery(...args),
  useGetUserTeamIdLazyQuery: (...args: unknown[]) =>
    mockGetUserTeamIdLazyQuery(...args),
  useUpdateTeamMemberPositionMutation: (...args: unknown[]) =>
    mockUpdateTeamMemberPositionMutation(...args),
  useSwapTeamMemberPositionsMutation: () => [jest.fn()],
  useGetTeamTradeOffersQuery: (...args: unknown[]) =>
    mockGetTeamTradeOffersQuery(...args),
  useGetLeagueDuesStatusQuery: (...args: unknown[]) =>
    mockGetLeagueDuesStatusQuery(...args),
  useGetTeamByIdQuery: (...args: unknown[]) => mockGetTeamByIdQuery(...args),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BaseballLeagueId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCapturedTradesSubscribeRefresh = null;
    mockCapturedWaiverSubscribeRefresh.length = 0;
    // Restore the default configured base URL — some tests override it (staging
    // host, unset env) and the value survives clearAllMocks.
    mockAppBaseUrl = 'https://legacysports.app';
    mockGetLeagueByIdQuery.mockReturnValue({
      data: { league: mockLeague },
      loading: false,
    });
    mockGetPositionsForLeagueQuery.mockReturnValue({
      data: { leaguePositions: [] },
      loading: false,
    });
    mockGetTeamMembersQuery.mockReturnValue({
      data: { teamMembers: [] },
      loading: false,
    });
    mockGetUserTeamIdLazyQuery.mockReturnValue([
      jest.fn(),
      { data: { userTeamId: 10 }, loading: false },
    ]);
    mockUpdateTeamMemberPositionMutation.mockReturnValue([jest.fn()]);
    mockGetTeamByIdQuery.mockReturnValue({ data: undefined, loading: false });

    jest
      .requireMock<{
        useAuthorizedUserInfo: jest.Mock;
      }>('../../../../common/auth/AuthorizedUserContext')
      .useAuthorizedUserInfo.mockReturnValue({ id: 1, isAdmin: false });

    jest
      .requireMock<{
        useStandings: jest.Mock;
      }>('../../../../features/matchup/hooks/useStandings')
      .useStandings.mockReturnValue({
        standings: [],
        loading: false,
        error: undefined,
        refetch: jest.fn(),
      });

    jest
      .requireMock<{
        useChatUnreadCount: jest.Mock;
      }>('../../../../features/leagues/hooks/useChatUnreadCount')
      .useChatUnreadCount.mockReturnValue({
        unreadCount: 0,
        markRead: jest.fn(),
      });
  });

  describe('loading state', () => {
    it('shows spinner while league is loading', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: undefined,
        loading: true,
      });
      render(<BaseballLeagueId />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });
  });

  describe('not found state', () => {
    it('shows error message when league is not found', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: null },
        loading: false,
      });
      render(<BaseballLeagueId />);
      expect(screen.getByText(/Could not find league/)).toBeTruthy();
    });
  });

  describe('query error state', () => {
    it('shows a retryable error instead of the generic not-found message when the league query errors (LS-9771)', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Access denied: You are not a member of this league'),
      });
      render(<BaseballLeagueId />);
      expect(
        screen.getByText('Access denied: You are not a member of this league'),
      ).toBeTruthy();
      expect(screen.queryByText(/Could not find league/)).toBeNull();
    });
  });

  describe('normal rendering', () => {
    it('renders the tabs navigation', () => {
      render(<BaseballLeagueId />);
      expect(screen.getByTestId('tabs-list')).toBeTruthy();
    });

    it('renders Overview tab', () => {
      render(<BaseballLeagueId />);
      expect(screen.getByText('Overview')).toBeTruthy();
    });

    it('renders Roster tab', () => {
      render(<BaseballLeagueId />);
      expect(screen.getByText('Roster')).toBeTruthy();
    });

    it('renders Matchups tab', () => {
      render(<BaseballLeagueId />);
      expect(screen.getByText('Matchups')).toBeTruthy();
    });

    it('renders Standings tab', () => {
      render(<BaseballLeagueId />);
      expect(screen.getByText('Standings')).toBeTruthy();
    });

    it('renders Chat tab', () => {
      render(<BaseballLeagueId />);
      expect(screen.getByText('Chat')).toBeTruthy();
    });

    it('renders the Guided Home layout on the Overview tab (LS-8988)', () => {
      render(<BaseballLeagueId />);
      expect(screen.getByTestId('league-guided-home-tab')).toBeTruthy();
    });

    it('marks league chat read when the Chat tab is selected (LS-8988)', () => {
      const markRead = jest.fn();
      jest
        .requireMock<{
          useChatUnreadCount: jest.Mock;
        }>('../../../../features/leagues/hooks/useChatUnreadCount')
        .useChatUnreadCount.mockReturnValue({ unreadCount: 3, markRead });

      render(<BaseballLeagueId />);
      expect(markRead).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('tab-chat'));
      expect(markRead).toHaveBeenCalled();
    });

    it('keeps a visited tab mounted across tab switches (preserves scroll position)', () => {
      render(<BaseballLeagueId />);

      // First visit to Roster mounts its subtree exactly once.
      fireEvent.press(screen.getByTestId('tab-roster'));
      expect(mockRosterMount).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('league-roster-management')).toBeTruthy();

      // Switch away to Standings, then back to Roster. Because the Roster
      // subtree is kept alive (hidden, not unmounted), it is never remounted —
      // its ScrollView offset survives, so the user does not jump to the top.
      fireEvent.press(screen.getByTestId('tab-standings'));
      fireEvent.press(screen.getByTestId('tab-roster'));
      expect(mockRosterMount).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('league-roster-management')).toBeTruthy();
    });

    it('does not mount a tab subtree until it is first visited (lazy mount)', () => {
      render(<BaseballLeagueId />);

      // History has never been selected, so its subtree — and its on-mount
      // data fetch — must not be present yet.
      expect(screen.queryByTestId('league-history-tab')).toBeNull();
      expect(screen.queryByTestId('league-roster-management')).toBeNull();

      // Selecting it renders it normally (and would trigger its fetch) as before.
      fireEvent.press(screen.getByTestId('tab-history'));
      expect(screen.getByTestId('league-history-tab')).toBeTruthy();
    });
  });

  // LS-9501 (follow-up to LS-6332 / FLD-019) — spectators / non-members have
  // no userTeamId; the roster tab must not render the management UI (with its
  // assign/remove/swap affordances) for them.
  describe('roster tab for non-members (LS-9501)', () => {
    it('shows a join prompt instead of roster management when userTeamId is null', () => {
      mockGetUserTeamIdLazyQuery.mockReturnValue([
        jest.fn(),
        { data: { userTeamId: null }, loading: false },
      ]);

      render(<BaseballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-roster'));

      expect(screen.queryByTestId('league-roster-management')).toBeNull();
      expect(
        screen.getByText('Join this league to manage a roster.'),
      ).toBeTruthy();
    });
  });

  describe('cap-remaining data fetch (LS-6338)', () => {
    it('skips useGetTeamByIdQuery when the league is not a salary-cap league', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, salaryCapEnabled: false } },
        loading: false,
      });
      render(<BaseballLeagueId />);
      expect(mockGetTeamByIdQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: true }),
      );
    });

    it('skips useGetTeamByIdQuery when there is no user team', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, salaryCapEnabled: true } },
        loading: false,
      });
      mockGetUserTeamIdLazyQuery.mockReturnValue([
        jest.fn(),
        { data: { userTeamId: null }, loading: false },
      ]);
      render(<BaseballLeagueId />);
      expect(mockGetTeamByIdQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: true }),
      );
    });

    it('fetches useGetTeamByIdQuery when the league is a salary-cap league and a user team exists', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, salaryCapEnabled: true } },
        loading: false,
      });
      render(<BaseballLeagueId />);
      expect(mockGetTeamByIdQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: false, variables: { teamId: 10 } }),
      );
    });
  });

  describe('commissioner tab visibility', () => {
    it('does not render Settings tab for non-commissioners', () => {
      const { useAuthorizedUserInfo } = jest.requireMock<{
        useAuthorizedUserInfo: jest.Mock;
      }>('../../../../common/auth/AuthorizedUserContext');
      useAuthorizedUserInfo.mockReturnValue({ id: 999, isAdmin: false });

      render(<BaseballLeagueId />);
      expect(screen.queryByText('Settings')).toBeNull();
    });

    it('renders Settings tab for the league owner', () => {
      const { useAuthorizedUserInfo } = jest.requireMock<{
        useAuthorizedUserInfo: jest.Mock;
      }>('../../../../common/auth/AuthorizedUserContext');
      useAuthorizedUserInfo.mockReturnValue({ id: 99, isAdmin: false });

      render(<BaseballLeagueId />);
      expect(screen.getByText('Settings')).toBeTruthy();
    });

    it('renders Settings tab for admins regardless of ownership', () => {
      const { useAuthorizedUserInfo } = jest.requireMock<{
        useAuthorizedUserInfo: jest.Mock;
      }>('../../../../common/auth/AuthorizedUserContext');
      useAuthorizedUserInfo.mockReturnValue({ id: 999, isAdmin: true });

      render(<BaseballLeagueId />);
      expect(screen.getByText('Settings')).toBeTruthy();
    });

    it('renders CommissionerScreen in commissioner tab for owner', () => {
      const { useAuthorizedUserInfo } = jest.requireMock<{
        useAuthorizedUserInfo: jest.Mock;
      }>('../../../../common/auth/AuthorizedUserContext');
      useAuthorizedUserInfo.mockReturnValue({ id: 99, isAdmin: false });

      render(<BaseballLeagueId />);
      // Tab content mounts on selection (only the active tab renders).
      fireEvent.press(screen.getByTestId('tab-commissioner'));
      expect(screen.getByTestId('commissioner-screen')).toBeTruthy();
    });

    it('does not render CommissionerScreen for non-commissioners', () => {
      render(<BaseballLeagueId />);
      expect(screen.queryByTestId('commissioner-screen')).toBeNull();
    });
  });

  describe('chat tab visibility for non-members (LS-9614 / LS-6295)', () => {
    afterEach(() => {
      // Restore the default searchParams mock — otherwise the `initialTab:
      // 'chat'` override set below leaks into later tests that assume the
      // page defaults to the Overview tab.
      jest
        .requireMock<{ useLocalSearchParams: jest.Mock }>('expo-router')
        .useLocalSearchParams.mockReturnValue({ leagueId: '42' });
    });

    const asNonMember = () => {
      mockGetUserTeamIdLazyQuery.mockReturnValue([
        jest.fn(),
        { data: { userTeamId: null }, loading: false },
      ]);
    };

    it('does not render the Chat tab for a non-member', () => {
      asNonMember();
      render(<BaseballLeagueId />);
      expect(screen.queryByText('Chat')).toBeNull();
    });

    it('does not mount LeagueChatTab (and its failing getLeagueMessages query) for a non-member even via deep link', () => {
      asNonMember();
      const { useLocalSearchParams } = jest.requireMock<{
        useLocalSearchParams: jest.Mock;
      }>('expo-router');
      useLocalSearchParams.mockReturnValue({
        leagueId: '42',
        initialTab: 'chat',
      });

      render(<BaseballLeagueId />);
      expect(screen.queryByTestId('league-chat-tab')).toBeNull();
    });

    it('renders the Chat tab and mounts LeagueChatTab for a member', () => {
      const { useLocalSearchParams } = jest.requireMock<{
        useLocalSearchParams: jest.Mock;
      }>('expo-router');
      useLocalSearchParams.mockReturnValue({
        leagueId: '42',
        initialTab: 'chat',
      });

      render(<BaseballLeagueId />);
      expect(screen.getByText('Chat')).toBeTruthy();
      expect(screen.getByTestId('league-chat-tab')).toBeTruthy();
    });
  });

  describe('WebSocket token effect (LS-7627)', () => {
    type LifecycleProps = { token?: string; url?: string; leagueId?: number };

    const getReadKeychainValue = () =>
      jest.requireMock<{ readKeychainValue: jest.Mock }>(
        '../../../../common/auth/AuthHooks',
      ).readKeychainValue;

    const getUseLeagueWebSocketLifecycle = () =>
      jest.requireMock<{ useLeagueWebSocketLifecycle: jest.Mock }>(
        '../../../../hooks/useLeagueWebSocketLifecycle',
      ).useLeagueWebSocketLifecycle;

    const getLogger = () =>
      jest.requireMock<{ LOGGER: { error: jest.Mock } }>(
        '@legacy-sports/logging',
      ).LOGGER;

    const lastLifecycleProps = (): LifecycleProps | undefined => {
      const calls = getUseLeagueWebSocketLifecycle().mock
        .calls as unknown as LifecycleProps[][];
      return calls.length ? calls[calls.length - 1][0] : undefined;
    };

    const KEYCHAIN_ERROR_MESSAGE = 'Failed to read WS token from keychain';

    it('sets wsToken once the keychain read returns a token', async () => {
      getReadKeychainValue().mockResolvedValueOnce('ws-jwt-token');
      render(<BaseballLeagueId />);

      await waitFor(() => {
        expect(lastLifecycleProps()?.token).toBe('ws-jwt-token');
      });
      expect(getLogger().error).not.toHaveBeenCalledWith(
        KEYCHAIN_ERROR_MESSAGE,
        expect.anything(),
      );
    });

    it('leaves wsToken undefined and logs no error when no token is stored (null read)', async () => {
      getReadKeychainValue().mockResolvedValueOnce(null);
      render(<BaseballLeagueId />);

      await waitFor(() => {
        expect(getReadKeychainValue()).toHaveBeenCalledWith('INTERNAL_JWT');
      });
      expect(lastLifecycleProps()?.token).toBeUndefined();
      expect(getLogger().error).not.toHaveBeenCalledWith(
        KEYCHAIN_ERROR_MESSAGE,
        expect.anything(),
      );
    });

    it('logs an error and leaves wsToken undefined when the keychain read rejects', async () => {
      getReadKeychainValue().mockRejectedValueOnce(
        new Error('keystore unavailable'),
      );
      render(<BaseballLeagueId />);

      await waitFor(() => {
        expect(getLogger().error).toHaveBeenCalledWith(
          KEYCHAIN_ERROR_MESSAGE,
          expect.any(Error),
        );
      });
      expect(lastLifecycleProps()?.token).toBeUndefined();
    });
  });

  describe('draft-state "Up next" priority (LS-8843, superseded by LS-8988)', () => {
    // The old standalone "Draft Paused"/"Draft Is Live" banner (LS-8843) was
    // replaced by the Guided Home "Up next" card (LS-8988) — the card's own
    // rendering is covered by LeagueGuidedHomeTab.spec.tsx, so this file only
    // asserts [leagueId].tsx's own nextAction derivation via the captured
    // prop (see the LeagueGuidedHomeTab mock above).
    it('derives a paused-draft nextAction with a re-entry CTA when draftStatus is paused', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, draftStatus: 'paused' } },
        loading: false,
      });
      render(<BaseballLeagueId />);
      expect(lastGuidedHomeNextAction).toEqual(
        expect.objectContaining({
          headline: 'The draft is paused.',
          ctaLabel: 'Return to draft room',
        }),
      );
    });

    it('navigates to the draft board when the paused-draft nextAction CTA is pressed', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, draftStatus: 'paused' } },
        loading: false,
      });
      render(<BaseballLeagueId />);
      lastGuidedHomeNextAction?.onPress();
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/DraftBoardPage' }),
      );
    });

    it('derives a "Watch draft" secondary action alongside the draft nextAction', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, draftStatus: 'in-progress' } },
        loading: false,
      });
      render(<BaseballLeagueId />);
      expect(lastGuidedHomeNextAction?.secondaryLabel).toBe('Watch draft');
      lastGuidedHomeNextAction?.onSecondaryPress?.();
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/DraftWatchPage' }),
      );
    });

    it.each(['not-started', 'queued', 'completed'])(
      'does not derive a draft nextAction when draftStatus is %s',
      (draftStatus) => {
        mockGetLeagueByIdQuery.mockReturnValue({
          data: { league: { ...mockLeague, draftStatus } },
          loading: false,
        });
        render(<BaseballLeagueId />);
        expect(lastGuidedHomeNextAction?.headline ?? '').not.toMatch(/draft/i);
      },
    );
  });

  describe('waivers tab', () => {
    it('does not render Waivers tab when waiverEnabled is false', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, waiverEnabled: false } },
        loading: false,
      });
      render(<BaseballLeagueId />);
      expect(screen.queryByTestId('tab-waivers')).toBeNull();
    });

    it('renders Waivers tab when waiverEnabled is true', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, waiverEnabled: true } },
        loading: false,
      });
      render(<BaseballLeagueId />);
      expect(screen.getByTestId('tab-waivers')).toBeTruthy();
    });

    it('shows PendingWaiverClaims and browse button when user has a team', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, waiverEnabled: true } },
        loading: false,
      });
      mockGetUserTeamIdLazyQuery.mockReturnValue([
        jest.fn(),
        { data: { userTeamId: 10 }, loading: false },
      ]);
      render(<BaseballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-waivers'));
      expect(screen.getByTestId('pending-waiver-claims')).toBeTruthy();
      expect(
        screen.getByText('Browse Free Agents & Submit Claim'),
      ).toBeTruthy();
    });

    it('navigates to FreeAgents on browse button press', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, waiverEnabled: true } },
        loading: false,
      });
      mockGetUserTeamIdLazyQuery.mockReturnValue([
        jest.fn(),
        { data: { userTeamId: 10 }, loading: false },
      ]);
      render(<BaseballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-waivers'));
      fireEvent.press(screen.getByText('Browse Free Agents & Submit Claim'));
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/FreeAgents' }),
      );
    });
  });

  describe('pull-to-refresh: trades/waivers (LS-8862)', () => {
    beforeEach(() => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, waiverEnabled: true } },
        loading: false,
      });
      mockGetUserTeamIdLazyQuery.mockReturnValue([
        jest.fn(),
        { data: { userTeamId: 10 }, loading: false },
      ]);
    });

    it('wires TradingCenter and its Trades-tab PendingWaiverClaims to onSubscribeRefresh', () => {
      render(<BaseballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-trades'));

      expect(mockCapturedTradesSubscribeRefresh).toBeInstanceOf(Function);
      expect(mockCapturedWaiverSubscribeRefresh[0]).toBeInstanceOf(Function);
    });

    it('wires the Waivers-tab PendingWaiverClaims to its own onSubscribeRefresh', () => {
      render(<BaseballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-trades'));
      fireEvent.press(screen.getByTestId('tab-waivers'));

      // Trades tab's instance registered first; the Waivers tab's is a
      // distinct callback so a refresh on one never reaches into the other's
      // data (LS-7563 keeps both mounted).
      expect(mockCapturedWaiverSubscribeRefresh).toHaveLength(2);
      expect(mockCapturedWaiverSubscribeRefresh[0]).not.toBe(
        mockCapturedWaiverSubscribeRefresh[1],
      );
    });
  });

  // Native OS share-sheet invite (GAP-002 / LS-7626). The hero invite action
  // launches react-native's `Share.share` with a message + title + invite URL.
  // These tests cover URL correctness across environments, the
  // EXPO_PUBLIC_APP_BASE_URL fallback (surfaced through config.appBaseUrl), and
  // the dismissed / error branches of the handler.
  describe('share invite', () => {
    beforeEach(() => {
      mockShareFn.mockReset();
      mockShareFn.mockResolvedValue({ action: 'dismissedAction' });
    });

    const getLoggerMock = () =>
      jest.requireMock<{
        LOGGER: { debug: jest.Mock; error: jest.Mock };
      }>('@legacy-sports/logging').LOGGER;

    it('opens the OS share sheet with the invite message, title, and URL', async () => {
      render(<BaseballLeagueId />);
      fireEvent.press(screen.getByTestId('invite-share-button'));

      await waitFor(() => expect(mockShareFn).toHaveBeenCalledTimes(1));
      expect(mockShareFn).toHaveBeenCalledWith({
        message:
          'Join my league "Test Baseball League" on Legacy Sports!\n\n' +
          'https://legacysports.app/join/TESTCODE?src=share&platform=ios',
        title: 'Join Test Baseball League',
        url: 'https://legacysports.app/join/TESTCODE?src=share&platform=ios',
      });
    });

    it('builds the invite URL from the configured base URL (env-specific host)', async () => {
      mockAppBaseUrl = 'https://staging.legacysports.app';
      render(<BaseballLeagueId />);
      fireEvent.press(screen.getByTestId('invite-share-button'));

      await waitFor(() => expect(mockShareFn).toHaveBeenCalledTimes(1));
      expect(mockShareFn).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://staging.legacysports.app/join/TESTCODE?src=share&platform=ios',
        }),
      );
    });

    it('falls back to https://legacysports.app when the base URL is unset', async () => {
      // Mirrors a build where EXPO_PUBLIC_APP_BASE_URL is absent: config.appBaseUrl
      // is undefined and the handler falls back to the production host. This
      // asserts the cross-env leakage risk called out in GAP-002 rather than
      // silently changing it.
      mockAppBaseUrl = undefined;
      render(<BaseballLeagueId />);
      fireEvent.press(screen.getByTestId('invite-share-button'));

      await waitFor(() => expect(mockShareFn).toHaveBeenCalledTimes(1));
      expect(mockShareFn).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://legacysports.app/join/TESTCODE?src=share&platform=ios',
        }),
      );
    });

    it('shares an invite without a URL when the league has no invite code', async () => {
      // An empty invite code (falsy) reproduces the "no code yet" state: the
      // handler omits the URL from both the message body and the share payload.
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, inviteCode: '' } },
        loading: false,
      });
      render(<BaseballLeagueId />);
      fireEvent.press(screen.getByTestId('invite-share-button'));

      await waitFor(() => expect(mockShareFn).toHaveBeenCalledTimes(1));
      expect(mockShareFn).toHaveBeenCalledWith({
        message: 'Join my league "Test Baseball League" on Legacy Sports!',
        title: 'Join Test Baseball League',
        url: undefined,
      });
    });

    it('logs a debug line when the user dismisses the share sheet', async () => {
      mockShareFn.mockResolvedValue({ action: 'dismissedAction' });
      render(<BaseballLeagueId />);
      fireEvent.press(screen.getByTestId('invite-share-button'));

      await waitFor(() =>
        expect(getLoggerMock().debug).toHaveBeenCalledWith(
          'Share dismissed by user',
        ),
      );
      expect(getLoggerMock().error).not.toHaveBeenCalled();
    });

    it('logs an error and does not throw when Share.share rejects', async () => {
      mockShareFn.mockRejectedValue(new Error('share failed'));
      render(<BaseballLeagueId />);
      fireEvent.press(screen.getByTestId('invite-share-button'));

      await waitFor(() =>
        expect(getLoggerMock().error).toHaveBeenCalledWith(
          'Error while sharing league invite',
          expect.any(Error),
        ),
      );
    });
  });
});
