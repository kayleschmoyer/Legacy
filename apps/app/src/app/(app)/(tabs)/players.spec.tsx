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

// Mirrors home.spec.tsx's mock (LS-8625/LS-8834) — a real SafeAreaProvider
// isn't mounted in this unit-test tree, so the hook needs a fixed value.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
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

// Defaults to the narrow/`sm` breakpoint so all of this file's existing
// card-feed assertions keep passing unchanged — the wide-viewport (table)
// tests below override this per-case (LS-9079). This is the opposite
// default from the shared-components jest-setup-web.js base tier (which
// resolves to the wide/table branch) because that convention exists to keep
// *that* project's existing "table by default" specs passing; here the
// established default across this file's existing specs is cards.
const mockUseMedia = jest.fn(() => ({ sm: true }));
jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  return {
    ...mocks.tamaguiMocks,
    useMedia: () => mockUseMedia(),
  };
});

// `PlayerStatsScreen` (the wide-viewport baseball table) is a full screen
// with its own dedicated, thoroughly-mocked spec (`../PlayerStats.spec.tsx`)
// — this file only needs to verify players.tsx renders it at wide viewport,
// mirroring `../football/players.spec.tsx`'s identical stub for the same
// module.
jest.mock('../PlayerStats', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- ES import cannot appear inside a jest.mock() factory
  const ReactActual = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- ES import cannot appear inside a jest.mock() factory
  const { View } = require('react-native') as typeof import('react-native');
  return {
    __esModule: true,
    default: () =>
      ReactActual.createElement(View, { testID: 'player-stats-screen' }),
  };
});

jest.mock('../../../components/SportSwitcherPill', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- ES import cannot appear inside a jest.mock() factory
  const ReactActual = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- ES import cannot appear inside a jest.mock() factory
  const ReactNative = require('react-native') as typeof import('react-native');
  const { Pressable, Text } = ReactNative;
  return {
    SportSwitcherPill: ({
      label,
      active,
      onPress,
      testID,
    }: {
      label: string;
      active: boolean;
      onPress: () => void;
      testID?: string;
    }) =>
      ReactActual.createElement(
        Pressable,
        { testID, onPress },
        ReactActual.createElement(Text, null, `${label}:${String(active)}`),
      ),
  };
});

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
  topInset: number;
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

interface MockFootballStatsPageProps {
  isPremium: boolean;
  onPlayerDetails?: (playerId: number) => void;
}

