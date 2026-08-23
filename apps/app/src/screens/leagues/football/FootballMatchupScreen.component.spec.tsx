import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import * as graphqlLib from '@legacy-sports/graphql';
import * as sharedComponentsLib from '@legacy-sports/shared-components';
import { FootballMatchupScreen } from './FootballMatchupScreen';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

type AppStateChangeHandler = (state: string) => void;
let appStateListeners: AppStateChangeHandler[] = [];
const mockAppStateAddEventListener = jest.fn(
  (_event: string, handler: AppStateChangeHandler) => {
    appStateListeners.push(handler);
    return {
      remove: () => {
        appStateListeners = appStateListeners.filter((h) => h !== handler);
      },
    };
  },
);

jest.mock('react-native', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(RN, {
    get(target, prop: string) {
      if (prop === 'AppState') {
        return {
          addEventListener: (...args: [string, AppStateChangeHandler]) =>
            mockAppStateAddEventListener(...args),
        };
      }
      return Reflect.get(target, prop) as unknown;
    },
  });
});

const mockMatchup = {
  id: 1,
  team1Id: 10,
  team2Id: 20,
  team1Score: 102.5,
  team2Score: 87.3,
  status: 'in_progress',
  weekNumber: 7,
  team1: { id: 10, name: "Schmoyer's Smashers", primaryColor: '#123456' },
  team2: { id: 20, name: 'Gridiron Ghosts', primaryColor: '#654321' },
};

const COMPLETED_MATCHUP = {
  ...mockMatchup,
  status: 'completed',
};

const mockPlayer = {
  id: 5,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  eligiblePositions: ['QB'],
};

const mockMatchupPlayer = {
  id: 201,
  playerId: 5,
  teamId: 10,
  player: mockPlayer,
};

const mockRefetchMatchup = jest.fn().mockResolvedValue(undefined);
const mockRefetchPlayers = jest.fn().mockResolvedValue(undefined);

jest.mock('@legacy-sports/graphql', () => ({
  MatchupStatus: {
    Scheduled: 'scheduled',
    InProgress: 'in_progress',
    Completed: 'completed',
    Cancelled: 'cancelled',
  },
  useGetMatchupByIdQuery: jest.fn(() => ({
    data: { getMatchupById: mockMatchup },
    loading: false,
    error: undefined,
    networkStatus: 7, // NetworkStatus.ready
    refetch: mockRefetchMatchup,
  })),
  useGetMatchupPlayersQuery: jest.fn(() => ({
    data: { getMatchupPlayers: [mockMatchupPlayer] },
    loading: false,
    refetch: mockRefetchPlayers,
  })),
  useGetHeadToHeadRecordQuery: jest.fn(() => ({
    data: undefined,
    loading: false,
  })),
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
    useWebSocket: jest.fn(() => ({ connected: false })),
    Chip: ({
      label,
      testID,
    }: {
      label: string;
      testID?: string;
      [key: string]: unknown;
    }) => (
      <View testID={testID}>
        <Text>{label}</Text>
      </View>
    ),
  };
});

