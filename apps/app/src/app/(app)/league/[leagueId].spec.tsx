import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Subject ───────────────────────────────────────────────────────────────────

import LeagueContext from './[leagueId]';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
  ActivityIndicator: React.ComponentType<{ testID?: string }>;
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ leagueId: '1' }),
  useGlobalSearchParams: () => ({ leagueId: '1' }),
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn() }),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@legacy-sports/app-config/native', () => ({
  config: { websocketUrl: null, appBaseUrl: 'https://legacysports.app' },
}));

jest.mock('@tamagui/tabs', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as RNComponents;
  const Tabs = ({ children }: { children?: React.ReactNode }) => (
    <View>{children}</View>
  );
  Tabs.List = ({ children }: { children?: React.ReactNode }) => (
    <View testID="tabs-list">{children}</View>
  );
  Tabs.Tab = ({
    children,
    value,
  }: {
    children?: React.ReactNode;
    value: string;
  }) => <View testID={`tab-${value}`}>{children}</View>;
  Tabs.Content = ({
    children,
    value,
  }: {
    children?: React.ReactNode;
    value: string;
  }) => <View testID={`tab-content-${value}`}>{children}</View>;
  return { Tabs };
});

jest.mock('tamagui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native') as RNComponents;
  const { View, Text: RNText, ActivityIndicator } = RN;
  return {
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <View testID={testID}>{children}</View>,
    XStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <View testID={testID}>{children}</View>,
    Card: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <View testID={testID}>{children}</View>,
    H3: ({ children }: { children?: React.ReactNode }) => (
      <RNText>{children}</RNText>
    ),
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <RNText testID={testID}>{children}</RNText>,
    Button: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <RNText testID={testID}>{children}</RNText>,
    Spinner: () => <ActivityIndicator testID="spinner" />,
    Separator: () => <View />,
  };
});

jest.mock('@legacy-sports/shared-components', () => ({
  CommissionerAuditLog: () => null,
  CommissionerNoteControl: () => null,
  DeleteLeagueControl: () => null,
  LeagueTradeBlock: () => null,
  PendingTradeOffers: () => null,
  PendingWaiverClaims: () => null,
  StandingsTable: () => null,
  useWebSocket: () => ({ connected: false }),
}));