const mockUseCareerStatsWithNames = jest.fn();
const mockPlayersCardFeed = jest.fn<void, [MockPlayersCardFeedProps]>();
const mockFootballStatsPage = jest.fn<void, [MockFootballStatsPageProps]>();

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
    // Hand-written stubs mirroring cardFeed/useCursorPagination.ts's real
    // reset-on-key-change / accumulate-on-cursor-change semantics (LS-9073
    // extracted these out of this screen so the web card presentation could
    // share them too). A `require` of the real module by relative path was
    // tried instead (avoiding duplication) but reaches across this app
    // project's boundary into shared-components' internals, which trips
    // @nx/enforce-module-boundaries' lazy-vs-static-import consistency check
    // for every other static `@legacy-sports/shared-components` import in
    // this project — a worse problem than the duplication it was meant to
    // avoid. Kept faithful to the real implementation rather than a
    // passthrough per this file's no-`requireActual` convention above,
    // since this screen's own pagination-handling tests depend on it
    // behaving exactly like the real hooks.
    useResettableCursor: (queryKey: string) => {
      const [cursor, setCursor] = ReactActual.useState<string | undefined>(
        undefined,
      );
      const prevKeyRef = ReactActual.useRef(queryKey);
      const isResetRef = ReactActual.useRef(true);

      ReactActual.useEffect(() => {
        if (prevKeyRef.current !== queryKey) {
          prevKeyRef.current = queryKey;
          isResetRef.current = true;
          setCursor(undefined);
        }
      }, [queryKey]);

      return { cursor, setCursor, isResetRef };
    },
    useAccumulatedPages: <T,>(
      data: readonly T[],
      loading: boolean,
      cursor: string | undefined,
      isResetRef: { current: boolean },
    ): readonly T[] => {
      const [accumulated, setAccumulated] = ReactActual.useState<readonly T[]>(
        [],
      );
      const prevCursorRef = ReactActual.useRef<string | undefined>(undefined);

      ReactActual.useEffect(() => {
        if (loading) return;
        if (isResetRef.current) {
          setAccumulated(data);
          isResetRef.current = false;
        } else if (prevCursorRef.current !== cursor) {
          setAccumulated((prev) => [...prev, ...data]);
        }
        prevCursorRef.current = cursor;
      }, [data, loading, cursor, isResetRef]);

      return accumulated;
    },
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
    FootballStatsPage: (props: MockFootballStatsPageProps) => {
      mockFootballStatsPage(props);
      return ReactActual.createElement(
        View,
        { testID: 'football-stats-page' },
        ReactActual.createElement(Pressable, {
          testID: 'football-stats-player-press',
          onPress: () => props.onPlayerDetails?.(1),
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
    mockUseMedia.mockReturnValue({ sm: true });
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

  function lastFootballQueryVariables(): { sortBy: string; sortDir: string } {
    const calls = mockUseFootballPlayersQuery.mock.calls as Array<
      [{ variables: { sortBy: string; sortDir: string } }]
    >;
    return calls[calls.length - 1][0].variables;
  }

  it('queries football players sorted server-side by fpts, and re-queries on sort toggle (LS-9071)', () => {
    mockUseFeatureIsOn.mockReturnValue(true);
    render(<PlayersTab />);
    fireEvent.press(screen.getByTestId('mock-sport-toggle'));

    expect(lastFootballQueryVariables()).toMatchObject({
      sortBy: 'fpts',
      sortDir: 'desc',
    });

    fireEvent.press(screen.getByTestId('mock-toggle-sort'));

    expect(lastFootballQueryVariables()).toMatchObject({
      sortBy: 'fpts',
      sortDir: 'asc',
    });
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

  it('forwards the safe-area top inset to the card feed (LS-8834)', () => {
    render(<PlayersTab />);
    expect(mockPlayersCardFeed).toHaveBeenCalledWith(
      expect.objectContaining({ topInset: 44 }),
    );
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

  // ── Wide viewport (tablet) — LS-9079 ──────────────────────────────────────

  describe('wide viewport (tablet)', () => {
    beforeEach(() => {
      mockUseMedia.mockReturnValue({});
    });

    it('renders the baseball stats table instead of the card feed', () => {
      render(<PlayersTab />);
      expect(screen.getByTestId('player-stats-screen')).toBeTruthy();
      expect(screen.queryByTestId('players-card-feed')).toBeNull();
    });

    it('renders the football stats table when football is active', () => {
      mockUseFeatureIsOn.mockReturnValue(true);
      render(<PlayersTab />);

      fireEvent.press(screen.getByTestId('players-tab-sport-switch-football'));

      expect(screen.getByTestId('football-stats-page')).toBeTruthy();
      expect(screen.queryByTestId('player-stats-screen')).toBeNull();
      expect(mockFootballStatsPage).toHaveBeenCalledWith(
        expect.objectContaining({ isPremium: false }),
      );
    });

    it('navigates to the football detail route on a stats-table row press', () => {
      mockUseFeatureIsOn.mockReturnValue(true);
      render(<PlayersTab />);
      fireEvent.press(screen.getByTestId('players-tab-sport-switch-football'));

      fireEvent.press(screen.getByTestId('football-stats-player-press'));

      expect(mockPush).toHaveBeenCalledWith('/football/players/1');
    });

    it('hides the sport switcher when football is disabled', () => {
      mockUseFeatureIsOn.mockReturnValue(false);
      render(<PlayersTab />);
      expect(
        screen.queryByTestId('players-tab-sport-switch-baseball'),
      ).toBeNull();
    });

    it('shows the sport switcher when football is enabled', () => {
      mockUseFeatureIsOn.mockReturnValue(true);
      render(<PlayersTab />);
      expect(
        screen.getByTestId('players-tab-sport-switch-baseball'),
      ).toBeTruthy();
    });

    it('forwards isPremium from useSubscription to the football stats table', () => {
      mockUseFeatureIsOn.mockReturnValue(true);
      mockUseSubscription.mockReturnValue({ isPremium: true });
      render(<PlayersTab />);

      fireEvent.press(screen.getByTestId('players-tab-sport-switch-football'));

      expect(mockFootballStatsPage).toHaveBeenCalledWith(
        expect.objectContaining({ isPremium: true }),
      );
    });
  });
});
