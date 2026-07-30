import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import PlayersTab from './players';

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// `PlayersCardFeed` renders the full card-feed UI and is already covered by
// its own suite in lib/shared-components (PlayersCardFeed.spec.tsx) — this
// screen's spec only needs to verify that `players.tsx` wires the right data
// and callbacks into it (routing, sport-switch reset, pagination/cursor
// handling), so `PlayersCardFeed` is mocked as a plain-RN prop-capturing stub
// rather than re-testing its rendering here (mirrors how this codebase's
// other screen specs mock whole child screens — see
// `../football/players.spec.tsx`'s `PlayerStatsScreen` mock).
//
// `@legacy-sports/shared-components` and `@legacy-sports/graphql` are never
// `requireActual`'d: importing either barrel for real pulls in Apollo/GraphQL
// client setup that touches `expo`'s fetch polyfill at module-evaluation time
// and crashes under Jest (`Cannot read properties of undefined (reading
// 'EventEmitter')` in `expo/src/winter/fetch`) — this is why every export
// below is a hand-written stub, not a `jest.requireActual` passthrough.

const mockUseFeatureIsOn = jest.fn(() => false);
jest.mock('@growthbook/growthbook-react', () => ({
  useFeatureIsOn: (...args: unknown[]) => mockUseFeatureIsOn(...args),
}));

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockSetParams = jest.fn();
let mockSearchParams: Record<string, string | string[]> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (...args: unknown[]): void => {
      mockPush(...args);
    },
    navigate: (...args: unknown[]): void => {
      mockNavigate(...args);
    },
    setParams: (...args: unknown[]): void => {
      mockSetParams(...args);
    },
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

const mockUseSubscription = jest.fn(() => ({ isPremium: false }));
jest.mock('../../../features/subscription/useSubscription', () => ({
  useSubscription: (...args: unknown[]) => mockUseSubscription(...args),
}));

interface MockFootballQueryReturn {
  data?: {
    footballPlayers?: {
      nodes: Array<Record<string, unknown>>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  loading: boolean;
  error: unknown;
  refetch: () => void;
}

const mockUseFootballPlayersQuery = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  useFootballPlayersQuery: (...args: unknown[]) =>
    mockUseFootballPlayersQuery(...args) as MockFootballQueryReturn,
}));

interface MockCareerStatsReturn {
  data: Array<Record<string, unknown>>;
  loading: boolean;
  error: unknown;
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  currentPage: number;
  pageSize: number;
  endCursor: string | null;
  refetch: () => void;
}

interface MockPlayersCardFeedProps {
  sport: string;
  resultCount: number;
  rows: Array<{ id: string }>;
  position: string;
  searchValue: string;
  showSportToggle: boolean;
  isPremium: boolean;
  onSportChange: (sport: string) => void;
  onPlayerPress: (id: string) => void;
  onToggleSort: () => void;
  onEndReached: () => void;
  onOverflowPress?: () => void;
  onPremiumPress: () => void;
  onRetry?: () => void;
  onClearFilters: () => void;
}

const mockUseCareerStatsWithNames = jest.fn();
const mockPlayersCardFeed = jest.fn<void, [MockPlayersCardFeedProps]>();

