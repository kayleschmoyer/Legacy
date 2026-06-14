import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Players from './players';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/shared-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return {
    BattingStatsTableWithData: ({ data }: { data?: { nodes?: unknown[] } }) => {
      const { View, Text } =
        jest.requireActual<typeof import('react-native')>('react-native');
      return createElement(
        View,
        { testID: 'batting-table' },
        createElement(Text, null, `batting-rows:${data?.nodes?.length ?? 0}`),
      );
    },
    PitchingStatsTableWithData: ({
      data,
    }: {
      data?: { nodes?: unknown[] };
    }) => {
      const { View, Text } =
        jest.requireActual<typeof import('react-native')>('react-native');
      return createElement(
        View,
        { testID: 'pitching-table' },
        createElement(Text, null, `pitching-rows:${data?.nodes?.length ?? 0}`),
      );
    },
    FieldingStatsTableWithData: ({
      data,
    }: {
      data?: { nodes?: unknown[] };
    }) => {
      const { View, Text } =
        jest.requireActual<typeof import('react-native')>('react-native');
      return createElement(
        View,
        { testID: 'fielding-table' },
        createElement(Text, null, `fielding-rows:${data?.nodes?.length ?? 0}`),
      );
    },
    MLB_TEAMS: [
      {
        franchiseId: 'NYY',
        currentAbbr: 'NYY',
        currentName: 'New York Yankees',
        historicalAbbrs: [],
        league: 'AL',
        division: 'East',
      },
      {
        franchiseId: 'LAD',
        currentAbbr: 'LAD',
        currentName: 'Los Angeles Dodgers',
        historicalAbbrs: [],
        league: 'NL',
        division: 'West',
      },
    ],
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  ChevronDown: 'ChevronDown',
}));

