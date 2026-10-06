import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import * as graphqlLib from '@legacy-sports/graphql';
import * as sharedComponentsLib from '@legacy-sports/shared-components';
import { FootballMatchupScreen } from './FootballMatchupScreen';

// Stubs the mobile lineup editor so this suite verifies FootballMatchupScreen's
// own wiring (which team gets the editor, and when) without re-testing the
// editor's own drag/swap behavior — that's covered by MatchupRosterEditor.spec.tsx.
jest.mock('../../../features/matchup/components/MatchupRosterEditor', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MatchupRosterEditor: ({
      userTeamId,
    }: {
      userTeamId: number;
      [key: string]: unknown;
    }) =>
      ReactActual.createElement(
        Text,
        { testID: 'matchup-roster-editor' },
        `editor-for-team-${userTeamId}`,
      ),
  };
});

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
  leagueId: 55,
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

// League position ids -> slot labels, mirroring the leaguePositions table
// (LS-6379). Matchup player fixtures reference these ids via `positionId`,
// the server-stored source of truth for slot assignment. This is a
// DST-format league's 7 starter slots — a real league never configures both
// DST and DL/LB/DB (LS-9475), so IDP/Superflex tests below supply their own
// leaguePositions fixture instead of reusing this one.
const mockLeaguePositions = [
  { id: 1301, positionType: 'QB' },
  { id: 1302, positionType: 'RB' },
  { id: 1303, positionType: 'WR' },
  { id: 1304, positionType: 'TE' },
  { id: 1305, positionType: 'FLEX' },
  { id: 1306, positionType: 'K' },
  { id: 1307, positionType: 'DST' },
];