jest.mock('@legacy-sports/shared-components', () => {
  // Real ES `import` cannot appear inside a jest.mock() factory (babel-plugin-
  // jest-hoist statically forbids referencing out-of-scope bindings other than
  // `mock`-prefixed ones) — `require` is the only option here, matching the
  // existing convention in ../football/players.spec.tsx.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- ES import cannot appear inside a jest.mock() factory
  const ReactActual = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- ES import cannot appear inside a jest.mock() factory
  const ReactNative = require('react-native') as typeof import('react-native');
  const { Pressable, Text, View } = ReactNative;

  const BASEBALL_POSITIONS = [
    'ALL',
    'C',
    '1B',
    '2B',
    '3B',
    'SS',
    'OF',
    'DH',
    'SP',
    'RP',
  ];
  const FOOTBALL_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'];

  return {
    cardPositionsForSport: (sport: string) =>
      sport === 'baseball' ? BASEBALL_POSITIONS : FOOTBALL_POSITIONS,
    positionFilterParam: (position: string) =>
      position === 'ALL' ? undefined : position,
    formatBaseballCardSubStats: ({
      homeRuns,
      rbi,
      battingAverage,
    }: {
      homeRuns: number;
      rbi: number;
      battingAverage: number;
    }) => `HR ${homeRuns} · RBI ${rbi} · AVG ${battingAverage}`,
    formatFootballCardSubStats: (player: { nflTeam?: string | null }) =>
      player.nflTeam ?? '',
    // No debounce in tests — resolve immediately so assertions don't need
    // fake timers (LS-8832's debounce behavior has its own unit coverage in
    // shared-components' useDebouncedValue.spec.ts).
    useDebouncedValue: (value: unknown) => value,
    useCareerStatsWithNames: (...args: unknown[]) =>
      mockUseCareerStatsWithNames(...args) as MockCareerStatsReturn,
    PlayersCardFeed: (props: MockPlayersCardFeedProps) => {
      mockPlayersCardFeed(props);
      const rows = props.rows ?? [];
      const toggleSport = () =>
        props.onSportChange(
          props.sport === 'baseball' ? 'football' : 'baseball',
        );
      const pressFirstPlayer = () => {
        if (rows[0]) props.onPlayerPress(rows[0].id);
      };
      return ReactActual.createElement(
        View,
        { testID: 'players-card-feed' },
        ReactActual.createElement(Text, null, `sport:${props.sport}`),
        ReactActual.createElement(
          Text,
          null,
          `resultCount:${String(props.resultCount)}`,
        ),
        ReactActual.createElement(Pressable, {
          testID: 'mock-sport-toggle',
          onPress: toggleSport,
        }),
        ReactActual.createElement(Pressable, {
          testID: 'mock-player-press',
          onPress: pressFirstPlayer,
        }),
        ReactActual.createElement(Pressable, {
          testID: 'mock-toggle-sort',
          onPress: props.onToggleSort,
        }),
        ReactActual.createElement(Pressable, {
          testID: 'mock-end-reached',
          onPress: props.onEndReached,
        }),
        ReactActual.createElement(Pressable, {
          testID: 'mock-overflow',
          onPress: props.onOverflowPress,
        }),
        ReactActual.createElement(Pressable, {
          testID: 'mock-premium',
          onPress: props.onPremiumPress,
        }),
        ReactActual.createElement(Pressable, {
          testID: 'mock-retry',
          onPress: props.onRetry,
        }),
        ReactActual.createElement(Pressable, {
          testID: 'mock-clear',
          onPress: props.onClearFilters,
        }),
      );
    },
  };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASEBALL_PLAYER = {
  id: 'player-1486',
  playerId: 1486,
  displayName: 'Babe Ruth',
  primaryPosition: 'OF',
  homeRuns: 714,
  rbi: 2214,
  battingAverage: 0.342,
  fantasyPoints: 13716,
};

function mockCareerStats(overrides: Partial<Record<string, unknown>> = {}) {
  mockUseCareerStatsWithNames.mockReturnValue({
    data: [BASEBALL_PLAYER],
    loading: false,
    error: null,
    totalCount: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    currentPage: 1,
    pageSize: 25,
    endCursor: null,
    refetch: jest.fn(),
    ...overrides,
  });
}

const FOOTBALL_PLAYER = {
  id: 1,
  firstName: 'Josh',
  lastName: 'Allen',
  position: 'QB',
  isDst: false,
  nflTeam: 'BUF',
  careerStats: { fantasyPoints: 418.6 },
};

function mockFootballPlayers(overrides: Partial<Record<string, unknown>> = {}) {
  mockUseFootballPlayersQuery.mockReturnValue({
    data: {
      footballPlayers: {
        nodes: [FOOTBALL_PLAYER],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
    loading: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PlayersTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFeatureIsOn.mockReturnValue(false);
    mockUseSubscription.mockReturnValue({ isPremium: false });
    mockSearchParams = {};
    mockCareerStats();
    mockFootballPlayers();
  });

  it('renders the baseball card feed by default', () => {
    render(<PlayersTab />);
    expect(screen.getByTestId('players-card-feed')).toBeTruthy();
    expect(screen.getByText('sport:baseball')).toBeTruthy();
  });

  it('wires the baseball data hook with orderBy totalScore and the ALL-cleared position', () => {
    render(<PlayersTab />);
    expect(mockUseCareerStatsWithNames).toHaveBeenCalledWith(
      expect.objectContaining({
        first: 25,
        orderBy: 'totalScore',
        orderDirection: 'desc',
        position: undefined,
        searchTerm: undefined,
      }),
    );
  });

  it('passes the server totalCount as resultCount for baseball', () => {
    mockCareerStats({ totalCount: 42 });
    render(<PlayersTab />);
    expect(screen.getByText('resultCount:42')).toBeTruthy();
  });

  it('never shows the sport toggle when football is disabled, even after a forced sport state', () => {
    mockUseFeatureIsOn.mockReturnValue(false);
    render(<PlayersTab />);
    expect(mockPlayersCardFeed).toHaveBeenCalledWith(
      expect.objectContaining({ showSportToggle: false, sport: 'baseball' }),
    );
  });

  it('switches to the football card feed when football is enabled and the toggle fires', () => {
    mockUseFeatureIsOn.mockReturnValue(true);
    render(<PlayersTab />);

    fireEvent.press(screen.getByTestId('mock-sport-toggle'));

    expect(screen.getByText('sport:football')).toBeTruthy();
    expect(mockUseFootballPlayersQuery).toHaveBeenCalled();
  });

  it('resets position and search when switching sport', () => {
    mockUseFeatureIsOn.mockReturnValue(true);
    render(<PlayersTab />);

    fireEvent.press(screen.getByTestId('mock-clear'));
    fireEvent.press(screen.getByTestId('mock-sport-toggle'));

    const calls = mockPlayersCardFeed.mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.position).toBe('ALL');
    expect(lastCall.searchValue).toBe('');
  });

  it('navigates to /PlayerDetail on a baseball card press with a validated id', () => {
    render(<PlayersTab />);

    fireEvent.press(screen.getByTestId('mock-player-press'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/PlayerDetail',
      params: { playerId: '1486', playerName: 'Babe Ruth' },
    });
  });

  it('navigates to the football detail route on a football card press', () => {
    mockUseFeatureIsOn.mockReturnValue(true);
    render(<PlayersTab />);
    fireEvent.press(screen.getByTestId('mock-sport-toggle'));

    fireEvent.press(screen.getByTestId('mock-player-press'));

    expect(mockPush).toHaveBeenCalledWith('/football/players/1');
  });

  it('toggles sort direction and re-queries baseball stats with the new direction', () => {
    render(<PlayersTab />);

    fireEvent.press(screen.getByTestId('mock-toggle-sort'));

    expect(mockUseCareerStatsWithNames).toHaveBeenCalledWith(
      expect.objectContaining({ orderDirection: 'asc' }),
    );
  });

  it('advances the cursor on end-reached when the server reports a next page', () => {
    mockCareerStats({ hasNextPage: true, endCursor: 'cursor-25' });
    render(<PlayersTab />);

    fireEvent.press(screen.getByTestId('mock-end-reached'));

    expect(mockUseCareerStatsWithNames).toHaveBeenLastCalledWith(
      expect.objectContaining({ after: 'cursor-25' }),
    );
  });

  it('navigates to PlayerComparison on the overflow action', () => {
    render(<PlayersTab />);
    fireEvent.press(screen.getByTestId('mock-overflow'));
    expect(mockPush).toHaveBeenCalledWith('/PlayerComparison');
  });

  it('navigates to subscription settings on the premium teaser action', () => {
    render(<PlayersTab />);
    fireEvent.press(screen.getByTestId('mock-premium'));
    expect(mockNavigate).toHaveBeenCalledWith('/subscription-settings');
  });

  it('forwards isPremium from useSubscription', () => {
    mockUseSubscription.mockReturnValue({ isPremium: true });
    render(<PlayersTab />);
    expect(mockPlayersCardFeed).toHaveBeenCalledWith(
      expect.objectContaining({ isPremium: true }),
    );
  });

  it('hydrates initial position/search/sort from expo-router search params', () => {
    mockSearchParams = { position: 'SS', searchTerm: 'ruth', sortDir: 'asc' };
    render(<PlayersTab />);

    expect(mockPlayersCardFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        position: 'SS',
        searchValue: 'ruth',
        sortDirection: 'asc',
      }),
    );
  });
});
