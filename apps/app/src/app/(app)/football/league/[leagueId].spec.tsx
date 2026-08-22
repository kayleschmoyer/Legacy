import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import FootballLeagueId from './[leagueId]';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

jest.mock('react-native/Libraries/Share/Share', () => ({
  share: jest.fn().mockResolvedValue({ action: 'dismissedAction' }),
  dismissedAction: 'dismissedAction',
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
    // re-export Text so Tabs.Content children that use it don't break
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
      {children}
    </View>
  );
  return {
    isDraftPaused: (status: string | null | undefined) => status === 'paused',
    isDraftRoomReachable: (status: string | null | undefined) =>
      status === 'in-progress' || status === 'drafting' || status === 'paused',
    LeagueDetailShell,
    Chip: ({ label }: { label: string }) => <Text>{label}</Text>,
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
      // Push once per mount (not per render) — see baseball [leagueId].spec.tsx.
      ReactActual.useEffect(() => {
        mockCapturedWaiverSubscribeRefresh.push(
          props.onSubscribeRefresh ?? null,
        );
      }, []);
      return <View testID="pending-waiver-claims" />;
    },
    PlayoffBracket: () => <View testID="playoff-bracket" />,
    SegmentedControl: ({
      options,
      value,
      onValueChange,
    }: {
      options: Array<{ value: string; label: string }>;
      value: string;
      onValueChange: (value: string) => void;
    }) => (
      <View testID="matchups-view-toggle">
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            testID={`matchups-view-toggle-${opt.value}`}
            onPress={() => onValueChange(opt.value)}
          >
            <Text>{opt.label}</Text>
          </TouchableOpacity>
        ))}
        <Text testID="matchups-view-toggle-value">{value}</Text>
      </View>
    ),
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

jest.mock('../../../../hooks/useLeagueWebSocketLifecycle', () => ({
  useLeagueWebSocketLifecycle: jest.fn(() => ({
    client: null,
    connected: false,
  })),
}));

