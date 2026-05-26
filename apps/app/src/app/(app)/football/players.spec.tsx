import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import FootballPlayers from './players';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/shared-components', () => ({
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
}));

jest.mock('@tamagui/lucide-icons', () => ({
  ChevronDown: 'ChevronDown',
}));

jest.mock('tamagui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  return {
    ...mocks.tamaguiMocks,
    YStack: ({
      children,
      onPress,
      testID,
    }: {
      children: import('react').ReactNode;
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
        onValueChange: _onValueChange,
      }: {
        children: import('react').ReactNode;
        value?: string;
        onValueChange?: (v: string) => void;
        disablePreventBodyScroll?: boolean;
      }) => {
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
        Content: () => null,
        ScrollUpButton: () => null,
        ScrollDownButton: () => null,
        Viewport: () => null,
        Group: () => null,
        Item: () => null,
        ItemText: () => null,
        ItemIndicator: () => null,
      },
    ),
  };
});

const mockUseFootballPlayersQuery = jest.fn();
jest.mock('../../../api/db/graphql.generated', () => ({
  useFootballPlayersQuery: (...args: unknown[]) =>
    mockUseFootballPlayersQuery(...args) as Record<string, unknown>,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const QB_PLAYER = {
  id: 1,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  pfrId: 'MahoPa00',
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
  });

  describe('rendering', () => {
    it('renders position filter pills', () => {
      render(<FootballPlayers />);
      expect(screen.getAllByText('QB')[0]).toBeTruthy();
      expect(screen.getByText('RB')).toBeTruthy();
      expect(screen.getByText('WR')).toBeTruthy();
      expect(screen.getByText('TE')).toBeTruthy();
      expect(screen.getByText('K')).toBeTruthy();
      expect(screen.getByText('DST')).toBeTruthy();
      expect(screen.getByText('DL')).toBeTruthy();
      expect(screen.getByText('LB')).toBeTruthy();
      expect(screen.getByText('DB')).toBeTruthy();
    });

    it('renders the search input', () => {
      render(<FootballPlayers />);
      expect(screen.getByPlaceholderText('Search players...')).toBeTruthy();
    });

    it('renders player name for a returned player', () => {
      render(<FootballPlayers />);
      expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
    });

    it('renders QB passing stats', () => {
      render(<FootballPlayers />);
      expect(screen.getByText('5,000')).toBeTruthy();
      expect(screen.getByText('YDS')).toBeTruthy();
      expect(screen.getByText('37')).toBeTruthy();
      expect(screen.getByText('TD')).toBeTruthy();
      expect(screen.getByText('RTG')).toBeTruthy();
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

  describe('position filter', () => {
    it('passes selected position to query when a pill is pressed', () => {
      render(<FootballPlayers />);
      // Pills are rendered first in the FlatList before any player content;
      // use getAllByText and pick the first occurrence (the pill).
      fireEvent.press(screen.getAllByText('QB')[0]);
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { position?: string } },
      ];
      expect(lastCall[0].variables.position).toBe('QB');
    });

    it('passes undefined position when "All" pill is selected', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getAllByText('QB')[0]);
      fireEvent.press(screen.getByText('All'));
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { position?: string } },
      ];
      expect(lastCall[0].variables.position).toBeUndefined();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
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
      expect(lastCall[0].variables.search).toBe('Mahomes');
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
});