const mockMatchupPlayer = {
  id: 201,
  playerId: 5,
  teamId: 10,
  positionId: 1301, // QB
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
  useMatchupScoresQuery: jest.fn(() => ({
    data: { matchupScores: [] },
    loading: false,
  })),
  useGetUserTeamIdQuery: jest.fn(() => ({
    data: undefined,
    loading: false,
  })),
  useGetPositionsForLeagueQuery: jest.fn(() => ({
    data: { leaguePositions: mockLeaguePositions },
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

// MatchupAdditionalSections is self-fetching (its own GraphQL hooks) and
// fully covered by its own spec — stub it here rather than re-testing its
// internals (playoff implications, key players, etc.) at this layer.
// The box score's own rendering (accordion, per-game stat lines) is covered by
// FootballScoringBreakdown.spec.tsx in shared-components. Here it is stubbed so
// this screen's specs can assert only what the screen owns: that the section is
// wired with the matchup's own two teams. `toFootballScoringBreakdownTeams` is
// the real implementation, since that mapping is the wiring under test (LS-6393).
interface MockBreakdownProps {
  teams: readonly {
    teamId: number;
    teamName: string;
    players: readonly {
      playerId: number;
      games: readonly { passing?: { yds?: number | null } | null }[];
    }[];
  }[];
  loading?: boolean;
}
const mockScoringBreakdown = jest.fn<void, [MockBreakdownProps]>();

jest.mock('@legacy-sports/shared-components/matchup', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<RNComponents>('react-native');
  const actualBreakdown = jest.requireActual<
    typeof import('../../../../../../lib/shared-components/src/features/matchup/FootballScoringBreakdown')
  >(
    '../../../../../../lib/shared-components/src/features/matchup/FootballScoringBreakdown',
  );
  return {
    MatchupAdditionalSections: () => null,
    MatchupRecapPanel: () =>
      ReactActual.createElement(View, { testID: 'recap-panel' }),
    toFootballScoringBreakdownTeams:
      actualBreakdown.toFootballScoringBreakdownTeams,
    FootballScoringBreakdown: (props: MockBreakdownProps) => {
      mockScoringBreakdown(props);
      return ReactActual.createElement(View, {
        testID: 'football-scoring-breakdown',
      });
    },
  };
});

// The scoreboard's own scoring/status/team-name/totalMatchups rendering is
// covered by MatchupScoreboardHero.spec.tsx and matchupTimeInfo.spec.ts —
// stub it here and assert only that this screen wires it with the right data.
interface MockScoreboardProps {
  matchup?: { id?: number } | null;
  leagueId?: number | null;
  showTimeInfo?: boolean;
  totalMatchups?: number | null;
  standings?: readonly { teamId?: number | string | null }[];
  isRefreshing?: boolean;
  team1ProjectedScore?: number;
  team2ProjectedScore?: number;
  isFootball?: boolean;
}
const mockMatchupScoreboard = jest.fn<React.JSX.Element, [MockScoreboardProps]>(
  () =>
    jest
      .requireActual<typeof import('react')>('react')
      .createElement(jest.requireActual<RNComponents>('react-native').View, {
        testID: 'scoreboard',
      }),
);
jest.mock('../../../features/matchup/components/MatchupScoreboard', () => ({
  MatchupScoreboard: (props: MockScoreboardProps) =>
    mockMatchupScoreboard(props),
}));

jest.mock('@legacy-sports/utils', () => {
  const actual = jest.requireActual<typeof import('@legacy-sports/utils')>(
    '@legacy-sports/utils',
  );
  return {
    ENTITLEMENTS: { ai_matchup_recap: 'ai_matchup_recap' },
    ALLOWED_POSITIONS_BY_SPORT: {
      football: {
        QB: ['QB'],
        RB: ['RB'],
        WR: ['WR'],
        TE: ['TE'],
        K: ['K'],
        DST: ['DST'],
        DL: ['DL'],
        LB: ['LB'],
        DB: ['DB'],
        FLEX: ['RB', 'WR', 'TE'],
        SFLEX: ['QB', 'RB', 'WR', 'TE'],
      },
    },
    deriveFootballSlotOrder: actual.deriveFootballSlotOrder,
  };
});

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
    H3: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <Text testID={testID}>{children}</Text>,
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
    // Reset to the default DST-format leaguePositions fixture — individual
    // tests below override this for IDP/Superflex scenarios, and clearAllMocks
    // above clears call history but not a prior mockReturnValue.
    jest.mocked(graphqlLib.useGetPositionsForLeagueQuery).mockReturnValue({
      data: { leaguePositions: mockLeaguePositions },
      loading: false,
    } as ReturnType<typeof graphqlLib.useGetPositionsForLeagueQuery>);
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

  it('renders the shared MatchupScoreboard wired with the matchup, leagueId, and showTimeInfo', () => {
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.getByTestId('scoreboard')).toBeTruthy();

    expect(mockMatchupScoreboard).toHaveBeenCalledTimes(1);
    const [props] = mockMatchupScoreboard.mock.calls[0];
    expect(props.leagueId).toBe(55);
    expect(props.showTimeInfo).toBe(true);
    expect(props.matchup?.id).toBe(1);
    // LS-10829: live scores come from matchupScores, not the baseball recompute.
    expect(props.isFootball).toBe(true);
  });

  it('wires totalMatchups through to the scoreboard when provided', () => {
    render(<FootballMatchupScreen matchupId={1} totalMatchups={14} />);
    const [props] = mockMatchupScoreboard.mock.calls[0];
    expect(props.totalMatchups).toBe(14);
  });

  it('wires totalMatchups through as absent when not provided', () => {
    render(<FootballMatchupScreen matchupId={1} />);
    const [props] = mockMatchupScoreboard.mock.calls[0];
    expect(props.totalMatchups).toBeUndefined();
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

  it('wires leagueId, standings, and isRefreshing through to the scoreboard', () => {
    const standings = [
      { teamId: 10, wins: 5, losses: 2, ties: 0 },
      { teamId: 20, wins: 3, losses: 4, ties: 1 },
    ];
    mockUseStandings.mockReturnValue({
      standings,
      loading: false,
      error: undefined,
      refetch: jest.fn(),
    });
    render(<FootballMatchupScreen matchupId={1} leagueId={99} />);
    const [props] = mockMatchupScoreboard.mock.calls[0];
    // The scoreboard's leagueId comes from the loaded matchup record itself
    // (mockMatchup.leagueId), not the route-param leagueId prop (which only
    // feeds useStandings) — the matchup is the authoritative source once loaded.
    expect(props.leagueId).toBe(55);
    expect(props.standings).toEqual(standings);
    expect(props.isRefreshing).toBe(false);
  });

  it('wires isRefreshing as true while a background score refetch is in flight', () => {
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: { getMatchupById: mockMatchup },
      loading: false,
      error: undefined,
      networkStatus: 4, // NetworkStatus.refetch
      refetch: mockRefetchMatchup,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);
    render(<FootballMatchupScreen matchupId={1} />);
    const [props] = mockMatchupScoreboard.mock.calls[0];
    expect(props.isRefreshing).toBe(true);
  });

  it('wires team1ProjectedScore/team2ProjectedScore from matchupScores when available (LS-6364)', () => {
    jest.mocked(graphqlLib.useMatchupScoresQuery).mockReturnValue({
      data: {
        matchupScores: [
          {
            __typename: 'FootballMatchupStats',
            teamId: 10,
            teamName: 'Team 10',
            totalPoints: 102.5,
            projectedPoints: 121.4,
            players: [],
          },
          {
            __typename: 'FootballMatchupStats',
            teamId: 20,
            teamName: 'Team 20',
            totalPoints: 87.3,
            projectedPoints: 95,
            players: [],
          },
        ],
      },
      loading: false,
    } as ReturnType<typeof graphqlLib.useMatchupScoresQuery>);

    render(<FootballMatchupScreen matchupId={1} leagueId={200} />);
    const [props] = mockMatchupScoreboard.mock.calls[0];

    expect(props.team1ProjectedScore).toBe(121.4);
    expect(props.team2ProjectedScore).toBe(95);
  });

  it('wires undefined projected scores when matchupScores has not resolved', () => {
    jest.mocked(graphqlLib.useMatchupScoresQuery).mockReturnValue({
      data: { matchupScores: [] },
      loading: false,
    } as ReturnType<typeof graphqlLib.useMatchupScoresQuery>);

    render(<FootballMatchupScreen matchupId={1} leagueId={200} />);
    const [props] = mockMatchupScoreboard.mock.calls[0];

    expect(props.team1ProjectedScore).toBeUndefined();
    expect(props.team2ProjectedScore).toBeUndefined();
  });

  it('renders player name for team 1', () => {
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
  });

  it('navigates to the football player detail route when a player row is pressed', () => {
    render(<FootballMatchupScreen matchupId={1} />);

    fireEvent.press(screen.getByText('Patrick Mahomes'));

    expect(mockRouterPush).toHaveBeenCalledWith('/football/players/5');
  });

  it('renders per-player actual and projected points from matchupScores (FMD-024)', () => {
    jest.mocked(graphqlLib.useMatchupScoresQuery).mockReturnValue({
      data: {
        matchupScores: [
          {
            __typename: 'FootballMatchupStats',
            teamId: 10,
            teamName: 'Team 10',
            totalPoints: 102.5,
            projectedPoints: 121.4,
            players: [
              {
                __typename: 'FootballMatchupPlayer',
                playerId: 5,
                playerName: 'Patrick Mahomes',
                position: 'QB',
                totalPoints: 24.6,
                projectedPoints: 22.1,
                games: [],
              },
            ],
          },
        ],
      },
      loading: false,
    } as ReturnType<typeof graphqlLib.useMatchupScoresQuery>);

    render(<FootballMatchupScreen matchupId={1} />);

    expect(screen.getByText('24.6')).toBeTruthy();
    expect(screen.getByText('22.1')).toBeTruthy();
  });

  it('renders em dashes for player points when matchupScores has no entry for the player', () => {
    jest.mocked(graphqlLib.useMatchupScoresQuery).mockReturnValue({
      data: { matchupScores: [] },
      loading: false,
    } as ReturnType<typeof graphqlLib.useMatchupScoresQuery>);

    render(<FootballMatchupScreen matchupId={1} />);

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('wires the box score with both matchup teams from matchupScores (FMD-029)', () => {
    jest.mocked(graphqlLib.useMatchupScoresQuery).mockReturnValue({
      data: {
        matchupScores: [
          {
            __typename: 'FootballMatchupStats',
            teamId: 20,
            teamName: 'Team 20',
            totalPoints: 87.3,
            projectedPoints: 95,
            players: [],
          },
          {
            __typename: 'FootballMatchupStats',
            teamId: 99,
            teamName: 'Another matchup entirely',
            totalPoints: 70,
            projectedPoints: 71,
            players: [],
          },
          {
            __typename: 'FootballMatchupStats',
            teamId: 10,
            teamName: 'Team 10',
            totalPoints: 102.5,
            projectedPoints: 121.4,
            players: [
              {
                __typename: 'FootballMatchupPlayer',
                playerId: 5,
                playerName: 'Patrick Mahomes',
                position: 'QB',
                totalPoints: 24.6,
                projectedPoints: 22.1,
                games: [
                  {
                    gameNum: 1,
                    opponent: 'DEN',
                    fantasyPoints: 24.6,
                    passing: { cmp: 24, att: 35, yds: 291, td: 3, int: 0 },
                  },
                ],
              },
            ],
          },
        ],
      },
      loading: false,
    } as ReturnType<typeof graphqlLib.useMatchupScoresQuery>);

    render(<FootballMatchupScreen matchupId={1} />);

    expect(screen.getByTestId('football-scoring-breakdown')).toBeTruthy();

    const props = mockScoringBreakdown.mock.calls.at(-1)?.[0];
    // team1 first, team2 second, and the unrelated matchup's team dropped.
    expect(props?.teams.map((team) => team.teamId)).toEqual([10, 20]);
    expect(props?.teams[0].players[0].games[0].passing?.yds).toBe(291);
    expect(props?.loading).toBe(false);
  });

  it('passes the box score through the loading state while scores are in flight (FMD-029)', () => {
    jest.mocked(graphqlLib.useMatchupScoresQuery).mockReturnValue({
      data: undefined,
      loading: true,
    } as ReturnType<typeof graphqlLib.useMatchupScoresQuery>);

    render(<FootballMatchupScreen matchupId={1} />);

    const props = mockScoringBreakdown.mock.calls.at(-1)?.[0];
    expect(props?.loading).toBe(true);
    expect(props?.teams).toEqual([]);
  });

  it('navigates to the team roster route when an empty starter slot is pressed (LS-6382)', () => {
    render(<FootballMatchupScreen matchupId={1} />);

    // team1 (id 10) has only QB filled — its first 'Empty' row is the next
    // starter slot (RB); team2 (id 20) has no players, so all its slots read
    // 'Empty' and follow team1's in DOM order.
    const emptySlots = screen.getAllByText('Empty');
    fireEvent.press(emptySlots[0]);
    expect(mockRouterPush).toHaveBeenCalledWith('/football/team/10');

    fireEvent.press(emptySlots[emptySlots.length - 1]);
    expect(mockRouterPush).toHaveBeenCalledWith('/football/team/20');
  });

  // ── Mobile lineup editor wiring (LS-6375) ──────────────────────────────────
  // Mobile previously had no lineup editor at all — owners had to use web to
  // bench a hurt starter pre-lock. FootballMatchupScreen now swaps in the
  // shared MatchupRosterEditor for the user's own team while the matchup is
  // still editable, mirroring the baseball mobile screen and web parity.

  it('renders the lineup editor for the user’s own team when the matchup is scheduled', () => {
    jest.mocked(graphqlLib.useGetUserTeamIdQuery).mockReturnValue({
      data: { userTeamId: 10 },
      loading: false,
    } as ReturnType<typeof graphqlLib.useGetUserTeamIdQuery>);
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: { getMatchupById: { ...mockMatchup, status: 'scheduled' } },
      loading: false,
      error: undefined,
      networkStatus: 7, // NetworkStatus.ready
      refetch: mockRefetchMatchup,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);

    render(<FootballMatchupScreen matchupId={1} leagueId={99} />);

    expect(screen.getByTestId('matchup-roster-editor')).toBeTruthy();
    expect(screen.getByText('editor-for-team-10')).toBeTruthy();
    // The opponent's roster stays read-only.
    expect(screen.queryByText('editor-for-team-20')).toBeNull();
  });

  it('renders the lineup editor while the matchup is in progress (pre-lock)', () => {
    jest.mocked(graphqlLib.useGetUserTeamIdQuery).mockReturnValue({
      data: { userTeamId: 10 },
      loading: false,
    } as ReturnType<typeof graphqlLib.useGetUserTeamIdQuery>);

    render(<FootballMatchupScreen matchupId={1} leagueId={99} />);

    expect(screen.getByTestId('matchup-roster-editor')).toBeTruthy();
  });

  it('does not render a lineup editor once the matchup is completed', () => {
    jest.mocked(graphqlLib.useGetUserTeamIdQuery).mockReturnValue({
      data: { userTeamId: 10 },
      loading: false,
    } as ReturnType<typeof graphqlLib.useGetUserTeamIdQuery>);
    jest.mocked(graphqlLib.useGetMatchupByIdQuery).mockReturnValue({
      data: { getMatchupById: COMPLETED_MATCHUP },
      loading: false,
      error: undefined,
      networkStatus: 7, // NetworkStatus.ready
      refetch: mockRefetchMatchup,
    } as ReturnType<typeof graphqlLib.useGetMatchupByIdQuery>);

    render(<FootballMatchupScreen matchupId={1} leagueId={99} />);

    expect(screen.queryByTestId('matchup-roster-editor')).toBeNull();
  });

  it('does not render a lineup editor for a spectator with no team in the matchup', () => {
    jest.mocked(graphqlLib.useGetUserTeamIdQuery).mockReturnValue({
      data: { userTeamId: 999 },
      loading: false,
    } as ReturnType<typeof graphqlLib.useGetUserTeamIdQuery>);

    render(<FootballMatchupScreen matchupId={1} leagueId={99} />);

    expect(screen.queryByTestId('matchup-roster-editor')).toBeNull();
  });

  it('honors the server-stored positionId over a client re-derivation from eligiblePositions (LS-6379)', () => {
    // Player intentionally moved to FLEX pre-lock via updateMatchupPlayerPosition
    // — eligiblePositions would still let a greedy allocator place them in RB.
    const flexAssignedPlayer = {
      id: 501,
      playerId: 501,
      teamId: 10,
      positionId: 1305, // FLEX
      player: {
        id: 501,
        firstName: 'Flex',
        lastName: 'Player',
        eligiblePositions: ['RB', 'WR'],
      },
    };
    const dedicatedRbPlayer = {
      id: 502,
      playerId: 502,
      teamId: 10,
      positionId: 1302, // RB
      player: {
        id: 502,
        firstName: 'Dedicated',
        lastName: 'Runningback',
        eligiblePositions: ['RB'],
      },
    };
    jest.mocked(graphqlLib.useGetMatchupPlayersQuery).mockReturnValue({
      data: { getMatchupPlayers: [flexAssignedPlayer, dedicatedRbPlayer] },
      loading: false,
      refetch: mockRefetchPlayers,
    } as ReturnType<typeof graphqlLib.useGetMatchupPlayersQuery>);

    render(<FootballMatchupScreen matchupId={1} />);

    expect(screen.getByText('Dedicated Runningback')).toBeTruthy();
    expect(screen.getByText('Flex Player')).toBeTruthy();
    expect(screen.queryByText('BN')).toBeNull();
  });

  it('benches a player whose positionId is null, even when eligiblePositions would place them in an empty slot (LS-6379)', () => {
    const benchedFlexEligiblePlayer = {
      id: 503,
      playerId: 503,
      teamId: 10,
      positionId: null,
      player: {
        id: 503,
        firstName: 'Benched',
        lastName: 'Flexer',
        eligiblePositions: ['RB', 'WR'],
      },
    };
    jest.mocked(graphqlLib.useGetMatchupPlayersQuery).mockReturnValue({
      data: { getMatchupPlayers: [benchedFlexEligiblePlayer] },
      loading: false,
      refetch: mockRefetchPlayers,
    } as ReturnType<typeof graphqlLib.useGetMatchupPlayersQuery>);

    render(<FootballMatchupScreen matchupId={1} />);

    expect(screen.getByText('Benched Flexer')).toBeTruthy();
    expect(screen.getByText('BN')).toBeTruthy();
  });

  it('renders DST position slot in DST format', () => {
    render(<FootballMatchupScreen matchupId={1} />);
    // Both team rosters render the slot label; at least one must be present
    expect(screen.getAllByText('D/ST').length).toBeGreaterThan(0);
  });

  it('renders DL position slot for an IDP-configured league', () => {
    jest.mocked(graphqlLib.useGetPositionsForLeagueQuery).mockReturnValue({
      data: {
        leaguePositions: [
          { id: 1301, positionType: 'QB' },
          { id: 1302, positionType: 'RB' },
          { id: 1303, positionType: 'WR' },
          { id: 1304, positionType: 'TE' },
          { id: 1305, positionType: 'FLEX' },
          { id: 1306, positionType: 'K' },
          { id: 1308, positionType: 'DL' },
          { id: 1309, positionType: 'LB' },
          { id: 1310, positionType: 'DB' },
        ],
      },
      loading: false,
    } as ReturnType<typeof graphqlLib.useGetPositionsForLeagueQuery>);

    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.getAllByText('DL').length).toBeGreaterThan(0);
    // A DST-format slot has no rows for this IDP league, so it must not render.
    expect(screen.queryByText('D/ST')).toBeNull();
  });

  // LS-9734: Superflex (SFLEX) leagues configure a second, premium
  // QB-eligible slot on top of the normal QB slot. Previously this slot type
  // was entirely absent from the mobile screen's hardcoded position-order
  // arrays, so a Superflex league's QB2 had nowhere to render and was
  // silently benched even though it's a legitimately eligible starting slot.
  it('renders a SFLEX (QB2) slot for a Superflex-configured league (LS-9734)', () => {
    jest.mocked(graphqlLib.useGetPositionsForLeagueQuery).mockReturnValue({
      data: {
        leaguePositions: [
          { id: 1301, positionType: 'QB' },
          { id: 1320, positionType: 'SFLEX' },
          { id: 1302, positionType: 'RB' },
          { id: 1303, positionType: 'WR' },
          { id: 1304, positionType: 'TE' },
          { id: 1305, positionType: 'FLEX' },
          { id: 1306, positionType: 'K' },
          { id: 1307, positionType: 'DST' },
        ],
      },
      loading: false,
    } as ReturnType<typeof graphqlLib.useGetPositionsForLeagueQuery>);
    const qb2Player = {
      id: 601,
      playerId: 601,
      teamId: 10,
      positionId: 1320, // SFLEX
      player: {
        id: 601,
        firstName: 'Justin',
        lastName: 'Fields',
        eligiblePositions: ['QB'],
      },
    };
    jest.mocked(graphqlLib.useGetMatchupPlayersQuery).mockReturnValue({
      data: { getMatchupPlayers: [mockMatchupPlayer, qb2Player] },
      loading: false,
      refetch: mockRefetchPlayers,
    } as ReturnType<typeof graphqlLib.useGetMatchupPlayersQuery>);

    render(<FootballMatchupScreen matchupId={1} />);

    expect(screen.getAllByText('SFLEX').length).toBeGreaterThan(0);
    // The QB2 player rendered into the SFLEX slot, not benched.
    expect(screen.getByText('Justin Fields')).toBeTruthy();
    expect(screen.queryByText('BN')).toBeNull();
  });

  it('shows the bench count and capacity when maxRosterSize is available (LS-6383)', () => {
    jest.mocked(graphqlLib.useGetMatchupPlayersQuery).mockReturnValue({
      data: {
        getMatchupPlayers: [
          mockMatchupPlayer,
          {
            id: 202,
            playerId: 6,
            teamId: 10,
            player: {
              id: 6,
              firstName: 'Bench',
              lastName: 'Guy',
              eligiblePositions: ['QB'],
            },
          },
        ],
      },
      loading: false,
      refetch: mockRefetchPlayers,
    } as ReturnType<typeof graphqlLib.useGetMatchupPlayersQuery>);

    // dst format has 7 starter slots; maxRosterSize 8 leaves a bench cap of
    // 1. Mahomes fills the QB starter slot, leaving 'Bench Guy' as the one
    // bench player.
    render(<FootballMatchupScreen matchupId={1} maxRosterSize={8} />);

    expect(screen.getByText('BENCH (1/1)')).toBeTruthy();
  });

  it('falls back to a plain "BENCH" label when maxRosterSize is not provided', () => {
    jest.mocked(graphqlLib.useGetMatchupPlayersQuery).mockReturnValue({
      data: {
        getMatchupPlayers: [
          mockMatchupPlayer,
          {
            id: 202,
            playerId: 6,
            teamId: 10,
            player: {
              id: 6,
              firstName: 'Bench',
              lastName: 'Guy',
              eligiblePositions: ['QB'],
            },
          },
        ],
      },
      loading: false,
      refetch: mockRefetchPlayers,
    } as ReturnType<typeof graphqlLib.useGetMatchupPlayersQuery>);

    render(<FootballMatchupScreen matchupId={1} />);

    expect(screen.getAllByText('BENCH').length).toBeGreaterThan(0);
    expect(screen.queryByText(/BENCH \(/)).toBeNull();
  });

  it('falls back to a plain "BENCH" label when maxRosterSize does not exceed the starter slot count', () => {
    jest.mocked(graphqlLib.useGetMatchupPlayersQuery).mockReturnValue({
      data: {
        getMatchupPlayers: [
          mockMatchupPlayer,
          {
            id: 202,
            playerId: 6,
            teamId: 10,
            player: {
              id: 6,
              firstName: 'Bench',
              lastName: 'Guy',
              eligiblePositions: ['QB'],
            },
          },
        ],
      },
      loading: false,
      refetch: mockRefetchPlayers,
    } as ReturnType<typeof graphqlLib.useGetMatchupPlayersQuery>);

    // dst format has 7 starter slots; maxRosterSize 7 leaves no bench cap.
    render(<FootballMatchupScreen matchupId={1} maxRosterSize={7} />);

    expect(screen.getAllByText('BENCH').length).toBeGreaterThan(0);
    expect(screen.queryByText(/BENCH \(/)).toBeNull();
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
