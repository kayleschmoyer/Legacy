import React from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import PlayersRoute, { FootballPlayers, parseAdvancedSearch } from './players';
import { useHasEntitlement } from '../../../features/subscription/useSubscription';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseFeatureIsOn = jest.fn(() => false);
jest.mock('@growthbook/growthbook-react', () => ({
  useFeatureIsOn: (...args: unknown[]) => mockUseFeatureIsOn(...args),
}));

jest.mock('../PlayerStats', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: () =>
      ReactActual.createElement(View, { testID: 'player-stats-screen' }),
  };
});

// expo-apple-authentication uses ESM export syntax; stub it out so Jest's
// CommonJS runner never tries to parse it (regardless of transformIgnorePatterns
// cache state). The real auth chain is broken anyway by the useSubscription mock.
const mockAsyncStorageGetItem = jest.fn<Promise<string | null>, [string]>();
const mockAsyncStorageSetItem = jest.fn<Promise<void>, [string, string]>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: [string]) => mockAsyncStorageGetItem(...args),
    setItem: (...args: [string, string]) => mockAsyncStorageSetItem(...args),
  },
}));

// FlatList uses VirtualizedList internally, which schedules a recurring
// setTimeout(fn, 0) that causes `await act(async fn)` to loop infinitely
// when fake timers are installed. Replace it with a simple synchronous
// renderer so async tests can complete without the timer runaway.
//
// We use a Proxy rather than spreading {...RN} because react-native/index.js
// exposes FlatList through a lazy getter; spreading triggers that getter,
// which loads VirtualizedList → DevMenu → TurboModuleRegistry.getEnforcing,
// throwing an invariant in the Jest environment. The Proxy intercepts only
// the 'FlatList' property so the getter is never fired.
jest.mock('react-native', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const actual =
    jest.requireActual<typeof import('react-native')>('react-native');

  const MockFlatList = ({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    ListFooterComponent,
  }: {
    data?: readonly unknown[] | null;
    renderItem: (info: {
      item: unknown;
      index: number;
    }) => import('react').ReactNode;
    keyExtractor?: (item: unknown, index: number) => string;
    ListEmptyComponent?: import('react').ReactNode;
    ListFooterComponent?: import('react').ReactNode;
    [key: string]: unknown;
  }): import('react').ReactElement => {
    const items = data ?? [];
    return createElement(
      actual.View,
      null,
      items.length === 0
        ? (ListEmptyComponent ?? null)
        : items.map((item, index) =>
            createElement(
              actual.View,
              {
                key: keyExtractor ? keyExtractor(item, index) : String(index),
              },
              renderItem({ item, index }),
            ),
          ),
      ListFooterComponent ?? null,
    );
  };

  return new Proxy(actual, {
    get(target, prop) {
      if (prop === 'FlatList') return MockFlatList;
      return Reflect.get(target, prop) as unknown;
    },
  });
});

jest.mock('expo-apple-authentication', () => ({
  __esModule: true,
  AppleAuthenticationScope: { EMAIL: 'email', FULL_NAME: 'fullName' },
  AppleAuthenticationOperation: {
    LOGIN: 'login',
    REFRESH: 'refresh',
    LOGOUT: 'logout',
    IMPLICIT: 'implicit',
  },
  signInAsync: jest.fn(),
  isAvailableAsync: jest.fn().mockResolvedValue(false),
}));

jest.mock('@legacy-sports/shared-components', () => ({
  BRAND_GOLD: '#D4AF37',
  NFL_TEAMS: {
    KC: {
      abbreviation: 'KC',
      fullName: 'Kansas City Chiefs',
      city: 'Kansas City',
      conference: 'AFC',
      division: 'West',
      primaryColor: '#E31837',
      secondaryColor: '#FFB81C',
    },
    DAL: {
      abbreviation: 'DAL',
      fullName: 'Dallas Cowboys',
      city: 'Dallas',
      conference: 'NFC',
      division: 'East',
      primaryColor: '#003594',
      secondaryColor: '#869397',
    },
  },
  TEAM_FILTER_OPTIONS_BY_SPORT: {
    football: [
      { value: 'All', label: 'All Teams' },
      { value: 'AFC', label: 'AFC' },
      { value: 'NFC', label: 'NFC' },
      { value: 'KC', label: 'KC — Kansas City Chiefs' },
      { value: 'DAL', label: 'DAL — Dallas Cowboys' },
    ],
    baseball: [{ value: 'All', label: 'All Teams' }],
  },
}));

jest.mock('@legacy-sports/utils', () => ({
  ENTITLEMENTS: {
    football_projections: 'football_projections',
    advanced_search_filters: 'advanced_search_filters',
    superflex: 'superflex',
    idp: 'idp',
  },
  tierHasEntitlement: jest.fn().mockReturnValue(false),
  ClientNotificationType: {},
}));

jest.mock('../../../features/subscription/useSubscription', () => ({
  useHasEntitlement: jest.fn().mockReturnValue(false),
  useSubscription: jest.fn().mockReturnValue({ isPremium: false }),
}));