jest.mock('tamagui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  let mockSelectOnChange: ((val: string) => void) | null = null;
  return {
    ...mocks.tamaguiMocks,
    YStack: ({
      children,
      onPress,
      testID,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => {
      const { View, Pressable } =
        jest.requireActual<typeof import('react-native')>('react-native');
      if (onPress) {
        return createElement(Pressable, { onPress, testID }, children);
      }
      return createElement(View, { testID }, children);
    },
    Select: Object.assign(
      ({
        children,
        value: _value,
        onValueChange,
      }: {
        children: React.ReactNode;
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
        Trigger: ({ children }: { children: React.ReactNode }) => {
          const { View } =
            jest.requireActual<typeof import('react-native')>('react-native');
          return createElement(View, { testID: 'select-trigger' }, children);
        },
        Value: ({
          children,
          placeholder,
        }: {
          children?: React.ReactNode;
          placeholder?: string;
        }) => {
          const { Text } =
            jest.requireActual<typeof import('react-native')>('react-native');
          return createElement(Text, null, children ?? placeholder);
        },
        Content: ({ children }: { children: React.ReactNode }) => {
          const { View } =
            jest.requireActual<typeof import('react-native')>('react-native');
          return createElement(View, null, children);
        },
        ScrollUpButton: () => null,
        ScrollDownButton: () => null,
        Viewport: ({ children }: { children: React.ReactNode }) => {
          const { View } =
            jest.requireActual<typeof import('react-native')>('react-native');
          return createElement(View, null, children);
        },
        Group: ({ children }: { children: React.ReactNode }) => {
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
          children: React.ReactNode;
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
        ItemText: ({ children }: { children?: React.ReactNode }) => {
          const { Text } =
            jest.requireActual<typeof import('react-native')>('react-native');
          return createElement(Text, null, children);
        },
        ItemIndicator: () => null,
      },
    ),
  };
});

const mockUseGetCareerBattingStatsQuery = jest.fn();
const mockUseGetCareerPitchingStatsQuery = jest.fn();
const mockUseGetCareerFieldingStatsQuery = jest.fn();

jest.mock('../../../api/db/graphql.generated', () => ({
  useGetCareerBattingStatsQuery: (...args: unknown[]) =>
    mockUseGetCareerBattingStatsQuery(...args) as Record<string, unknown>,
  useGetCareerPitchingStatsQuery: (...args: unknown[]) =>
    mockUseGetCareerPitchingStatsQuery(...args) as Record<string, unknown>,
  useGetCareerFieldingStatsQuery: (...args: unknown[]) =>
    mockUseGetCareerFieldingStatsQuery(...args) as Record<string, unknown>,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const defaultBattingResult = {
  data: {
    careerBattingStats: {
      edges: [
        {
          node: {
            playerId: 1,
            player: { firstName: 'Babe', lastName: 'Ruth' },
            primaryPosition: 'OF',
            atBats: 8399,
            hits: 2873,
            homeRuns: 714,
            rbi: 2214,
            runs: 2174,
            stolenBases: 123,
            baseOnBalls: 2062,
            strikeouts: 1330,
            battingAverage: 0.342,
            onBasePercentage: 0.474,
            sluggingPercentage: 0.69,
          },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
  loading: false,
  error: undefined,
};

const defaultPitchingResult = {
  data: {
    careerPitchingStats: [
      {
        playerId: 2,
        player: { firstName: 'Walter', lastName: 'Johnson' },
        primaryPosition: 'SP',
        wins: 417,
        losses: 279,
        era: '2.17',
        games: 802,
        gamesStarted: 666,
        saves: 34,
        hits: 4913,
        earnedRuns: 1902,
        homeRuns: null,
        baseOnBalls: 1363,
        strikeouts: 3509,
      },
    ],
  },
  loading: false,
  error: undefined,
};

const defaultFieldingResult = {
  data: { careerFieldingStats: [] },
  loading: false,
  error: undefined,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Baseball Players', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetCareerBattingStatsQuery.mockReturnValue(defaultBattingResult);
    mockUseGetCareerPitchingStatsQuery.mockReturnValue(defaultPitchingResult);
    mockUseGetCareerFieldingStatsQuery.mockReturnValue(defaultFieldingResult);
  });

  describe('rendering', () => {
    it('renders the search input', () => {
      render(<Players />);
      expect(screen.getByPlaceholderText('Search players...')).toBeTruthy();
    });

    it('renders position filter pills', () => {
      render(<Players />);
      expect(screen.getByTestId('position-pill-All')).toBeTruthy();
      expect(screen.getByTestId('position-pill-C')).toBeTruthy();
      expect(screen.getByTestId('position-pill-SP')).toBeTruthy();
      expect(screen.getByTestId('position-pill-OF')).toBeTruthy();
    });

    it('renders the team filter select', () => {
      render(<Players />);
      expect(screen.getByTestId('select')).toBeTruthy();
    });

    it('renders batting table by default', () => {
      render(<Players />);
      expect(screen.getByTestId('batting-table')).toBeTruthy();
    });

    it('renders pitching table when Pitching tab is pressed', () => {
      render(<Players />);
      fireEvent.press(screen.getByText('Pitching'));
      expect(screen.getByTestId('pitching-table')).toBeTruthy();
    });

    it('renders fielding table when Fielding tab is pressed', () => {
      render(<Players />);
      fireEvent.press(screen.getByText('Fielding'));
      expect(screen.getByTestId('fielding-table')).toBeTruthy();
    });

    it('shows loading spinner when batting data is loading and no data yet', () => {
      mockUseGetCareerBattingStatsQuery.mockReturnValue({
        data: undefined,
        loading: true,
        error: undefined,
      });
      render(<Players />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });
  });

  describe('fresh-mount default state', () => {
    it('starts with no filters on mount', () => {
      render(<Players />);
      const calls = mockUseGetCareerBattingStatsQuery.mock.calls as Array<
        [
          {
            variables: {
              searchTerm?: string;
              position?: string;
              team?: string;
            };
          },
        ]
      >;
      const firstCall = calls[0];
      expect(firstCall[0].variables.searchTerm).toBeUndefined();
      expect(firstCall[0].variables.position).toBeUndefined();
      expect(firstCall[0].variables.team).toBeUndefined();
    });
  });

  describe('position filter', () => {
    it('passes selected position to batting query', () => {
      render(<Players />);
      fireEvent.press(screen.getByTestId('position-pill-SP'));
      const calls = mockUseGetCareerBattingStatsQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { position?: string } },
      ];
      expect(lastCall[0].variables.position).toBe('SP');
    });

    it('passes undefined position when All pill is selected', () => {
      render(<Players />);
      fireEvent.press(screen.getByTestId('position-pill-SP'));
      fireEvent.press(screen.getByTestId('position-pill-All'));
      const calls = mockUseGetCareerBattingStatsQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { position?: string } },
      ];
      expect(lastCall[0].variables.position).toBeUndefined();
    });

    it('passes selected position to pitching query', () => {
      render(<Players />);
      fireEvent.press(screen.getByText('Pitching'));
      fireEvent.press(screen.getByTestId('position-pill-RP'));
      const calls = mockUseGetCareerPitchingStatsQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { position?: string } },
      ];
      expect(lastCall[0].variables.position).toBe('RP');
    });
  });

  describe('search', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('passes search term to batting query after debounce fires', () => {
      render(<Players />);
      const input = screen.getByPlaceholderText('Search players...');
      fireEvent.changeText(input, 'Babe Ruth');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseGetCareerBattingStatsQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { searchTerm?: string } },
      ];
      expect(lastCall[0].variables.searchTerm).toBe('Babe Ruth');
    });

    it('passes undefined searchTerm when input is shorter than 2 chars', () => {
      render(<Players />);
      const input = screen.getByPlaceholderText('Search players...');
      fireEvent.changeText(input, 'B');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseGetCareerBattingStatsQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { searchTerm?: string } },
      ];
      expect(lastCall[0].variables.searchTerm).toBeUndefined();
    });

    it('passes search term to pitching query after debounce', () => {
      render(<Players />);
      fireEvent.press(screen.getByText('Pitching'));
      const input = screen.getByPlaceholderText('Search players...');
      fireEvent.changeText(input, 'Johnson');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseGetCareerPitchingStatsQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { searchTerm?: string } },
      ];
      expect(lastCall[0].variables.searchTerm).toBe('Johnson');
    });
  });

  describe('team filter', () => {
    it('passes team variable when a specific team is selected', () => {
      render(<Players />);
      fireEvent.press(screen.getByTestId('select-item-NYY'));
      const calls = mockUseGetCareerBattingStatsQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { team?: string } },
      ];
      expect(lastCall[0].variables.team).toBe('NYY');
    });

    it('passes undefined team when All Teams is selected', () => {
      render(<Players />);
      fireEvent.press(screen.getByTestId('select-item-NYY'));
      fireEvent.press(screen.getByTestId('select-item-All'));
      const calls = mockUseGetCareerBattingStatsQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { team?: string } },
      ];
      expect(lastCall[0].variables.team).toBeUndefined();
    });

    it('passes undefined team when AL league filter is selected', () => {
      render(<Players />);
      fireEvent.press(screen.getByTestId('select-item-AL'));
      const calls = mockUseGetCareerBattingStatsQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { team?: string } },
      ];
      expect(lastCall[0].variables.team).toBeUndefined();
    });
  });

  describe('pagination', () => {
    const pageOneResult = {
      data: {
        careerBattingStats: {
          edges: [
            {
              node: defaultBattingResult.data.careerBattingStats.edges[0].node,
            },
          ],
          pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
        },
      },
      loading: false,
      error: undefined,
    };

    it('shows Load more button when hasNextPage is true', () => {
      mockUseGetCareerBattingStatsQuery.mockReturnValue(pageOneResult);
      render(<Players />);
      expect(screen.getByText('Load more')).toBeTruthy();
    });

    it('does not show Load more button when hasNextPage is false', () => {
      render(<Players />);
      expect(screen.queryByText('Load more')).toBeNull();
    });

    it('clicking Load more passes endCursor as after variable', () => {
      mockUseGetCareerBattingStatsQuery.mockReturnValue(pageOneResult);
      render(<Players />);
      fireEvent.press(screen.getByText('Load more'));
      const calls = mockUseGetCareerBattingStatsQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { after?: string } },
      ];
      expect(lastCall[0].variables.after).toBe('cursor1');
    });

    it('accumulates batting rows after loading more', () => {
      const page1Node =
        defaultBattingResult.data.careerBattingStats.edges[0].node;
      const page2Node = {
        ...page1Node,
        playerId: 99,
        player: { firstName: 'Lou', lastName: 'Gehrig' },
      };

      mockUseGetCareerBattingStatsQuery.mockReturnValue(pageOneResult);
      render(<Players />);
      expect(screen.getByText('batting-rows:1')).toBeTruthy();

      mockUseGetCareerBattingStatsQuery.mockReturnValue({
        data: {
          careerBattingStats: {
            edges: [{ node: page2Node }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
        loading: false,
        error: undefined,
      });

      fireEvent.press(screen.getByText('Load more'));
      expect(screen.getByText('batting-rows:2')).toBeTruthy();
    });

    it('Load more button disappears after all pages are loaded', () => {
      mockUseGetCareerBattingStatsQuery.mockReturnValue(pageOneResult);
      render(<Players />);
      expect(screen.getByText('Load more')).toBeTruthy();

      mockUseGetCareerBattingStatsQuery.mockReturnValue({
        ...defaultBattingResult,
        data: {
          careerBattingStats: {
            edges: defaultBattingResult.data.careerBattingStats.edges,
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      fireEvent.press(screen.getByText('Load more'));
      expect(screen.queryByText('Load more')).toBeNull();
    });

    it('resets cursor and clears rows when filters change', () => {
      mockUseGetCareerBattingStatsQuery.mockReturnValue(pageOneResult);
      render(<Players />);

      mockUseGetCareerBattingStatsQuery.mockReturnValue({
        data: {
          careerBattingStats: {
            edges: [
              {
                node: {
                  ...defaultBattingResult.data.careerBattingStats.edges[0].node,
                  playerId: 99,
                  player: { firstName: 'Lou', lastName: 'Gehrig' },
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
        loading: false,
        error: undefined,
      });

      fireEvent.press(screen.getByText('Load more'));
      expect(screen.getByText('batting-rows:2')).toBeTruthy();

      fireEvent.press(screen.getByTestId('position-pill-SP'));
      const calls = mockUseGetCareerBattingStatsQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { after?: string; position?: string } },
      ];
      expect(lastCall[0].variables.after).toBeUndefined();
      expect(lastCall[0].variables.position).toBe('SP');
    });
  });
});