jest.mock('../../../../features/roster/LeagueRosterManagement', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueRosterManagement: () => <View testID="league-roster-management" />,
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
  const { View, Text, TouchableOpacity } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    // Reflects the loading/empty/list branches so the page spec can assert
    // it wires useMatchupsForLeague and onMatchupPress through correctly
    // (LS-6321) without duplicating MatchupList's own branch coverage.
    MatchupList: ({
      matchups,
      loading,
      emptyMessage,
      onMatchupPress,
    }: {
      matchups: ReadonlyArray<{ id?: string | number | null }>;
      loading?: boolean;
      emptyMessage?: string;
      onMatchupPress?: (matchup: { id?: string | number | null }) => void;
    }) => {
      if (loading) {
        return (
          <View testID="matchup-list">
            <Text>Loading matchups...</Text>
          </View>
        );
      }
      if (matchups.length === 0) {
        return (
          <View testID="matchup-list">
            <Text>{emptyMessage ?? 'No matchups found'}</Text>
          </View>
        );
      }
      return (
        <View testID="matchup-list">
          {matchups.map((matchup) => (
            <TouchableOpacity
              key={String(matchup.id)}
              testID={`matchup-row-${matchup.id}`}
              onPress={() => onMatchupPress?.(matchup)}
            >
              <Text>{`Matchup ${matchup.id}`}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    },
  };
});

jest.mock('../../../../features/matchup/hooks/useMatchup', () => ({
  useMatchupsForLeague: jest.fn(() => ({ matchups: [], loading: false })),
}));

jest.mock('../../../../common/scoring', () => ({
  useLeagueScoringSettings: jest.fn(() => ({
    profile: null,
    settings: null,
    profileName: null,
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
  name: 'Test Football League',
  owner: 99,
  inviteCode: 'TESTCODE',
  lmNotes: '',
  sport: 'football',
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
const mockGetNflTeamSeasonMetadataQuery = jest.fn(() => ({
  data: { nflTeamSeasonMetadata: [] },
  loading: false,
}));

jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  DefensiveFormat: { Dst: 'dst', Idp: 'idp' },
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
  useGetNflTeamSeasonMetadataQuery: (...args: unknown[]) =>
    mockGetNflTeamSeasonMetadataQuery(...args),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FootballLeagueId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCapturedTradesSubscribeRefresh = null;
    mockCapturedWaiverSubscribeRefresh.length = 0;
    jest
      .requireMock<{
        useLocalSearchParams: jest.Mock;
      }>('expo-router')
      .useLocalSearchParams.mockReturnValue({ leagueId: '42' });
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
    mockGetNflTeamSeasonMetadataQuery.mockReturnValue({
      data: { nflTeamSeasonMetadata: [] },
      loading: false,
    });

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
  });

  describe('loading state', () => {
    it('shows spinner while league is loading', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: undefined,
        loading: true,
      });
      render(<FootballLeagueId />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });
  });

  describe('not found state', () => {
    it('shows error message when league is not found', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: null },
        loading: false,
      });
      render(<FootballLeagueId />);
      expect(screen.getByText(/Could not find league/)).toBeTruthy();
    });
  });

  describe('normal rendering', () => {
    it('renders the tabs navigation', () => {
      render(<FootballLeagueId />);
      expect(screen.getByTestId('tabs-list')).toBeTruthy();
    });

    it('renders Overview tab', () => {
      render(<FootballLeagueId />);
      expect(screen.getByText('Overview')).toBeTruthy();
    });

    it('renders Roster tab', () => {
      render(<FootballLeagueId />);
      expect(screen.getByText('Roster')).toBeTruthy();
    });

    it('renders Matchups tab', () => {
      render(<FootballLeagueId />);
      expect(screen.getByText('Matchups')).toBeTruthy();
    });

    it('renders Standings tab', () => {
      render(<FootballLeagueId />);
      expect(screen.getByText('Standings')).toBeTruthy();
    });

    it('renders Chat tab', () => {
      render(<FootballLeagueId />);
      expect(screen.getByText('Chat')).toBeTruthy();
    });
  });

  describe('commissioner tab visibility', () => {
    it('does not render Settings tab for non-commissioners', () => {
      const { useAuthorizedUserInfo } = jest.requireMock<{
        useAuthorizedUserInfo: jest.Mock;
      }>('../../../../common/auth/AuthorizedUserContext');
      useAuthorizedUserInfo.mockReturnValue({ id: 999, isAdmin: false });

      render(<FootballLeagueId />);
      expect(screen.queryByText('Settings')).toBeNull();
    });

    it('renders Settings tab for the league owner', () => {
      const { useAuthorizedUserInfo } = jest.requireMock<{
        useAuthorizedUserInfo: jest.Mock;
      }>('../../../../common/auth/AuthorizedUserContext');
      // owner === userInfo.id (both 99)
      useAuthorizedUserInfo.mockReturnValue({ id: 99, isAdmin: false });

      render(<FootballLeagueId />);
      expect(screen.getByText('Settings')).toBeTruthy();
    });

    it('renders Settings tab for admins regardless of ownership', () => {
      const { useAuthorizedUserInfo } = jest.requireMock<{
        useAuthorizedUserInfo: jest.Mock;
      }>('../../../../common/auth/AuthorizedUserContext');
      useAuthorizedUserInfo.mockReturnValue({ id: 999, isAdmin: true });

      render(<FootballLeagueId />);
      expect(screen.getByText('Settings')).toBeTruthy();
    });
  });

  describe('overview tab content', () => {
    it('renders the invite share section for commissioners', () => {
      const { useAuthorizedUserInfo } = jest.requireMock<{
        useAuthorizedUserInfo: jest.Mock;
      }>('../../../../common/auth/AuthorizedUserContext');
      useAuthorizedUserInfo.mockReturnValue({ id: 99, isAdmin: false });
      render(<FootballLeagueId />);
      expect(screen.getByText('Invite Friends')).toBeTruthy();
    });

    it('does not render the invite share section for non-commissioners', () => {
      render(<FootballLeagueId />);
      expect(screen.queryByText('Invite Friends')).toBeNull();
    });

    it('renders the activity feed', () => {
      render(<FootballLeagueId />);
      expect(screen.getByTestId('league-activity-feed')).toBeTruthy();
    });

    it('renders snapshot stats section with Teams and Roster Size labels', () => {
      render(<FootballLeagueId />);
      expect(screen.getByText('Teams')).toBeTruthy();
      expect(screen.getByText('Roster Size')).toBeTruthy();
    });

    it('renders Weeks / Season label for football sport', () => {
      render(<FootballLeagueId />);
      expect(screen.getByText('Weeks / Season')).toBeTruthy();
    });

    it('renders draft live banner when draft is in progress', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, draftStatus: 'in-progress' } },
        loading: false,
      });
      render(<FootballLeagueId />);
      expect(screen.getByText('Draft Is Live')).toBeTruthy();
      expect(screen.getByText('Join Draft')).toBeTruthy();
    });

    it('does not render draft banner when draft is not active', () => {
      render(<FootballLeagueId />);
      expect(screen.queryByText('Draft Is Live')).toBeNull();
    });

    it('renders commissioner announcement when lmNotes is set', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: {
          league: { ...mockLeague, lmNotes: 'League meeting this Sunday!' },
        },
        loading: false,
      });
      render(<FootballLeagueId />);
      expect(screen.getByText('Commissioner Announcement')).toBeTruthy();
      expect(screen.getByText('League meeting this Sunday!')).toBeTruthy();
    });

    it('does not render commissioner announcement when lmNotes is empty', () => {
      render(<FootballLeagueId />);
      expect(screen.queryByText('Commissioner Announcement')).toBeNull();
    });

    it('renders quick standings when standings data is available', () => {
      const { useStandings } = jest.requireMock<{
        useStandings: jest.Mock;
      }>('../../../../features/matchup/hooks/useStandings');
      useStandings.mockReturnValue({
        standings: [
          {
            teamId: 1,
            teamName: 'Team Alpha',
            wins: 5,
            losses: 2,
            ties: 0,
            pointsFor: 420,
          },
          {
            teamId: 2,
            teamName: 'Team Beta',
            wins: 3,
            losses: 4,
            ties: 0,
            pointsFor: 310,
          },
        ],
        loading: false,
        error: undefined,
        refetch: jest.fn(),
      });
      render(<FootballLeagueId />);
      expect(screen.getByText('Team Alpha')).toBeTruthy();
      expect(screen.getByText('Team Beta')).toBeTruthy();
    });

    it('does not render quick standings section when standings is empty', () => {
      render(<FootballLeagueId />);
      expect(screen.queryByText('View All →')).toBeNull();
    });

    // Directly exercises the Premium Configuration chip row (LS-6330). Without
    // this, the row is only ever reached incidentally — via bracket-toggle
    // tests that happen to set a premium playoffFormat — so a `Chip` missing
    // from the shared-components mock surfaces as a confusing "Element type is
    // invalid" failure in an unrelated describe rather than here (LS-9545).
    it('renders a Premium Configuration chip for each active paid feature', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: {
          league: {
            ...mockLeague,
            waiverEnabled: true,
            waiverType: 'faab',
            salaryCapEnabled: true,
            playoffFormat: '6-team',
            defensiveFormat: 'idp',
          },
        },
        loading: false,
      });
      render(<FootballLeagueId />);

      expect(screen.getByText('Premium Configuration')).toBeTruthy();
      expect(screen.getByText('FAAB')).toBeTruthy();
      expect(screen.getByText('Salary Cap')).toBeTruthy();
      expect(screen.getByText('6-Team Playoff')).toBeTruthy();
      expect(screen.getByText('IDP')).toBeTruthy();
    });

    it('omits the Premium Configuration section when no paid feature is active', () => {
      render(<FootballLeagueId />);
      expect(screen.queryByText('Premium Configuration')).toBeNull();
    });
  });

  describe('paused draft banner (LS-8843)', () => {
    it('shows a "Draft Paused" banner with a "Return to Draft Room" action when draftStatus is paused', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, draftStatus: 'paused' } },
        loading: false,
      });
      render(<FootballLeagueId />);
      expect(screen.getByText('Draft Paused')).toBeTruthy();
      expect(screen.queryByText('Draft Is Live')).toBeNull();
      expect(screen.getByText('Return to Draft Room')).toBeTruthy();
    });

    it('navigates to the draft board when the paused-draft re-entry action is pressed', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, draftStatus: 'paused' } },
        loading: false,
      });
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByText('Return to Draft Room'));
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/DraftBoardPage' }),
      );
    });

    it.each(['not-started', 'queued', 'completed'])(
      'does not render a draft banner when draftStatus is %s',
      (draftStatus) => {
        mockGetLeagueByIdQuery.mockReturnValue({
          data: { league: { ...mockLeague, draftStatus } },
          loading: false,
        });
        render(<FootballLeagueId />);
        expect(screen.queryByText('Draft Paused')).toBeNull();
        expect(screen.queryByText('Draft Is Live')).toBeNull();
      },
    );
  });

  // LS-8838 — Home's "Set Lineup" pushes this route with `initialTab=roster`
  // so it must select the Roster tab on mount, not always default to Overview.
  describe('initial tab (LS-8838)', () => {
    it('opens directly on the Roster tab when initialTab=roster is passed', () => {
      const { useLocalSearchParams } = jest.requireMock<{
        useLocalSearchParams: jest.Mock;
      }>('expo-router');
      useLocalSearchParams.mockReturnValue({
        leagueId: '42',
        initialTab: 'roster',
      });

      render(<FootballLeagueId />);
      expect(screen.getByTestId('league-roster-management')).toBeTruthy();
    });

    it('defaults to the Overview tab when initialTab is absent', () => {
      render(<FootballLeagueId />);
      expect(screen.queryByTestId('league-roster-management')).toBeNull();
    });
  });

  // LS-6332 (FLD-019) — spectators / non-members have no userTeamId; the
  // roster tab must not render the management UI (with its assign/remove/swap
  // affordances) for them.
  describe('roster tab for non-members (LS-6332)', () => {
    it('shows a join prompt instead of roster management when userTeamId is null', () => {
      mockGetUserTeamIdLazyQuery.mockReturnValue([
        jest.fn(),
        { data: { userTeamId: null }, loading: false },
      ]);
      const { useLocalSearchParams } = jest.requireMock<{
        useLocalSearchParams: jest.Mock;
      }>('expo-router');
      useLocalSearchParams.mockReturnValue({
        leagueId: '42',
        initialTab: 'roster',
      });

      render(<FootballLeagueId />);

      expect(screen.queryByTestId('league-roster-management')).toBeNull();
      expect(
        screen.getByText('Join this league to manage a roster.'),
      ).toBeTruthy();
    });
  });

  describe('waivers tab', () => {
    it('does not render Waivers tab when waiverEnabled is false', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, waiverEnabled: false } },
        loading: false,
      });
      render(<FootballLeagueId />);
      expect(screen.queryByTestId('tab-waivers')).toBeNull();
    });

    it('renders Waivers tab when waiverEnabled is true', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, waiverEnabled: true } },
        loading: false,
      });
      render(<FootballLeagueId />);
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
      render(<FootballLeagueId />);
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
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-waivers'));
      fireEvent.press(screen.getByText('Browse Free Agents & Submit Claim'));
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/FreeAgents' }),
      );
    });
  });

  describe('matchups tab playoff bracket toggle (FLD-017)', () => {
    const mockPlayoffBracket = {
      season: 2026,
      format: '6-team',
      matchups: [{ id: 1, round: 'semifinals', matchupNumber: 1 }],
    };

    function mockUsePlayoffBracket(bracket: typeof mockPlayoffBracket | null) {
      jest
        .requireMock<{
          usePlayoffBracket: jest.Mock;
        }>('@legacy-sports/shared-components')
        .usePlayoffBracket.mockReturnValue({
          bracket,
          loading: false,
          error: undefined,
          refetch: jest.fn(),
        });
    }

    it('does not render the view toggle when the league has no playoff format', () => {
      mockUsePlayoffBracket(mockPlayoffBracket);
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-matchups'));
      expect(screen.queryByTestId('matchups-view-toggle')).toBeNull();
      expect(screen.getByTestId('matchup-list')).toBeTruthy();
    });

    it('does not render the view toggle when the bracket has no seeded matchups', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, playoffFormat: '6-team' } },
        loading: false,
      });
      mockUsePlayoffBracket({ ...mockPlayoffBracket, matchups: [] });
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-matchups'));
      expect(screen.queryByTestId('matchups-view-toggle')).toBeNull();
      expect(screen.getByTestId('matchup-list')).toBeTruthy();
    });

    it('renders the view toggle, defaulting to the flat list, once the league has a seeded playoff bracket', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, playoffFormat: '6-team' } },
        loading: false,
      });
      mockUsePlayoffBracket(mockPlayoffBracket);
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-matchups'));
      expect(screen.getByTestId('matchups-view-toggle')).toBeTruthy();
      expect(screen.getByTestId('matchup-list')).toBeTruthy();
      expect(screen.queryByTestId('playoff-bracket')).toBeNull();
    });

    it('switches to the bracket view on toggle, replacing the flat list', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, playoffFormat: '6-team' } },
        loading: false,
      });
      mockUsePlayoffBracket(mockPlayoffBracket);
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-matchups'));
      fireEvent.press(screen.getByTestId('matchups-view-toggle-bracket'));
      expect(screen.getByTestId('playoff-bracket')).toBeTruthy();
      expect(screen.queryByTestId('matchup-list')).toBeNull();
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
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-trades'));

      expect(mockCapturedTradesSubscribeRefresh).toBeInstanceOf(Function);
      expect(mockCapturedWaiverSubscribeRefresh[0]).toBeInstanceOf(Function);
    });

    it('wires the Waivers-tab PendingWaiverClaims to its own onSubscribeRefresh', () => {
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-trades'));
      fireEvent.press(screen.getByTestId('tab-waivers'));

      expect(mockCapturedWaiverSubscribeRefresh).toHaveLength(2);
      expect(mockCapturedWaiverSubscribeRefresh[0]).not.toBe(
        mockCapturedWaiverSubscribeRefresh[1],
      );
    });
  });

  // FLD-016 (LS-6321) — the Matchups tab previously had only a single
  // assertion that the "Matchups" tab label rendered. These tests cover the
  // page's wiring of useMatchupsForLeague into MatchupList across its
  // loading, empty, and populated-list branches, plus row-press navigation.
  describe('matchups tab (LS-6321)', () => {
    const { useMatchupsForLeague } = jest.requireMock<{
      useMatchupsForLeague: jest.Mock;
    }>('../../../../features/matchup/hooks/useMatchup');

    beforeEach(() => {
      useMatchupsForLeague.mockReturnValue({
        matchups: [],
        loading: false,
        refetch: jest.fn(),
      });
    });

    it('shows the loading state while matchups are loading', () => {
      useMatchupsForLeague.mockReturnValue({
        matchups: [],
        loading: true,
        refetch: jest.fn(),
      });
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-matchups'));
      expect(screen.getByText('Loading matchups...')).toBeTruthy();
    });

    it('shows the empty message when there are no matchups', () => {
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-matchups'));
      expect(
        screen.getByText('No matchups found for this league'),
      ).toBeTruthy();
    });

    it('renders a row per matchup returned for the league', () => {
      useMatchupsForLeague.mockReturnValue({
        matchups: [{ id: 1 }, { id: 2 }, { id: 3 }],
        loading: false,
        refetch: jest.fn(),
      });
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-matchups'));
      expect(screen.getByTestId('matchup-row-1')).toBeTruthy();
      expect(screen.getByTestId('matchup-row-2')).toBeTruthy();
      expect(screen.getByTestId('matchup-row-3')).toBeTruthy();
    });

    it('navigates to the matchup detail screen when a row is pressed', () => {
      useMatchupsForLeague.mockReturnValue({
        matchups: [{ id: 7 }],
        loading: false,
        refetch: jest.fn(),
      });
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-matchups'));
      fireEvent.press(screen.getByTestId('matchup-row-7'));
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/football/matchup',
          params: { matchupId: '7', leagueId: '42' },
        }),
      );
    });
  });
});