jest.mock('@legacy-sports/shared-components/football', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return {
    StatCategory: ({
      label,
      children,
    }: {
      label: string;
      children: import('react').ReactNode;
    }) => {
      const { View, Text } =
        jest.requireActual<typeof import('react-native')>('react-native');
      return createElement(
        View,
        null,
        createElement(Text, null, label),
        children,
      );
    },
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  ChevronDown: 'ChevronDown',
  Star: 'Star',
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('tamagui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  // Closure variable shared between Select (which sets it) and Select.Item (which reads it).
  // Must be prefixed with 'mock' so jest-hoist permits this closure variable.
  let mockSelectOnChange: ((val: string) => void) | null = null;
  return {
    ...mocks.tamaguiMocks,
    XStack: ({
      children,
      onPress,
      testID,
    }: {
      children: import('react').ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => {
      const { View } =
        jest.requireActual<typeof import('react-native')>('react-native');
      return createElement(View, { onPress, testID }, children);
    },
    YStack: ({
      children,
      onPress,
      onLongPress,
      testID,
    }: {
      children: import('react').ReactNode;
      onPress?: () => void;
      onLongPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => {
      const { View } =
        jest.requireActual<typeof import('react-native')>('react-native');
      return createElement(View, { onPress, onLongPress, testID }, children);
    },
    Select: Object.assign(
      ({
        children,
        value: _value,
        onValueChange,
      }: {
        children: import('react').ReactNode;
        value?: string;
        onValueChange?: (val: string) => void;
        disablePreventBodyScroll?: boolean;
      }) => {
        mockSelectOnChange = onValueChange ?? null;
        const { View } =
          jest.requireActual<typeof import('react-native')>('react-native');
        return createElement(View, { testID: 'select' }, children);
      },
      {
        Trigger: ({ children }: { children: import('react').ReactNode }) => {
          const { View } =
            jest.requireActual<typeof import('react-native')>('react-native');
          return createElement(View, { testID: 'select-trigger' }, children);
        },
        Value: ({
          children,
          placeholder,
        }: {
          children?: import('react').ReactNode;
          placeholder?: string;
        }) => {
          const { Text } =
            jest.requireActual<typeof import('react-native')>('react-native');
          return createElement(Text, null, children ?? placeholder);
        },
        Content: ({ children }: { children: import('react').ReactNode }) => {
          const { View } =
            jest.requireActual<typeof import('react-native')>('react-native');
          return createElement(View, null, children);
        },
        ScrollUpButton: () => null,
        ScrollDownButton: () => null,
        Viewport: ({ children }: { children: import('react').ReactNode }) => {
          const { View } =
            jest.requireActual<typeof import('react-native')>('react-native');
          return createElement(View, null, children);
        },
        Group: ({ children }: { children: import('react').ReactNode }) => {
          const { View } =
            jest.requireActual<typeof import('react-native')>('react-native');
          return createElement(View, null, children);
        },
        Item: ({
          value,
          children,
        }: {
          value: string;
          index: number;
          children: import('react').ReactNode;
          [key: string]: unknown;
        }) => {
          const { Pressable } =
            jest.requireActual<typeof import('react-native')>('react-native');
          return createElement(
            Pressable,
            {
              testID: `select-item-${value}`,
              onPress: () => {
                mockSelectOnChange?.(value);
              },
            },
            children,
          );
        },
        ItemText: ({ children }: { children?: import('react').ReactNode }) => {
          const { Text } =
            jest.requireActual<typeof import('react-native')>('react-native');
          return createElement(Text, null, children);
        },
        ItemIndicator: () => null,
      },
    ),
  };
});

const mockUseFootballPlayersQuery = jest.fn();
const mockUseGetUserLeaguesQuery = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  useFootballPlayersQuery: (...args: unknown[]) =>
    mockUseFootballPlayersQuery(...args) as Record<string, unknown>,
  useGetUserLeaguesQuery: (...args: unknown[]) =>
    mockUseGetUserLeaguesQuery(...args) as Record<string, unknown>,
  Sport: { Football: 'football', Baseball: 'baseball' },
}));

const mockUseMyRosterPlayerIds = jest.fn(() => ({
  playerIds: new Set<number>(),
  loading: false,
}));
jest.mock('./hooks/useMyRosterPlayerIds', () => ({
  useMyRosterPlayerIds: (...args: unknown[]) =>
    mockUseMyRosterPlayerIds(...args) as {
      playerIds: Set<number>;
      loading: boolean;
    },
}));

// Convenience alias so tests can call mockUseHasEntitlement.mockReturnValue(...)
// without the verbose cast on every line.
const mockUseHasEntitlement = useHasEntitlement as jest.Mock;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const QB_PLAYER = {
  id: 1,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  pfrId: 'MahoPa00',
  projectedFantasyPoints: null,
  careerStats: {
    passing: { yds: 5000, td: 37, int: 14, rating: 105.2 },
    rushing: null,
    receiving: null,
    kicking: null,
    defense: null,
    idp: null,
  },
};

const DST_PLAYER = {
  id: 2,
  firstName: 'Kansas City',
  lastName: 'Chiefs',
  position: 'DST',
  isDst: true,
  nflTeam: 'KC',
  pfrId: null,
  projectedFantasyPoints: null,
  careerStats: {
    passing: null,
    rushing: null,
    receiving: null,
    kicking: null,
    defense: { sacks: 45.5, int: 18, ptsAllowedPerG: 19.3 },
    idp: null,
  },
};

const LB_PLAYER = {
  id: 3,
  firstName: 'Micah',
  lastName: 'Parsons',
  position: 'LB',
  isDst: false,
  nflTeam: 'DAL',
  pfrId: 'ParsMi00',
  projectedFantasyPoints: null,
  careerStats: {
    passing: null,
    rushing: null,
    receiving: null,
    kicking: null,
    defense: null,
    idp: { soloTkl: 48, astTkl: 12, sacks: 13.0, int: 1, ff: 4 },
  },
};

const WR_PLAYER = {
  id: 4,
  firstName: 'Tyreek',
  lastName: 'Hill',
  position: 'WR',
  isDst: false,
  nflTeam: 'DAL',
  pfrId: null,
  projectedFantasyPoints: null,
  careerStats: {
    passing: null,
    rushing: null,
    receiving: { rec: 82, yds: 1200, td: 9 },
    kicking: null,
    defense: null,
    idp: null,
  },
};

const defaultQueryResult = {
  data: {
    footballPlayers: {
      nodes: [QB_PLAYER],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
  loading: false,
  error: undefined,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FootballPlayers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFootballPlayersQuery.mockReturnValue(defaultQueryResult);
    mockUseGetUserLeaguesQuery.mockReturnValue({ data: null, loading: false });
    // Reset entitlement to free-user default so premium tests don't bleed into each other.
    mockUseHasEntitlement.mockReturnValue(false);
    mockUseMyRosterPlayerIds.mockReturnValue({
      playerIds: new Set<number>(),
      loading: false,
    });
    mockAsyncStorageGetItem.mockResolvedValue(null);
    mockAsyncStorageSetItem.mockResolvedValue(undefined);
  });

  describe('AsyncStorage filter persistence (LS-6465)', () => {
    it('rehydrates positions and team from AsyncStorage on mount', async () => {
      // useDebounce schedules a 300ms setTimeout on every render. RNTL 14 alpha's
      // async act() deadlocks with pending fake timers. Use fake timers +
      // waitFor() instead: waitFor's fake-timer loop calls
      // jest.advanceTimersByTime() to drain fake timers and uses the real
      // setImmediate (captured at module load) to flush Promise microtasks
      // without entering the deadlock-prone async act() path.
      jest.useFakeTimers();
      const stored = JSON.stringify({
        positions: ['WR', 'TE'],
        teamFilter: 'KC',
        searchInput: '',
      });
      mockAsyncStorageGetItem.mockResolvedValue(stored);
      mockUseFootballPlayersQuery.mockReturnValue(defaultQueryResult);

      render(<FootballPlayers />);

      await waitFor(() => {
        const calls = mockUseFootballPlayersQuery.mock.calls;
        const lastCall = calls[calls.length - 1] as [
          { variables: { positions?: string[]; nflTeam?: string } },
        ];
        expect(lastCall[0].variables.positions).toEqual(['WR', 'TE']);
        expect(lastCall[0].variables.nflTeam).toBe('KC');
      });

      jest.useRealTimers();
    });

    it('rehydrates search input from AsyncStorage on mount', async () => {
      jest.useFakeTimers();
      const stored = JSON.stringify({
        positions: [],
        teamFilter: 'All',
        searchInput: 'Hill',
      });
      mockAsyncStorageGetItem.mockResolvedValue(stored);
      mockUseFootballPlayersQuery.mockReturnValue(defaultQueryResult);

      render(<FootballPlayers />);

      await waitFor(() => {
        const calls = mockUseFootballPlayersQuery.mock.calls;
        const lastCall = calls[calls.length - 1] as [
          { variables: { search?: string } },
        ];
        expect(lastCall[0].variables.search).toBe('hill');
      });

      jest.useRealTimers();
    });

    it('persists filters to AsyncStorage when positions change', async () => {
      await act(async () => {
        render(<FootballPlayers />);
        await Promise.resolve();
      });

      fireEvent.press(screen.getAllByText('QB')[0]);

      expect(mockAsyncStorageSetItem).toHaveBeenCalledWith(
        '@football_players_filter',
        expect.stringContaining('"positions":["QB"]'),
      );
    });

    it('persists filters to AsyncStorage when team filter changes', async () => {
      await act(async () => {
        render(<FootballPlayers />);
        await Promise.resolve();
      });

      fireEvent.press(screen.getByTestId('team-picker-trigger'));
      fireEvent.press(screen.getByTestId('select-item-KC'));

      expect(mockAsyncStorageSetItem).toHaveBeenCalledWith(
        '@football_players_filter',
        expect.stringContaining('"teamFilter":"KC"'),
      );
    });

    it('silently ignores AsyncStorage read errors on mount', async () => {
      mockAsyncStorageGetItem.mockRejectedValue(
        new Error('storage unavailable'),
      );

      await act(async () => {
        render(<FootballPlayers />);
        await Promise.resolve();
      });

      // Component renders normally without throwing
      expect(screen.getByPlaceholderText('Search players...')).toBeTruthy();
    });

    it('silently ignores malformed cached data on mount', async () => {
      mockAsyncStorageGetItem.mockResolvedValue('{"positions":"not-an-array"}');

      await act(async () => {
        render(<FootballPlayers />);
        await Promise.resolve();
      });

      // Malformed data is discarded — query runs with no filters
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[] } },
      ];
      expect(lastCall[0].variables.positions).toBeUndefined();
    });

    it('silently ignores AsyncStorage write errors when filters change', async () => {
      mockAsyncStorageSetItem.mockRejectedValue(new Error('disk full'));

      await act(async () => {
        render(<FootballPlayers />);
        await Promise.resolve();
      });

      // Should not throw when pressing a position pill
      expect(() => fireEvent.press(screen.getAllByText('QB')[0])).not.toThrow();
    });
  });

  describe('rendering', () => {
    it('renders the search input', () => {
      render(<FootballPlayers />);
      expect(screen.getByPlaceholderText('Search players...')).toBeTruthy();
    });

    it('renders player name for a returned player', () => {
      render(<FootballPlayers />);
      expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
    });

    // Regression for FPD-017 (LS-6241): the team-abbreviation subtitle must use a
    // token that is defined in the branded dark theme. `$gray10` is not part of
    // brandDark, so it relied on token-level fallback that can render
    // black-on-black on some devices. `$textMuted` is defined in both themes.
    it('renders the team abbreviation subtitle with the defined $textMuted token', () => {
      render(<FootballPlayers />);
      const subtitle = screen
        .getAllByText('KC')
        .find((node) => node.props.color === '$textMuted');
      expect(subtitle).toBeTruthy();
    });

    it('renders QB passing stats', () => {
      render(<FootballPlayers />);
      expect(screen.getByText('5,000')).toBeTruthy();
      expect(screen.getByText('YDS')).toBeTruthy();
      expect(screen.getByText('37')).toBeTruthy();
      expect(screen.getByText('TD')).toBeTruthy();
      expect(screen.getByText('RTG')).toBeTruthy();
    });

    it('renders both passing and rushing rows for a dual-threat QB (LS-6242)', () => {
      const DUAL_THREAT_QB = {
        ...QB_PLAYER,
        firstName: 'Josh',
        lastName: 'Allen',
        careerStats: {
          passing: { yds: 21000, td: 150, int: 60, rating: 96.3 },
          rushing: { yds: 762, td: 15 },
          receiving: null,
          kicking: null,
          defense: null,
          idp: null,
        },
      };
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [DUAL_THREAT_QB],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      render(<FootballPlayers />);
      // Both category captions present; rushing data (762) no longer hidden.
      expect(screen.getByText('Pass')).toBeTruthy();
      expect(screen.getByText('Rush')).toBeTruthy();
      expect(screen.getByText('762')).toBeTruthy();
    });

    it('renders DST stats: sacks, INT, pts allowed per game', () => {
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [DST_PLAYER],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      render(<FootballPlayers />);
      expect(screen.getByText('Sacks')).toBeTruthy();
      expect(screen.getByText('Pts/G')).toBeTruthy();
    });

    it('renders IDP stats: solo tackles, sacks, INT, forced fumbles', () => {
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [LB_PLAYER],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      render(<FootballPlayers />);
      expect(screen.getByText('48')).toBeTruthy();
      expect(screen.getByText('Solo')).toBeTruthy();
      expect(screen.getByText('FF')).toBeTruthy();
    });

    it('renders WR receiving stats: rec, yds, td', () => {
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [WR_PLAYER],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      render(<FootballPlayers />);
      expect(screen.getByText('82')).toBeTruthy();
      expect(screen.getByText('REC')).toBeTruthy();
    });

    it('shows loading spinner when initial load is in progress', () => {
      mockUseFootballPlayersQuery.mockReturnValue({
        data: undefined,
        loading: true,
        error: undefined,
      });
      render(<FootballPlayers />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });

    it('shows empty state when no players match', () => {
      mockUseFootballPlayersQuery.mockReturnValue({
        data: {
          footballPlayers: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
        loading: false,
        error: undefined,
      });
      render(<FootballPlayers />);
      expect(screen.getByText('No players found')).toBeTruthy();
    });

    it('shows error banner when query fails', () => {
      mockUseFootballPlayersQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Network error'),
      });
      render(<FootballPlayers />);
      expect(
        screen.getByText('Failed to load players. Please try again.'),
      ).toBeTruthy();
    });

    it('shows "No stats available" when careerStats is null', () => {
      const noStatsPlayer = { ...QB_PLAYER, careerStats: null };
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [noStatsPlayer],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      render(<FootballPlayers />);
      expect(screen.getByText('No stats available')).toBeTruthy();
    });

    it('shows "Load more" button when hasNextPage is true', () => {
      mockUseFootballPlayersQuery.mockReturnValue({
        data: {
          footballPlayers: {
            nodes: [QB_PLAYER],
            pageInfo: { hasNextPage: true, endCursor: 'cursor123' },
          },
        },
        loading: false,
        error: undefined,
      });
      render(<FootballPlayers />);
      expect(screen.getByText('Load more')).toBeTruthy();
    });
  });

  describe('fresh-mount default state (LS-7065 — sport-switch reset)', () => {
    it('starts with all filters cleared on mount, as after a sport switch', () => {
      // When the parent switches sports, FootballPlayers is remounted with a new key.
      // This test verifies that a fresh mount sends no position/team/search filters,
      // i.e. the "No players found" / wrong-taxonomy bug cannot occur right after switch.
      render(<FootballPlayers />);
      const calls = mockUseFootballPlayersQuery.mock.calls as Array<
        [
          {
            variables: {
              positions?: string[];
              nflTeam?: string;
              search?: string;
            };
          },
        ]
      >;
      const firstCall = calls[0];
      expect(firstCall[0].variables.positions).toBeUndefined();
      expect(firstCall[0].variables.nflTeam).toBeUndefined();
      expect(firstCall[0].variables.search).toBeUndefined();
    });
  });

  describe('position filter', () => {
    it('position pills render with testID for automation targeting (LS-6481)', () => {
      render(<FootballPlayers />);
      expect(screen.getByTestId('position-pill-All')).toBeTruthy();
      expect(screen.getByTestId('position-pill-QB')).toBeTruthy();
    });

    it('passes selected position to query when a pill is pressed', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('position-pill-QB'));
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[] } },
      ];
      expect(lastCall[0].variables.positions).toEqual(['QB']);
    });

    it('passes undefined positions when "All" pill is selected', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('position-pill-QB'));
      fireEvent.press(screen.getByTestId('position-pill-All'));
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[] } },
      ];
      expect(lastCall[0].variables.positions).toBeUndefined();
    });

    it('accumulates multiple positions for multi-select (LS-6464)', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('position-pill-QB'));
      fireEvent.press(screen.getByTestId('position-pill-WR'));
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[] } },
      ];
      expect(lastCall[0].variables.positions).toEqual(['QB', 'WR']);
    });

    it('toggles a position off when its pill is pressed again', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('position-pill-QB'));
      fireEvent.press(screen.getByTestId('position-pill-QB'));
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[] } },
      ];
      expect(lastCall[0].variables.positions).toBeUndefined();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    // Regression for LS-7050: when the user paginates then changes the search
    // filter, the filter-change effect resets cursor to undefined. That cursor
    // change fires the data effect before Apollo has refreshed data for the new
    // variables. Without the isFilterChangingRef guard the effect's append path
    // would commit stale paginated results into the newly-cleared allNodes,
    // briefly showing the wrong player list.
    it('does not restore stale paginated results after a filter change (LS-7050)', () => {
      // Page 1 — has a next page so "Load more" appears
      mockUseFootballPlayersQuery.mockReturnValue({
        data: {
          footballPlayers: {
            nodes: [QB_PLAYER],
            pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
          },
        },
        loading: false,
        error: undefined,
      });

      const { rerender } = render(<FootballPlayers />);
      expect(screen.getByText('Patrick Mahomes')).toBeTruthy();

      // Simulate loading page 2: update mock before pressing "Load more" so
      // the re-render that fires from setCursor sees page-2 data, matching
      // real Apollo behaviour where cursor change fetches new variables.
      mockUseFootballPlayersQuery.mockReturnValue({
        data: {
          footballPlayers: {
            nodes: [DST_PLAYER],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
        loading: false,
        error: undefined,
      });
      fireEvent.press(screen.getByText('Load more'));
      // After the press: cursor='cursor1', prevCursorRef='cursor1', allNodes includes DST

      // Now the filter changes. The mock deliberately keeps returning DST data
      // to simulate Apollo's observable not yet having updated for new variables
      // (the stale-response race described in LS-7050).
      const input = screen.getByPlaceholderText('Search players...');
      fireEvent.changeText(input, 'Mahomes');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      // filter-change effect ran: cursor=undefined, allNodes=[], isFilterChanging=true
      // data effect fired (cursor 'cursor1'→undefined) — the guard must have skipped
      // the stale DST commit. If it didn't, DST_PLAYER ('Kansas City') would appear.
      expect(screen.queryByText('Kansas City Chiefs')).toBeNull();

      // Fresh search results arrive for 'Mahomes': update mock then rerender to
      // simulate Apollo's observable emitting for the new query variables.
      mockUseFootballPlayersQuery.mockReturnValue({
        data: {
          footballPlayers: {
            nodes: [QB_PLAYER],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
        loading: false,
        error: undefined,
      });
      rerender(<FootballPlayers />);
      expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
    });

    it('passes search term to query after debounce fires', () => {
      render(<FootballPlayers />);
      const input = screen.getByPlaceholderText('Search players...');
      fireEvent.changeText(input, 'Mahomes');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { search?: string } },
      ];
      expect(lastCall[0].variables.search).toBe('mahomes');
    });

    it('passes undefined search when input is a single character (FPL-004)', () => {
      render(<FootballPlayers />);
      const input = screen.getByPlaceholderText('Search players...');
      fireEvent.changeText(input, 'A');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { search?: string } },
      ];
      expect(lastCall[0].variables.search).toBeUndefined();
    });

    it('passes undefined search when input is cleared after debounce', () => {
      render(<FootballPlayers />);
      const input = screen.getByPlaceholderText('Search players...');
      fireEvent.changeText(input, 'Mahomes');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      fireEvent.changeText(input, '');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { search?: string } },
      ];
      expect(lastCall[0].variables.search).toBeUndefined();
    });
  });

  describe('navigation (LS-7053)', () => {
    it('navigates to the player detail screen when a row is pressed', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByText('Patrick Mahomes'));
      expect(mockPush).toHaveBeenCalledWith('/football/players/1');
    });
  });

  describe('team filter', () => {
    it('passes conference variable when AFC is selected', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('team-picker-trigger'));
      fireEvent.press(screen.getByTestId('select-item-AFC'));
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { conference?: string; nflTeam?: string } },
      ];
      expect(lastCall[0].variables.conference).toBe('AFC');
      expect(lastCall[0].variables.nflTeam).toBeUndefined();
    });

    it('passes conference variable when NFC is selected', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('team-picker-trigger'));
      fireEvent.press(screen.getByTestId('select-item-NFC'));
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { conference?: string; nflTeam?: string } },
      ];
      expect(lastCall[0].variables.conference).toBe('NFC');
      expect(lastCall[0].variables.nflTeam).toBeUndefined();
    });

    it('passes nflTeam variable when a specific team is selected', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('team-picker-trigger'));
      fireEvent.press(screen.getByTestId('select-item-KC'));
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { conference?: string; nflTeam?: string } },
      ];
      expect(lastCall[0].variables.nflTeam).toBe('KC');
      expect(lastCall[0].variables.conference).toBeUndefined();
    });

    it('clears both filters when All Teams is selected after a conference filter', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('team-picker-trigger'));
      fireEvent.press(screen.getByTestId('select-item-AFC'));
      fireEvent.press(screen.getByTestId('team-picker-trigger'));
      fireEvent.press(screen.getByTestId('select-item-All'));
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { conference?: string; nflTeam?: string } },
      ];
      expect(lastCall[0].variables.nflTeam).toBeUndefined();
      expect(lastCall[0].variables.conference).toBeUndefined();
    });
  });

  describe('team picker search (LS-6495)', () => {
    it('opens a searchable modal with a search input when the trigger is pressed', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('team-picker-trigger'));
      expect(screen.getByPlaceholderText('Search teams...')).toBeTruthy();
    });

    it('filters team options by label when typing in the search box', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('team-picker-trigger'));
      fireEvent.changeText(
        screen.getByPlaceholderText('Search teams...'),
        'Kansas',
      );
      expect(screen.getByTestId('select-item-KC')).toBeTruthy();
      expect(screen.queryByTestId('select-item-DAL')).toBeNull();
    });

    it('closes the modal and clears search when Cancel is pressed', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('team-picker-trigger'));
      expect(screen.getByPlaceholderText('Search teams...')).toBeTruthy();
      fireEvent.press(screen.getByTestId('team-picker-cancel'));
      expect(screen.queryByPlaceholderText('Search teams...')).toBeNull();
    });

    it('team items have accessibility labels for TalkBack navigation', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('team-picker-trigger'));
      const afcItem = screen.getByTestId('select-item-AFC');
      expect(afcItem.props.accessibilityLabel).toBe('AFC');
      expect(afcItem.props.accessibilityRole).toBe('radio');
    });
  });

  describe('availability filter (LS-7042)', () => {
    const footballLeaguesData = {
      data: {
        userLeagues: [{ id: 1, sport: 'football', isMockDraft: false }],
      },
      loading: false,
    };

    it('does not show availability pills when user has no football leagues', () => {
      render(<FootballPlayers />);
      expect(screen.queryByTestId('availability-pill-all')).toBeNull();
    });

    it('shows all three availability pills when user has at least one football league', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue(footballLeaguesData);
      render(<FootballPlayers />);
      expect(screen.getByTestId('availability-pill-all')).toBeTruthy();
      expect(screen.getByTestId('availability-pill-free_agents')).toBeTruthy();
      expect(screen.getByTestId('availability-pill-rostered')).toBeTruthy();
    });

    it('Free Agents filter hides rostered players', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue(footballLeaguesData);
      // QB (id=1) is rostered; WR (id=4) is a free agent.
      mockUseMyRosterPlayerIds.mockReturnValue({
        playerIds: new Set([1]),
        loading: false,
      });
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [QB_PLAYER, WR_PLAYER],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('availability-pill-free_agents'));
      expect(screen.queryByText('Patrick Mahomes')).toBeNull();
      expect(screen.getByText('Tyreek Hill')).toBeTruthy();
    });

    it('Rostered filter shows only rostered players', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue(footballLeaguesData);
      mockUseMyRosterPlayerIds.mockReturnValue({
        playerIds: new Set([1]),
        loading: false,
      });
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [QB_PLAYER, WR_PLAYER],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('availability-pill-rostered'));
      expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
      expect(screen.queryByText('Tyreek Hill')).toBeNull();
    });

    it('All pill resets to showing all players', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue(footballLeaguesData);
      mockUseMyRosterPlayerIds.mockReturnValue({
        playerIds: new Set([1]),
        loading: false,
      });
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [QB_PLAYER, WR_PLAYER],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('availability-pill-rostered'));
      fireEvent.press(screen.getByTestId('availability-pill-all'));
      expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
      expect(screen.getByText('Tyreek Hill')).toBeTruthy();
    });
  });

  describe('parseAdvancedSearch (LS-7051)', () => {
    it('extracts pos: token into positions array', () => {
      expect(parseAdvancedSearch('pos:WR')).toEqual({
        positions: ['WR'],
        nflTeam: undefined,
        remainder: '',
      });
    });

    it('extracts team: token into nflTeam', () => {
      expect(parseAdvancedSearch('team:KC')).toEqual({
        positions: [],
        nflTeam: 'KC',
        remainder: '',
      });
    });

    it('extracts both tokens and leaves remainder text', () => {
      expect(parseAdvancedSearch('pos:WR team:KC Mahomes')).toEqual({
        positions: ['WR'],
        nflTeam: 'KC',
        remainder: 'Mahomes',
      });
    });

    it('is case-insensitive for keys and uppercases values', () => {
      expect(parseAdvancedSearch('Pos:wr Team:kc')).toEqual({
        positions: ['WR'],
        nflTeam: 'KC',
        remainder: '',
      });
    });

    it('returns plain text as remainder with no tokens', () => {
      expect(parseAdvancedSearch('Mahomes')).toEqual({
        positions: [],
        nflTeam: undefined,
        remainder: 'Mahomes',
      });
    });

    it('handles empty string', () => {
      expect(parseAdvancedSearch('')).toEqual({
        positions: [],
        nflTeam: undefined,
        remainder: '',
      });
    });

    it('handles multiple pos: tokens', () => {
      const result = parseAdvancedSearch('pos:WR pos:TE');
      expect(result.positions).toEqual(['WR', 'TE']);
      expect(result.remainder).toBe('');
    });
  });

  describe('advanced search syntax (LS-7051)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows advanced placeholder for premium users', () => {
      mockUseHasEntitlement.mockImplementation(
        (key: string) => key === 'advanced_search_filters',
      );
      render(<FootballPlayers />);
      expect(
        screen.getByPlaceholderText('Search or pos:WR team:KC...'),
      ).toBeTruthy();
    });

    it('shows standard placeholder for free users', () => {
      mockUseHasEntitlement.mockReturnValue(false);
      render(<FootballPlayers />);
      expect(screen.getByPlaceholderText('Search players...')).toBeTruthy();
    });

    it('parses pos: token and passes position to query for premium users', () => {
      mockUseHasEntitlement.mockImplementation(
        (key: string) => key === 'advanced_search_filters',
      );
      render(<FootballPlayers />);
      const input = screen.getByPlaceholderText('Search or pos:WR team:KC...');
      fireEvent.changeText(input, 'pos:WR');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[]; search?: string } },
      ];
      expect(lastCall[0].variables.positions).toContain('WR');
      expect(lastCall[0].variables.search).toBeUndefined();
    });

    it('parses team: token and passes nflTeam to query for premium users', () => {
      mockUseHasEntitlement.mockImplementation(
        (key: string) => key === 'advanced_search_filters',
      );
      render(<FootballPlayers />);
      const input = screen.getByPlaceholderText('Search or pos:WR team:KC...');
      fireEvent.changeText(input, 'team:KC');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { nflTeam?: string; search?: string } },
      ];
      expect(lastCall[0].variables.nflTeam).toBe('KC');
      expect(lastCall[0].variables.search).toBeUndefined();
    });

    it('passes non-token text as regular search for premium users', () => {
      mockUseHasEntitlement.mockImplementation(
        (key: string) => key === 'advanced_search_filters',
      );
      render(<FootballPlayers />);
      const input = screen.getByPlaceholderText('Search or pos:WR team:KC...');
      fireEvent.changeText(input, 'Mahomes');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { search?: string } },
      ];
      expect(lastCall[0].variables.search).toBe('mahomes');
    });

    it('does not parse tokens for free users — raw input becomes search', () => {
      mockUseHasEntitlement.mockReturnValue(false);
      render(<FootballPlayers />);
      const input = screen.getByPlaceholderText('Search players...');
      fireEvent.changeText(input, 'pos:WR');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[]; search?: string } },
      ];
      expect(lastCall[0].variables.search).toBe('pos:wr');
      expect(lastCall[0].variables.positions).toBeUndefined();
    });

    it('merges pos: token positions with pill-selected positions', () => {
      mockUseHasEntitlement.mockImplementation(
        (key: string) => key === 'advanced_search_filters',
      );
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('position-pill-QB'));
      const input = screen.getByPlaceholderText('Search or pos:WR team:KC...');
      fireEvent.changeText(input, 'pos:WR');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[] } },
      ];
      expect(lastCall[0].variables.positions).toContain('QB');
      expect(lastCall[0].variables.positions).toContain('WR');
    });
  });

  describe('My Rostered premium filter', () => {
    it('does not render the My Rostered pill for free users', () => {
      render(<FootballPlayers />);
      expect(screen.queryByTestId('my-rostered-pill')).toBeNull();
    });

    it('renders the My Rostered pill for premium users', () => {
      mockUseHasEntitlement.mockReturnValue(true);
      render(<FootballPlayers />);
      expect(screen.getByTestId('my-rostered-pill')).toBeTruthy();
    });

    it('filters to rostered players when pill is pressed by a premium user', () => {
      mockUseHasEntitlement.mockReturnValue(true);
      // Player 1 (QB_PLAYER id=1) is rostered; WR_PLAYER (id=4) is not.
      mockUseMyRosterPlayerIds.mockReturnValue({
        playerIds: new Set([1]),
        loading: false,
      });
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [QB_PLAYER, WR_PLAYER],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      render(<FootballPlayers />);
      fireEvent.press(screen.getByTestId('my-rostered-pill'));
      expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
      expect(screen.queryByText('Tyreek Hill')).toBeNull();
    });
  });

  describe('premium position filters (LS-7061)', () => {
    afterEach(() => {
      mockUseHasEntitlement.mockReturnValue(false);
    });

    it('hides SUPERFLEX and IDP pills for free users', () => {
      render(<FootballPlayers />);
      expect(screen.queryByText('SUPERFLEX')).toBeNull();
      expect(screen.queryByText('IDP')).toBeNull();
    });

    it('shows SUPERFLEX and IDP pills when advanced_search_filters entitlement is active', () => {
      mockUseHasEntitlement.mockReturnValue(true);
      render(<FootballPlayers />);
      expect(screen.getByText('SUPERFLEX')).toBeTruthy();
      expect(screen.getByText('IDP')).toBeTruthy();
    });
  });

  describe('premium projections (LS-7066)', () => {
    afterEach(() => {
      mockUseHasEntitlement.mockReturnValue(false);
    });

    it('shows projections upsell banner for free users', () => {
      render(<FootballPlayers />);
      expect(screen.getByText('Fantasy Projections — Premium')).toBeTruthy();
    });

    it('shows projected fantasy points chip for premium users', () => {
      const playerWithProjections = {
        ...QB_PLAYER,
        projectedFantasyPoints: 24.5,
      };
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [playerWithProjections],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      mockUseHasEntitlement.mockReturnValue(true);
      render(<FootballPlayers />);
      expect(screen.getByText('24.5')).toBeTruthy();
      expect(screen.getByText('pts')).toBeTruthy();
    });
  });

  describe('premium long-press quick-actions', () => {
    it('shows the quick-action sheet when a premium user long-presses a player row', () => {
      jest.spyOn(Alert, 'alert');
      mockUseHasEntitlement.mockReturnValue(true);
      render(<FootballPlayers />);
      fireEvent(screen.getByTestId('player-row-1'), 'longPress');
      expect(Alert.alert).toHaveBeenCalledWith(
        'Patrick Mahomes',
        'Quick actions',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Add to Compare' }),
          expect.objectContaining({ text: 'Add to Watchlist' }),
          expect.objectContaining({ text: 'Add to Draft Queue' }),
          expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        ]),
      );
    });

    it('does not show the quick-action sheet when a non-premium user long-presses a player row', () => {
      jest.spyOn(Alert, 'alert');
      mockUseHasEntitlement.mockReturnValue(false);
      render(<FootballPlayers />);
      fireEvent(screen.getByTestId('player-row-1'), 'longPress');
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });
});