// Render a minimal stand-in for the shared scoreboard hero so this suite
// stays focused on FootballMatchupScreen's own logic (team/record/status/
// counter wiring) rather than re-testing MatchupScoreboardHero's internals
// (see its own spec). Mirrors MatchupDetailScreen.spec.tsx's approach for
// the same shared-components/matchup boundary.
jest.mock('@legacy-sports/shared-components/matchup', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { Text, View } = jest.requireActual<RNComponents>('react-native');
  return {
    MatchupScoreboardHero: ({
      weekNumber,
      totalMatchups,
      status,
      team1,
      team2,
    }: {
      weekNumber?: number | null;
      totalMatchups?: number | null;
      status?: string | null;
      team1: { name?: string | null; record?: string | null; score?: number };
      team2: { name?: string | null; record?: string | null; score?: number };
    }) =>
      ReactActual.createElement(
        View,
        { testID: 'matchup-scoreboard-hero' },
        status != null
          ? ReactActual.createElement(Text, { testID: 'status-chip' }, status)
          : null,
        ReactActual.createElement(Text, null, team1.name),
        team1.record != null
          ? ReactActual.createElement(Text, null, team1.record)
          : null,
        ReactActual.createElement(Text, null, (team1.score ?? 0).toFixed(2)),
        ReactActual.createElement(Text, null, team2.name),
        team2.record != null
          ? ReactActual.createElement(Text, null, team2.record)
          : null,
        ReactActual.createElement(Text, null, (team2.score ?? 0).toFixed(2)),
        weekNumber != null
          ? ReactActual.createElement(
              Text,
              null,
              `Matchup ${weekNumber}${totalMatchups ? `/${totalMatchups}` : ''}`,
            )
          : null,
      ),
    MatchupRecapPanel: () =>
      ReactActual.createElement(View, { testID: 'recap-panel' }),
  };
});

jest.mock('@legacy-sports/app-config/native', () => ({
  config: { websocketUrl: 'wss://example.test' },
}));

const mockUseStandings = jest.fn(() => ({
  standings: [] as {
    teamId: number;
    wins: number;
    losses: number;
    ties: number;
  }[],
  loading: false,
  error: undefined,
  refetch: jest.fn(),
}));
jest.mock('../../../features/matchup/hooks/useStandings', () => ({
  useStandings: (...args: unknown[]) => mockUseStandings(...args),
}));

jest.mock('../../../common/auth/AuthHooks', () => ({
  readKeychainValue: jest.fn().mockResolvedValue('mock-token'),
  Secret: { INTERNAL_JWT: 'INTERNAL_JWT' },
}));

const mockUseHasEntitlement = jest.fn<boolean, [string]>();
jest.mock('../../../features/subscription/useSubscription', () => ({
  useHasEntitlement: (key: string) => mockUseHasEntitlement(key),
}));

// Pass-through gate: render children for premium users, otherwise an upgrade
// marker so tests can assert the locked state without the real overlay.
jest.mock('../../../features/subscription/PremiumGate', () => ({
  PremiumGate: ({
    isPremium,
    children,
  }: {
    isPremium: boolean;
    children: React.ReactNode;
  }) => {
    const ReactActual = jest.requireActual<typeof import('react')>('react');
    const { Text } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return isPremium
      ? (children as React.JSX.Element)
      : ReactActual.createElement(Text, null, 'UPGRADE_TO_PREMIUM');
  },
}));

jest.mock('@legacy-sports/utils', () => ({
  ENTITLEMENTS: { ai_matchup_recap: 'ai_matchup_recap' },
}));

jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
    createTokens: (tokens: unknown) => tokens,
    Card: ({
      children,
      testID,
    }: {
      children: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
    ScrollView: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <View>{children}</View>,
    Separator: () => <View testID="separator" />,
    Spinner: ({ testID }: { testID?: string; [key: string]: unknown }) => (
      <View testID={testID ?? 'spinner'} />
    ),
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <Text testID={testID}>{children}</Text>,
    XStack: ({
      children,
      testID,
      onPress,
    }: {
      children?: React.ReactNode;
      testID?: string;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <View testID={testID} onPress={onPress}>
        {children}
      </View>
    ),
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
  };
});

