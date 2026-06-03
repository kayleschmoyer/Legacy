import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import FootballLeagueId from './[leagueId]';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

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
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    CommissionerAuditLog: () => <View testID="commissioner-audit-log" />,
    CommissionerNoteControl: () => <View testID="commissioner-note-control" />,
    DeleteLeagueControl: () => <View testID="delete-league-control" />,
    LeagueActivityFeed: () => <View testID="league-activity-feed" />,
    LeagueScoringSummary: () => <View testID="league-scoring-summary" />,
    LeagueTradeBlock: () => <View testID="league-trade-block" />,
    OnThisDayFeed: () => <View testID="on-this-day-feed" />,
    PendingTradeOffers: () => <View testID="pending-trade-offers" />,
    PendingWaiverClaims: () => <View testID="pending-waiver-claims" />,
    StandingsTable: () => <View testID="standings-table" />,
    useWebSocket: jest.fn(() => ({ connected: false })),
  };
});

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

jest.mock('../../../../features/matchup/components/MatchupList', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    MatchupList: () => <View testID="matchup-list" />,
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
const mockStartDraftMutation = jest.fn(() => [jest.fn(), { loading: false }]);
const mockUpdateTeamMemberPositionMutation = jest.fn(() => [jest.fn()]);

jest.mock('../../../../api/db/graphql.generated', () => ({
  useGetLeagueByIdQuery: (...args: unknown[]) =>
    mockGetLeagueByIdQuery(...args),
  useGetPositionsForLeagueQuery: (...args: unknown[]) =>
    mockGetPositionsForLeagueQuery(...args),
  useGetTeamMembersQuery: (...args: unknown[]) =>
    mockGetTeamMembersQuery(...args),
  useGetUserTeamIdLazyQuery: (...args: unknown[]) =>
    mockGetUserTeamIdLazyQuery(...args),
  useStartDraftMutation: (...args: unknown[]) =>
    mockStartDraftMutation(...args),
  useUpdateTeamMemberPositionMutation: (...args: unknown[]) =>
    mockUpdateTeamMemberPositionMutation(...args),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FootballLeagueId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    mockStartDraftMutation.mockReturnValue([jest.fn(), { loading: false }]);
    mockUpdateTeamMemberPositionMutation.mockReturnValue([jest.fn()]);
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
    it('renders the invite share section', () => {
      render(<FootballLeagueId />);
      expect(screen.getByText('Invite Friends')).toBeTruthy();
    });

    it('renders the activity feed', () => {
      render(<FootballLeagueId />);
      expect(screen.getByTestId('league-activity-feed')).toBeTruthy();
    });
  });
});