describe('PlayersRoute (/football/players standalone hub)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFeatureIsOn.mockReturnValue(false);
    mockUseFootballPlayersQuery.mockReturnValue(defaultQueryResult);
    mockUseGetUserLeaguesQuery.mockReturnValue({ data: null, loading: false });
    mockUseHasEntitlement.mockReturnValue(false);
    mockUseMyRosterPlayerIds.mockReturnValue({
      playerIds: new Set<number>(),
      loading: false,
    });
  });

  describe('sport switcher — football_enabled = false', () => {
    it('hides sport switcher pills when football is not enabled', () => {
      render(<PlayersRoute />);
      expect(screen.queryByTestId('sport-switch-baseball')).toBeNull();
      expect(screen.queryByTestId('sport-switch-football')).toBeNull();
    });

    it('shows football player list by default when football is not enabled', () => {
      render(<PlayersRoute />);
      expect(screen.queryByTestId('player-stats-screen')).toBeNull();
      expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
    });
  });

  describe('sport switcher — football_enabled = true', () => {
    beforeEach(() => {
      mockUseFeatureIsOn.mockReturnValue(true);
    });

    it('shows Baseball and Football pills', () => {
      render(<PlayersRoute />);
      expect(screen.getByTestId('sport-switch-baseball')).toBeTruthy();
      expect(screen.getByTestId('sport-switch-football')).toBeTruthy();
    });

    it('defaults to football content (no baseball stats screen)', () => {
      render(<PlayersRoute />);
      expect(screen.queryByTestId('player-stats-screen')).toBeNull();
      expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
    });

    it('switches to baseball stats screen when Baseball pill is pressed', () => {
      render(<PlayersRoute />);
      fireEvent.press(screen.getByTestId('sport-switch-baseball'));
      expect(screen.getByTestId('player-stats-screen')).toBeTruthy();
      expect(screen.queryByText('Patrick Mahomes')).toBeNull();
    });

    it('switches back to football when Football pill is pressed after baseball', () => {
      render(<PlayersRoute />);
      fireEvent.press(screen.getByTestId('sport-switch-baseball'));
      fireEvent.press(screen.getByTestId('sport-switch-football'));
      expect(screen.queryByTestId('player-stats-screen')).toBeNull();
      expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
    });
  });
});