describe('FootballMatchupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateListeners = [];
    // Re-establish the implementation after clearAllMocks so the gate reads
    // the current mocked-per-test premium state at call time.
    mockUseHasEntitlement.mockImplementation(() => true);
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: { getMatchupById: mockMatchup },
      loading: false,
      error: undefined,
      networkStatus: 7, // NetworkStatus.ready
      refetch: mockRefetchMatchup,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);
    jest.mocked(graphqlLib.useGetMatchupPlayersQuery).mockReturnValue({
      data: { getMatchupPlayers: [mockMatchupPlayer] },
      loading: false,
      refetch: mockRefetchPlayers,
    } as ReturnType<typeof graphqlLib.useGetMatchupPlayersQuery>);
    jest.mocked(graphqlLib.useGetHeadToHeadRecordQuery).mockReturnValue({
      data: undefined,
      loading: false,
    } as ReturnType<typeof graphqlLib.useGetHeadToHeadRecordQuery>);
  });

  it('shows spinner while matchup is loading', () => {
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.getByTestId('spinner')).toBeTruthy();
  });

  it('shows error when matchup fetch fails', () => {
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('Fetch error'),
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.getByText(/Failed to load matchup\./)).toBeTruthy();
  });

  it('shows not-found message when matchup is null', () => {
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: { getMatchupById: null },
      loading: false,
      error: undefined,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.getByText('Matchup not found.')).toBeTruthy();
  });

  it('renders team scores', () => {
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.getByText('102.50')).toBeTruthy();
    expect(screen.getByText('87.30')).toBeTruthy();
  });

  it('does not render a head-to-head chip when there is no prior matchup history', () => {
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.queryByTestId('head-to-head-chip')).toBeNull();
  });

  it('does not render a head-to-head chip while the record is loading', () => {
    jest.mocked(graphqlLib.useGetHeadToHeadRecordQuery).mockReturnValue({
      data: undefined,
      loading: true,
    } as ReturnType<typeof graphqlLib.useGetHeadToHeadRecordQuery>);
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.queryByTestId('head-to-head-chip')).toBeNull();
  });

  it('renders the all-time head-to-head record as a chip near the score header', () => {
    jest.mocked(graphqlLib.useGetHeadToHeadRecordQuery).mockReturnValue({
      data: {
        getHeadToHeadRecord: {
          team1Id: '10',
          team2Id: '20',
          team1Wins: 3,
          team2Wins: 2,
          ties: 0,
          totalMatchups: 5,
        },
      },
      loading: false,
    } as ReturnType<typeof graphqlLib.useGetHeadToHeadRecordQuery>);
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.getByTestId('head-to-head-chip')).toBeTruthy();
    expect(screen.getByText('Team 10 vs Team 20: 3-2 all-time')).toBeTruthy();
  });

  it('renders the matchup counter without a total when totalMatchups is absent', () => {
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.getByText('Matchup 7')).toBeTruthy();
  });

  it('renders the matchup counter with the league total-matchups value', () => {
    render(<FootballMatchupScreen matchupId={1} totalMatchups={14} />);
    expect(screen.getByText('Matchup 7/14')).toBeTruthy();
  });

  it('renders team names instead of raw team IDs (LS-6361)', () => {
    render(<FootballMatchupScreen matchupId={1} leagueId={99} />);
    expect(screen.getAllByText("Schmoyer's Smashers").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText('Gridiron Ghosts').length).toBeGreaterThan(0);
    expect(screen.queryByText('Team 10')).toBeNull();
    expect(screen.queryByText('Team 20')).toBeNull();
  });

  it('renders each team record from league standings', () => {
    mockUseStandings.mockReturnValue({
      standings: [
        { teamId: 10, wins: 5, losses: 2, ties: 0 },
        { teamId: 20, wins: 3, losses: 4, ties: 1 },
      ],
      loading: false,
      error: undefined,
      refetch: jest.fn(),
    });
    render(<FootballMatchupScreen matchupId={1} leagueId={99} />);
    expect(screen.getByText('5-2')).toBeTruthy();
    expect(screen.getByText('3-4-1')).toBeTruthy();
  });

  it('falls back to "Team {id}" when team data is missing from the matchup', () => {
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: { getMatchupById: { ...mockMatchup, team1: null, team2: null } },
      loading: false,
      error: undefined,
      networkStatus: 7, // NetworkStatus.ready
      refetch: mockRefetchMatchup,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.getAllByText('Team 10').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Team 20').length).toBeGreaterThan(0);
  });

  it('renders the matchup status chip with the current status', () => {
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.getByTestId('status-chip')).toBeTruthy();
    expect(screen.getByText('in_progress')).toBeTruthy();
  });

  it.each(['scheduled', 'in_progress', 'completed', 'cancelled'])(
    'renders the status chip for status %s',
    (status) => {
      jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
        data: { getMatchupById: { ...mockMatchup, status } },
        loading: false,
        error: undefined,
        networkStatus: 7, // NetworkStatus.ready
        refetch: mockRefetchMatchup,
      } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);

      render(<FootballMatchupScreen matchupId={1} />);

      expect(screen.getByTestId('status-chip')).toBeTruthy();
      expect(screen.getByText(status)).toBeTruthy();
    },
  );

  it('renders player name for team 1', () => {
    render(<FootballMatchupScreen matchupId={1} defensiveFormat="dst" />);
    expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
  });

  it('navigates to the football player detail route when a player row is pressed', () => {
    render(<FootballMatchupScreen matchupId={1} defensiveFormat="dst" />);

    fireEvent.press(screen.getByText('Patrick Mahomes'));

    expect(mockRouterPush).toHaveBeenCalledWith('/football/players/5');
  });

  it('renders DST position slot in DST format', () => {
    render(<FootballMatchupScreen matchupId={1} defensiveFormat="dst" />);
    // Both team rosters render the slot label; at least one must be present
    expect(screen.getAllByText('D/ST').length).toBeGreaterThan(0);
  });

  it('renders DL position slot in IDP format', () => {
    render(<FootballMatchupScreen matchupId={1} defensiveFormat="idp" />);
    expect(screen.getAllByText('DL').length).toBeGreaterThan(0);
  });

  it('refetches matchup and players network-only when the app returns to foreground', () => {
    render(<FootballMatchupScreen matchupId={1} />);

    expect(mockAppStateAddEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
    expect(mockRefetchMatchup).not.toHaveBeenCalled();
    expect(mockRefetchPlayers).not.toHaveBeenCalled();

    appStateListeners.forEach((handler) => handler('active'));

    expect(mockRefetchMatchup).toHaveBeenCalledTimes(1);
    expect(mockRefetchPlayers).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when the app state changes to background', () => {
    render(<FootballMatchupScreen matchupId={1} />);

    appStateListeners.forEach((handler) => handler('background'));

    expect(mockRefetchMatchup).not.toHaveBeenCalled();
    expect(mockRefetchPlayers).not.toHaveBeenCalled();
  });

  it('shows a refreshing indicator instead of stale score data while a background refetch is in flight', () => {
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: { getMatchupById: mockMatchup },
      loading: false,
      error: undefined,
      networkStatus: 4, // NetworkStatus.refetch
      refetch: mockRefetchMatchup,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);

    render(<FootballMatchupScreen matchupId={1} />);

    expect(screen.getByTestId('score-refreshing-spinner')).toBeTruthy();
  });

  it('subscribes to matchup stats updates for this matchup', () => {
    render(<FootballMatchupScreen matchupId={1} />);
    expect(sharedComponentsLib.useWebSocket).toHaveBeenCalledWith(
      expect.objectContaining({
        matchupId: 1,
        viewContext: 'matchup',
      }),
    );
  });

  it('refetches matchup and player data when a matchup-stats-complete notification arrives', () => {
    const matchupRefetch = jest.fn();
    const playersRefetch = jest.fn();
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: { getMatchupById: mockMatchup },
      loading: false,
      error: undefined,
      networkStatus: 7, // NetworkStatus.ready
      refetch: matchupRefetch,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);
    jest.mocked(graphqlLib.useGetMatchupPlayersQuery).mockReturnValue({
      data: { getMatchupPlayers: [mockMatchupPlayer] },
      loading: false,
      refetch: playersRefetch,
    } as ReturnType<typeof graphqlLib.useGetMatchupPlayersQuery>);

    render(<FootballMatchupScreen matchupId={1} />);

    const wsOptions = jest.mocked(sharedComponentsLib.useWebSocket).mock
      .calls[0][0];
    wsOptions?.onMatchupStatsComplete?.(
      {} as Parameters<NonNullable<typeof wsOptions.onMatchupStatsComplete>>[0],
    );

    expect(matchupRefetch).toHaveBeenCalled();
    expect(playersRefetch).toHaveBeenCalled();
  });

  it('refetches matchup and player data when the websocket reconnects (LS-5425)', () => {
    const matchupRefetch = jest.fn();
    const playersRefetch = jest.fn();
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: { getMatchupById: mockMatchup },
      loading: false,
      error: undefined,
      networkStatus: 7, // NetworkStatus.ready
      refetch: matchupRefetch,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);
    jest.mocked(graphqlLib.useGetMatchupPlayersQuery).mockReturnValue({
      data: { getMatchupPlayers: [mockMatchupPlayer] },
      loading: false,
      refetch: playersRefetch,
    } as ReturnType<typeof graphqlLib.useGetMatchupPlayersQuery>);

    render(<FootballMatchupScreen matchupId={1} />);

    const wsOptions = jest.mocked(sharedComponentsLib.useWebSocket).mock
      .calls[0][0];
    wsOptions?.onReconnect?.();

    expect(matchupRefetch).toHaveBeenCalled();
    expect(playersRefetch).toHaveBeenCalled();
  });
});

