import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import * as graphqlLib from '@legacy-sports/graphql';
import { FootballMatchupScreen } from './FootballMatchupScreen';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

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
  status: 'final',
  weekNumber: 7,
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
  MatchupStatus: { InProgress: 'in_progress', Final: 'final' },
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
}));

jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
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
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
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

  it('renders week number', () => {
    render(<FootballMatchupScreen matchupId={1} />);
    expect(screen.getByText('Wk 7')).toBeTruthy();
  });

  it('renders player name for team 1', () => {
    render(<FootballMatchupScreen matchupId={1} defensiveFormat="dst" />);
    expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
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
});
