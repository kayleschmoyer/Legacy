import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
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

// Captures LeagueRosterManagement's onPlayerAssign/onPlayerRemove so the
// optimistic-response wiring can be exercised (LS-6336).
let mockCapturedOnPlayerAssign: ((...args: unknown[]) => void) | null = null;
let mockCapturedOnPlayerRemove: ((...args: unknown[]) => void) | null = null;

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

// The 'react-native' index exposes `Share` via a `default` re-export, so the
// mock must expose the share object as the module's *default* export (see
// baseball [leagueId].spec.tsx) — otherwise `Share.share` resolves to
// undefined and the invite-share handler throws.
const mockShareFn = jest.fn().mockResolvedValue({ action: 'dismissedAction' });
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
    Chip: ({ label }: { label: string }) => (
      <Text testID="league-config-chip">{label}</Text>
    ),
    CommissionerAuditLog: () => <View testID="commissioner-audit-log" />,
    CommissionerNoteControl: () => <View testID="commissioner-note-control" />,
    Chip: ({ label }: { label: string; tone?: string }) => (
      <View testID={`chip-${label}`}>
        <Text>{label}</Text>
      </View>
    ),
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
    StandingsTable: ({
      standings,
      onTeamPress,
    }: {
      standings: ReadonlyArray<{
        teamId?: number | string | null;
        teamName?: string | null;
      }>;
      onTeamPress?: (teamId: number) => void;
    }) => (
      <View testID="standings-table">
        {standings.map((s) => (
          <TouchableOpacity
            key={String(s.teamId)}
            testID={`standings-team-${String(s.teamId)}`}
            onPress={() => onTeamPress?.(Number(s.teamId))}
          >
            <Text>{s.teamName}</Text>
          </TouchableOpacity>
        ))}
      </View>
    ),
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
  const { View, Text, TouchableOpacity } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LeagueRosterManagement: (props: {
      viewingTeamName?: string | null;
      onBackToMyRoster?: () => void;
      onPlayerAssign?: (...args: unknown[]) => void;
      onPlayerRemove?: (...args: unknown[]) => void;
    }) => {
      mockCapturedOnPlayerAssign = props.onPlayerAssign ?? null;
      mockCapturedOnPlayerRemove = props.onPlayerRemove ?? null;
      return (
        <View testID="league-roster-management">
          {props.viewingTeamName != null && (
            <Text testID="league-roster-viewing-team-name">
              {props.viewingTeamName}
            </Text>
          )}
          {props.onBackToMyRoster && (
            <TouchableOpacity
              testID="back-to-my-roster-button"
              onPress={props.onBackToMyRoster}
            >
              <Text>Back to My Roster</Text>
            </TouchableOpacity>
          )}
        </View>
      );
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

jest.mock('../../FreeAgents', () => {
  const { View, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LeagueFreeAgents: ({ leagueId }: { leagueId: number }) => (
      <View testID="league-free-agents">
        <Text>{leagueId}</Text>
      </View>
    ),
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

const mockUseSubscription = jest.fn(() => ({ isPremium: false }));
jest.mock('../../../../features/subscription/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

// Captures the options passed to useLeagueWebSocket by LeagueWSPageHandler so
// tests can invoke onMatchupScoreUpdated directly without a real WS client
// (LS-6316 / FLD-011).
let mockCapturedWsOptions: {
  onMatchupScoreUpdated?: () => void;
} | null = null;
jest.mock('../../../../hooks/useLeagueWebSocket', () => ({
  useLeagueWebSocket: (options: { onMatchupScoreUpdated?: () => void }) => {
    mockCapturedWsOptions = options;
    return { connected: false };
  },
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
const mockGetTeamMembersQuery = jest.fn(
  (): { data: { teamMembers: unknown[] }; loading: boolean } => ({
    data: { teamMembers: [] },
    loading: false,
  }),
);
const mockGetUserTeamIdLazyQuery = jest.fn(() => [
  jest.fn(),
  { data: { userTeamId: 10 }, loading: false },
]);
const mockGetTeamMembersLazyQuery = jest.fn(() => [
  jest.fn().mockResolvedValue({ data: { teamMembers: [] } }),
  { data: { teamMembers: [] }, loading: false },
]);
const mockUpdateTeamMemberPositionMutation = jest.fn(() => [jest.fn()]);
const mockGetTeamByIdQuery = jest.fn(() => ({
  data: undefined,
  loading: false,
}));
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
  useGetTeamMembersLazyQuery: (...args: unknown[]) =>
    mockGetTeamMembersLazyQuery(...args),
  useGetUserTeamIdLazyQuery: (...args: unknown[]) =>
    mockGetUserTeamIdLazyQuery(...args),
  useUpdateTeamMemberPositionMutation: (...args: unknown[]) =>
    mockUpdateTeamMemberPositionMutation(...args),
  useSwapTeamMemberPositionsMutation: () => [jest.fn()],
  useGetTeamByIdQuery: (...args: unknown[]) => mockGetTeamByIdQuery(...args),
  useGetNflTeamSeasonMetadataQuery: (...args: unknown[]) =>
    mockGetNflTeamSeasonMetadataQuery(...args),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FootballLeagueId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCapturedTradesSubscribeRefresh = null;
    mockCapturedWaiverSubscribeRefresh.length = 0;
    mockCapturedOnPlayerAssign = null;
    mockCapturedOnPlayerRemove = null;
    mockCapturedWsOptions = null;
    mockUseSubscription.mockReturnValue({ isPremium: false });
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
    mockGetTeamByIdQuery.mockReturnValue({ data: undefined, loading: false });
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

    it('renders Free Agents tab', () => {
      render(<FootballLeagueId />);
      expect(screen.getByText('Free Agents')).toBeTruthy();
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

  describe('cap-remaining data fetch (LS-6338)', () => {
    it('skips useGetTeamByIdQuery when the league is not a salary-cap league', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, salaryCapEnabled: false } },
        loading: false,
      });
      render(<FootballLeagueId />);
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
      render(<FootballLeagueId />);
      expect(mockGetTeamByIdQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: true }),
      );
    });

    it('fetches useGetTeamByIdQuery when the league is a salary-cap league and a user team exists', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, salaryCapEnabled: true } },
        loading: false,
      });
      render(<FootballLeagueId />);
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

  describe('chat tab visibility for non-members (LS-6295 / FLD-043)', () => {
    const asNonMember = () => {
      mockGetUserTeamIdLazyQuery.mockReturnValue([
        jest.fn(),
        { data: { userTeamId: null }, loading: false },
      ]);
    };

    it('does not render the Chat tab for a non-member', () => {
      asNonMember();
      render(<FootballLeagueId />);
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

      render(<FootballLeagueId />);
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

      render(<FootballLeagueId />);
      expect(screen.getByText('Chat')).toBeTruthy();
      expect(screen.getByTestId('league-chat-tab')).toBeTruthy();
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

    // FLD-052 / LS-6304 — a free commissioner joining a live IDP draft gets no
    // client-side signal that the draft uses a premium format. useSubscription
    // is mocked to isPremium: false above.
    it('renders a "Premium Draft Settings" chip on the join-draft banner for an IDP draft (FLD-052 / LS-6304)', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: {
          league: {
            ...mockLeague,
            draftStatus: 'in-progress',
            defensiveFormat: 'idp',
          },
        },
        loading: false,
      });
      render(<FootballLeagueId />);
      expect(screen.getByText('Premium Draft Settings')).toBeTruthy();
    });

    it('omits the "Premium Draft Settings" chip when the draft is not IDP (FLD-052 / LS-6304)', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, draftStatus: 'in-progress' } },
        loading: false,
      });
      render(<FootballLeagueId />);
      expect(screen.queryByText('Premium Draft Settings')).toBeNull();
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

  // LS-6336 — roster position mutations must carry an optimisticResponse so
  // drag-and-drop reflects immediately instead of waiting for the round-trip.
  describe('roster mutation optimistic UI (LS-6336)', () => {
    const mockTeamMember = {
      __typename: 'TeamMember',
      id: 501,
      playerId: 7,
      positionId: 1,
      teamId: 10,
      leagueId: 42,
      onTradeBlock: false,
      salary: null,
      askingPrice: null,
      nickname: null,
      isLocked: false,
      player: {
        __typename: 'Player',
        id: 7,
        firstName: 'Josh',
        lastName: 'Allen',
        brefId: null,
        eligiblePositions: ['QB'],
      },
    };
    const mockPosition = { id: 2, leagueId: 42, positionType: 'RB' };
    // Matches mockTeamMember.positionId so handlePlayerRemove's lookup finds it.
    const mockOccupiedPosition = { id: 1, leagueId: 42, positionType: 'QB' };

    function renderRosterTab() {
      const { useLocalSearchParams } = jest.requireMock<{
        useLocalSearchParams: jest.Mock;
      }>('expo-router');
      useLocalSearchParams.mockReturnValue({
        leagueId: '42',
        initialTab: 'roster',
      });
      mockGetTeamMembersQuery.mockReturnValue({
        data: { teamMembers: [mockTeamMember] },
        loading: false,
      });
      render(<FootballLeagueId />);
    }

    it('passes an optimisticResponse built from the cached team member on assign', () => {
      const mockMutate = jest.fn().mockResolvedValue({});
      mockUpdateTeamMemberPositionMutation.mockReturnValue([mockMutate]);
      renderRosterTab();

      void act(() => {
        mockCapturedOnPlayerAssign?.(mockTeamMember, mockPosition);
      });

      expect(mockMutate).toHaveBeenCalledWith({
        variables: {
          teamMemberId: mockTeamMember.id,
          positionId: mockPosition.id,
        },
        optimisticResponse: {
          updateTeamMemberPosition: {
            ...mockTeamMember,
            positionId: mockPosition.id,
          },
        },
      });
    });

    it('passes an optimisticResponse with a null positionId on remove', () => {
      const mockMutate = jest.fn().mockResolvedValue({});
      mockUpdateTeamMemberPositionMutation.mockReturnValue([mockMutate]);
      renderRosterTab();

      void act(() => {
        mockCapturedOnPlayerRemove?.(mockOccupiedPosition);
      });

      expect(mockMutate).toHaveBeenCalledWith({
        variables: { teamMemberId: mockTeamMember.id, positionId: null },
        optimisticResponse: {
          updateTeamMemberPosition: { ...mockTeamMember, positionId: null },
        },
      });
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

  // FLD-026 / LS-5417 parity — a top-level Free Agents tab so leagues without
  // waivers enabled (which hid the only other path to this screen, the
  // Waivers tab's browse button) still have a way to browse the pool.
  describe('free agents tab (LS-6309)', () => {
    it('renders LeagueFreeAgents for the current league when the user has a team', () => {
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-free-agents'));

      expect(screen.getByTestId('league-free-agents')).toBeTruthy();
      expect(screen.getByText('42')).toBeTruthy();
    });

    it('shows a join prompt instead of free agents when userTeamId is null', () => {
      mockGetUserTeamIdLazyQuery.mockReturnValue([
        jest.fn(),
        { data: { userTeamId: null }, loading: false },
      ]);

      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-free-agents'));

      expect(screen.queryByTestId('league-free-agents')).toBeNull();
      expect(
        screen.getByText(
          'Join this league to browse free agents and submit claims.',
        ),
      ).toBeTruthy();
    });
  });

  // LS-6335 (FLD-022) — tapping an opponent's team in Standings switches to
  // the Roster tab in "viewing another team" mode; navigating to Roster
  // directly, or pressing "Back to My Roster", always returns to the
  // viewer's own roster.
  describe('other team viewing (LS-6335)', () => {
    beforeEach(() => {
      jest
        .requireMock<{
          useStandings: jest.Mock;
        }>('../../../../features/matchup/hooks/useStandings')
        .useStandings.mockReturnValue({
          standings: [
            { teamId: 10, teamName: 'My Team' },
            { teamId: 20, teamName: 'Opponent Team' },
          ],
          loading: false,
          error: undefined,
          refetch: jest.fn(),
        });
    });

    it('tapping an opponent team in Standings switches to Roster and passes viewingTeamName/onBackToMyRoster', () => {
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-standings'));
      fireEvent.press(screen.getByTestId('standings-team-20'));

      expect(screen.getByTestId('league-roster-management')).toBeTruthy();
      expect(
        screen.getByTestId('league-roster-viewing-team-name'),
      ).toHaveTextContent('Opponent Team');
      expect(screen.getByTestId('back-to-my-roster-button')).toBeTruthy();
    });

    it('tapping your own team in Standings switches to Roster without viewingTeamName', () => {
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-standings'));
      fireEvent.press(screen.getByTestId('standings-team-10'));

      expect(screen.getByTestId('league-roster-management')).toBeTruthy();
      expect(
        screen.queryByTestId('league-roster-viewing-team-name'),
      ).toBeNull();
    });

    it('pressing "Back to My Roster" clears the viewed opponent', () => {
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-standings'));
      fireEvent.press(screen.getByTestId('standings-team-20'));
      expect(
        screen.getByTestId('league-roster-viewing-team-name'),
      ).toHaveTextContent('Opponent Team');

      fireEvent.press(screen.getByTestId('back-to-my-roster-button'));

      expect(
        screen.queryByTestId('league-roster-viewing-team-name'),
      ).toBeNull();
    });

    it('selecting the Roster tab directly always resets to the viewer’s own roster', () => {
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('tab-standings'));
      fireEvent.press(screen.getByTestId('standings-team-20'));
      expect(
        screen.getByTestId('league-roster-viewing-team-name'),
      ).toHaveTextContent('Opponent Team');

      fireEvent.press(screen.getByTestId('tab-roster'));

      expect(
        screen.queryByTestId('league-roster-viewing-team-name'),
      ).toBeNull();
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

  // LS-6329 (FLD-006): the invite link previously had no UTM/source params,
  // so growth analytics couldn't attribute a join to the share sheet vs. a
  // copied code vs. a deep link. The handler now appends `src`/`platform`.
  describe('share invite (LS-6329)', () => {
    beforeEach(() => {
      jest
        .requireMock<{
          useAuthorizedUserInfo: jest.Mock;
        }>('../../../../common/auth/AuthorizedUserContext')
        .useAuthorizedUserInfo.mockReturnValue({ id: 99, isAdmin: false });
    });

    it('appends src=share and the current platform to the shared invite URL', async () => {
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('invite-share-button'));

      await waitFor(() => expect(mockShareFn).toHaveBeenCalledTimes(1));
      expect(mockShareFn).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://legacysports.app/football/league/join/TESTCODE?src=share&platform=ios',
        }),
      );
    });

    it('shares an invite without a URL when the league has no invite code', () => {
      mockGetLeagueByIdQuery.mockReturnValue({
        data: { league: { ...mockLeague, inviteCode: '' } },
        loading: false,
      });
      render(<FootballLeagueId />);
      fireEvent.press(screen.getByTestId('invite-share-button'));

      expect(mockShareFn).toHaveBeenCalledWith(
        expect.objectContaining({ url: undefined }),
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

  // LS-6316 (FLD-011): matchup scoring previously had no WS handler at all —
  // the matchups list only ever refreshed via manual pull-to-refresh, with no
  // premium/free distinction.
  describe('live score updates (LS-6316 / FLD-011)', () => {
    const { useMatchupsForLeague } = jest.requireMock<{
      useMatchupsForLeague: jest.Mock;
    }>('../../../../features/matchup/hooks/useMatchup');

    it('polls matchups every 60s for free-tier users', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false });
      render(<FootballLeagueId />);
      expect(useMatchupsForLeague).toHaveBeenCalledWith(42, undefined, 60_000);
    });

    it('does not poll matchups for premium users (relies on the WS push instead)', () => {
      mockUseSubscription.mockReturnValue({ isPremium: true });
      render(<FootballLeagueId />);
      expect(useMatchupsForLeague).toHaveBeenCalledWith(
        42,
        undefined,
        undefined,
      );
    });

    it('refetches matchups on a WS score update for premium users', () => {
      mockUseSubscription.mockReturnValue({ isPremium: true });
      const refetch = jest.fn();
      useMatchupsForLeague.mockReturnValue({
        matchups: [],
        loading: false,
        refetch,
      });
      render(<FootballLeagueId />);

      void act(() => {
        mockCapturedWsOptions?.onMatchupScoreUpdated?.();
      });

      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('ignores a WS score update for free-tier users (they rely on 60s polling)', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false });
      const refetch = jest.fn();
      useMatchupsForLeague.mockReturnValue({
        matchups: [],
        loading: false,
        refetch,
      });
      render(<FootballLeagueId />);

      void act(() => {
        mockCapturedWsOptions?.onMatchupScoreUpdated?.();
      });

      expect(refetch).not.toHaveBeenCalled();
    });
  });
});