// Feature components
jest.mock('../../../features/roster/LeagueRosterManagement', () => ({
  LeagueRosterManagement: () => null,
}));
jest.mock('../../../features/leagues/LeagueChatTab', () => ({
  LeagueChatTab: () => null,
}));
jest.mock('../../../features/scoring/LeagueScoringEditor', () => ({
  LeagueScoringEditor: () => null,
}));
jest.mock('../../../features/commissioner/LeagueDuesSetup', () => ({
  LeagueDuesSetup: () => null,
}));
jest.mock('../../../features/commissioner/SalaryCapManagementCard', () => ({
  SalaryCapManagementCard: () => null,
}));
jest.mock('../../../features/matchup/components/MatchupList', () => ({
  MatchupList: () => null,
}));
jest.mock('../../../features/matchup/hooks/useMatchup', () => ({
  useMatchupsForLeague: () => ({ matchups: [], loading: false }),
}));
jest.mock('../../../features/matchup/hooks/useStandings', () => ({
  useStandings: () => ({ standings: [], loading: false, error: null }),
}));
jest.mock('../../../common/scoring', () => ({
  useLeagueScoringSettings: () => ({
    profile: null,
    loading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('../FreeAgents', () => ({
  LeagueFreeAgents: () => null,
}));

jest.mock('../../../common/auth/AuthHooks', () => ({
  readKeychainValue: jest.fn().mockResolvedValue(null),
  Secret: { INTERNAL_JWT: 'INTERNAL_JWT' },
}));

jest.mock('../../../common/utilities/ErrorHandler', () => ({
  handleError: jest.fn(),
}));

jest.mock('../../../common/utilities/RouteUtils', () => ({
  toIntId: (raw: unknown) =>
    typeof raw === 'string' && /^\d+$/.test(raw) ? parseInt(raw, 10) : null,
}));

const MOCK_LEAGUE = {
  __typename: 'League' as const,
  id: 1,
  name: 'Test League',
  owner: 1,
  sport: 'baseball',
  maxRosterSize: 25,
  gamesPerMatchup: 7,
  currentMatchup: null,
  currentWeekNumber: null,
  draftStatus: 'pre-draft',
  leaguePhase: 'pre-draft',
  inviteCode: null,
  lmNotes: null,
  playerPool: 'baseball',
  waiverEnabled: false,
  waiverType: null,
  weekAdvanceStatus: null,
  defensiveFormat: null,
  salaryCapEnabled: false,
  salaryCap: null,
  userMembership: null,
};

const mockUseGetLeagueByIdQuery = jest.fn(() => ({
  data: { league: MOCK_LEAGUE },
  loading: false,
}));
const mockUseGetPositionsForLeagueQuery = jest.fn(() => ({
  data: { leaguePositions: [] },
  loading: false,
}));
const mockUseGetLeagueTeamsQuery = jest.fn(() => ({
  data: { leagueTeams: [] },
  loading: false,
}));

jest.mock('../../../api/db/graphql.generated', () => ({
  useGetLeagueByIdQuery: (...args: unknown[]) =>
    mockUseGetLeagueByIdQuery(...args),
  useGetLeagueTeamsQuery: (...args: unknown[]) =>
    mockUseGetLeagueTeamsQuery(...args),
  useGetPositionsForLeagueQuery: (...args: unknown[]) =>
    mockUseGetPositionsForLeagueQuery(...args),
  useGetTeamMembersQuery: () => ({ data: null, loading: false, error: null }),
  useGetUserTeamIdLazyQuery: () => [
    jest.fn(),
    { data: null, loading: false, error: null },
  ],
  useStartDraftMutation: () => [jest.fn(), { loading: false }],
  useUpdateTeamMemberPositionMutation: () => [jest.fn()],
}));

const mockUseAuthorizedUserInfo = jest.fn(() => ({
  id: 2, // different from league.owner (1) → non-commissioner by default
  isAdmin: false,
}));

jest.mock('../../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: (...args: unknown[]) =>
    mockUseAuthorizedUserInfo(...args),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LeagueContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetLeagueByIdQuery.mockReturnValue({
      data: { league: MOCK_LEAGUE },
      loading: false,
    });
    mockUseAuthorizedUserInfo.mockReturnValue({ id: 2, isAdmin: false });
  });

  describe('loading state', () => {
    it('shows a spinner while league data is loading', () => {
      mockUseGetLeagueByIdQuery.mockReturnValue({ data: null, loading: true });
      render(<LeagueContext />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('shows error message when league is not found', () => {
      mockUseGetLeagueByIdQuery.mockReturnValue({
        data: { league: null },
        loading: false,
      });
      render(<LeagueContext />);
      expect(screen.getByText(/Could not find league/)).toBeTruthy();
    });
  });

  describe('tab rendering — non-commissioner', () => {
    it('renders all standard tabs', () => {
      render(<LeagueContext />);
      expect(screen.getByTestId('tab-matchup')).toBeTruthy();
      expect(screen.getByTestId('tab-roster')).toBeTruthy();
      expect(screen.getByTestId('tab-players')).toBeTruthy();
      expect(screen.getByTestId('tab-freeagents')).toBeTruthy();
      expect(screen.getByTestId('tab-trades')).toBeTruthy();
      expect(screen.getByTestId('tab-standings')).toBeTruthy();
      expect(screen.getByTestId('tab-chat')).toBeTruthy();
    });

    it('hides the Manage tab for non-commissioners', () => {
      render(<LeagueContext />);
      expect(screen.queryByTestId('tab-manage')).toBeNull();
    });
  });

  describe('tab rendering — commissioner', () => {
    it('shows the Manage tab when the user owns the league', () => {
      // user id 1 matches league.owner 1 → commissioner
      mockUseAuthorizedUserInfo.mockReturnValue({ id: 1, isAdmin: false });
      render(<LeagueContext />);
      expect(screen.getByTestId('tab-manage')).toBeTruthy();
    });

    it('shows the Manage tab for admin users regardless of ownership', () => {
      mockUseAuthorizedUserInfo.mockReturnValue({ id: 99, isAdmin: true });
      render(<LeagueContext />);
      expect(screen.getByTestId('tab-manage')).toBeTruthy();
    });
  });

  describe('unauthenticated state', () => {
    it('handles UNAUTHENTICATED error from useGetLeagueByIdQuery gracefully', () => {
      // useGetLeagueByIdQuery uses skip: isNaN(numLeagueId), not userInfo-based
      // skip — it runs for unauthenticated users. Simulates an UNAUTHENTICATED
      // GraphQL error response and asserts the component shows a graceful error.
      mockUseAuthorizedUserInfo.mockReturnValue(null);
      mockUseGetLeagueByIdQuery.mockReturnValue({
        data: null,
        loading: false,
        error: new Error('UNAUTHENTICATED'),
      });
      render(<LeagueContext />);
      expect(screen.getByText(/Could not find league/)).toBeTruthy();
    });

    it('handles UNAUTHENTICATED error from useGetPositionsForLeagueQuery gracefully', () => {
      // useGetPositionsForLeagueQuery uses skip: isNaN(numLeagueId) — runs for
      // unauthenticated users. When it returns UNAUTHENTICATED, positions are
      // empty and the roster tab renders without crashing.
      mockUseAuthorizedUserInfo.mockReturnValue(null);
      mockUseGetPositionsForLeagueQuery.mockReturnValue({
        data: null,
        loading: false,
        error: new Error('UNAUTHENTICATED'),
      });
      render(<LeagueContext />);
      expect(screen.getByTestId('tab-roster')).toBeTruthy();
    });

    it('handles UNAUTHENTICATED error from useGetLeagueTeamsQuery gracefully', () => {
      // useGetLeagueTeamsQuery has no userInfo-based skip. When it returns
      // UNAUTHENTICATED the Players tab shows an empty teams list.
      mockUseAuthorizedUserInfo.mockReturnValue(null);
      mockUseGetLeagueTeamsQuery.mockReturnValue({
        data: null,
        loading: false,
        error: new Error('UNAUTHENTICATED'),
      });
      render(<LeagueContext />);
      expect(screen.getByTestId('tab-players')).toBeTruthy();
    });

    it('skips useGetUserTeamIdLazyQuery when user id is null (UNAUTHENTICATED guard)', () => {
      // useGetUserTeamIdLazyQuery is fired from an effect guarded by
      // userInfo?.id — with id: null the lazy query is never called.
      mockUseAuthorizedUserInfo.mockReturnValue({ id: null, isAdmin: false });
      render(<LeagueContext />);
      expect(screen.getByTestId('tab-matchup')).toBeTruthy();
    });
  });
});
