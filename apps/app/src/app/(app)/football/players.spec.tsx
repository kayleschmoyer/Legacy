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

const mockUseHasEntitlement = jest.fn().mockReturnValue(false);
jest.mock('../../../features/subscription/useSubscription', () => ({
  useHasEntitlement: (...args: unknown[]) =>
    mockUseHasEntitlement(...args) as boolean,
}));

jest.mock('@legacy-sports/utils', () => ({
  ENTITLEMENTS: {
    football_projections: 'football_projections',
    advanced_search_filters: 'advanced_search_filters',
  },
}));

const mockUseFootballPlayersQuery = jest.fn();
jest.mock('../../../api/db/graphql.generated', () => ({
  useFootballPlayersQuery: (...args: unknown[]) =>
    mockUseFootballPlayersQuery(...args) as Record<string, unknown>,
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
    mockUseHasEntitlement.mockReturnValue(false);
    mockUseMyRosterPlayerIds.mockReturnValue({
      playerIds: new Set<number>(),
      loading: false,
    });
  });

  describe('rendering', () => {
    it('renders position filter pills', () => {
      render(<FootballPlayers />);
      expect(screen.getAllByText('QB')[0]).toBeTruthy();
      expect(screen.getByText('RB')).toBeTruthy();
      expect(screen.getByText('WR')).toBeTruthy();
      expect(screen.getByText('TE')).toBeTruthy();
      expect(screen.getByText('FLEX')).toBeTruthy();
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
            variables: { position?: string; nflTeam?: string; search?: string };
          },
        ]
      >;
      const firstCall = calls[0];
      expect(firstCall[0].variables.position).toBeUndefined();
      expect(firstCall[0].variables.nflTeam).toBeUndefined();
      expect(firstCall[0].variables.search).toBeUndefined();
    });
  });

  describe('position filter', () => {
    function lastPositions(): string[] | undefined {
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[] } },
      ];
      return lastCall[0].variables.positions;
    }

    it('hides SUPERFLEX and IDP pills for free users', () => {
      mockUseHasEntitlement.mockReturnValue(false);
      render(<FootballPlayers />);
      expect(screen.queryByText('SUPERFLEX')).toBeNull();
      expect(screen.queryByText('IDP')).toBeNull();
    });

    it('shows SUPERFLEX and IDP pills for premium users', () => {
      mockUseHasEntitlement.mockReturnValue(true);
      render(<FootballPlayers />);
      expect(screen.getByText('SUPERFLEX')).toBeTruthy();
      expect(screen.getByText('IDP')).toBeTruthy();
    });

    it('drops premium positions when advanced_search_filters entitlement is revoked', () => {
      mockUseHasEntitlement.mockReturnValue(true);
      const { rerender } = render(<FootballPlayers />);

      // Select SUPERFLEX while premium
      fireEvent.press(screen.getByText('SUPERFLEX'));
      expect(lastPositions()).toEqual(['SUPERFLEX']);

      // Simulate entitlement revocation (downgrade)
      mockUseHasEntitlement.mockReturnValue(false);
      void act(() => {
        rerender(<FootballPlayers />);
      });

      // Downgrade guard useEffect drops premium positions → query gets undefined
      expect(lastPositions()).toBeUndefined();
    });

    it('passes selected position to query when a pill is pressed', () => {
      render(<FootballPlayers />);
      // Pills are rendered first in the FlatList before any player content;
      // use getAllByText and pick the first occurrence (the pill).
      fireEvent.press(screen.getAllByText('QB')[0]);
      expect(lastPositions()).toEqual(['QB']);
    });

    it('accumulates multiple positions for multi-select (LS-6464)', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getAllByText('QB')[0]);
      fireEvent.press(screen.getAllByText('RB')[0]);
      expect(lastPositions()).toEqual(['QB', 'RB']);
    });

    it('toggles a position off when its pill is pressed again', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getAllByText('QB')[0]);
      fireEvent.press(screen.getAllByText('RB')[0]);
      fireEvent.press(screen.getAllByText('QB')[0]);
      expect(lastPositions()).toEqual(['RB']);
    });

    it('passes undefined positions when "All" pill is selected', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getAllByText('QB')[0]);
      fireEvent.press(screen.getByText('All'));
      expect(lastPositions()).toBeUndefined();
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

  describe('navigation', () => {
    it('navigates to the player detail screen when a card is pressed', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getByText('Patrick Mahomes'));
      expect(mockPush).toHaveBeenCalledWith('/football/players/1');
    });
  });

  describe('premium projections gating (LS-7066)', () => {
    it('shows projections upsell banner for free users', () => {
      mockUseHasEntitlement.mockReturnValue(false);
      render(<FootballPlayers />);
      expect(screen.getByText('Fantasy Projections — Premium')).toBeTruthy();
    });

    it('hides projections upsell banner for premium users', () => {
      mockUseHasEntitlement.mockReturnValue(true);
      render(<FootballPlayers />);
      expect(screen.queryByText('Fantasy Projections — Premium')).toBeNull();
    });

    it('shows PROJ chip for premium users with projected points', () => {
      mockUseHasEntitlement.mockReturnValue(true);
      const playerWithProjection = {
        ...QB_PLAYER,
        projectedFantasyPoints: 312.5,
      };
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [playerWithProjection],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      render(<FootballPlayers />);
      expect(screen.getByText('PROJ')).toBeTruthy();
      expect(screen.getByText('312.5')).toBeTruthy();
    });

    it('does not show PROJ chip for free users', () => {
      mockUseHasEntitlement.mockReturnValue(false);
      const playerWithProjection = {
        ...QB_PLAYER,
        projectedFantasyPoints: 312.5,
      };
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [playerWithProjection],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      render(<FootballPlayers />);
      expect(screen.queryByText('PROJ')).toBeNull();
    });

    it('shows em-dash for premium users when projectedFantasyPoints is null', () => {
      mockUseHasEntitlement.mockReturnValue(true);
      const playerWithoutProjection = {
        ...QB_PLAYER,
        projectedFantasyPoints: null,
      };
      mockUseFootballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: {
          footballPlayers: {
            nodes: [playerWithoutProjection],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      render(<FootballPlayers />);
      expect(screen.getByText('PROJ')).toBeTruthy();
      expect(screen.getByText('—')).toBeTruthy();
    });

    it('gates on football_projections entitlement', () => {
      render(<FootballPlayers />);
      expect(mockUseHasEntitlement).toHaveBeenCalledWith(
        'football_projections',
      );
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
});