// ── AI Matchup Recap PremiumGate wiring (LS-6354) ────────────────────────────
// Football parity with baseball's MatchupDetailScreen recap panel gating.

describe('FootballMatchupScreen — AI Matchup Recap wiring (LS-6354)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateListeners = [];
    mockUseHasEntitlement.mockImplementation(() => true);
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: { getMatchupById: mockMatchup },
      loading: false,
      error: undefined,
      networkStatus: 7, // NetworkStatus.ready
      refetch: mockRefetchMatchup,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);
    jest.mocked(graphqlLib.useGetMatchupPlayersQuery).mockReturnValue({
      data: { getMatchupPlayers: [mockMatchupPlayer] },
      loading: false,
      refetch: mockRefetchPlayers,
    } as ReturnType<typeof graphqlLib.useGetMatchupPlayersQuery>);
  });

  it('shows the recap panel for premium users when the matchup is completed', () => {
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: { getMatchupById: COMPLETED_MATCHUP },
      loading: false,
      error: undefined,
      networkStatus: 7, // NetworkStatus.ready
      refetch: mockRefetchMatchup,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);
    mockUseHasEntitlement.mockImplementation(() => true);

    render(<FootballMatchupScreen matchupId={1} />);

    expect(screen.getByTestId('recap-panel')).toBeTruthy();
    expect(mockUseHasEntitlement).toHaveBeenCalledWith('ai_matchup_recap');
  });

  it('gates the recap panel behind the upgrade prompt for free users when the matchup is completed', () => {
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: { getMatchupById: COMPLETED_MATCHUP },
      loading: false,
      error: undefined,
      networkStatus: 7, // NetworkStatus.ready
      refetch: mockRefetchMatchup,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);
    mockUseHasEntitlement.mockImplementation(() => false);

    render(<FootballMatchupScreen matchupId={1} />);

    expect(screen.getByText('UPGRADE_TO_PREMIUM')).toBeTruthy();
    expect(screen.queryByTestId('recap-panel')).toBeNull();
  });

  it('omits the recap panel entirely when the matchup is not yet completed', () => {
    render(<FootballMatchupScreen matchupId={1} />);

    expect(screen.queryByTestId('recap-panel')).toBeNull();
    expect(screen.queryByText('UPGRADE_TO_PREMIUM')).toBeNull();
  });
});
