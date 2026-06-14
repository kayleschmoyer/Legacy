import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import FootballPlayers from './players';
import { useHasEntitlement } from '../../../features/subscription/useSubscription';

// ── Mocks ────────────────────────────────────────────────────────────────────

// expo-apple-authentication uses ESM export syntax; stub it out so Jest's
// CommonJS runner never tries to parse it (regardless of transformIgnorePatterns
// cache state). The real auth chain is broken anyway by the useSubscription mock.
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
    // Reset entitlement to free-user default so premium tests don't bleed into each other.
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
    it('passes selected position to query when a pill is pressed', () => {
      render(<FootballPlayers />);
      // Pills are rendered first in the FlatList before any player content;
      // use getAllByText and pick the first occurrence (the pill).
      fireEvent.press(screen.getAllByText('QB')[0]);
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[] } },
      ];
      expect(lastCall[0].variables.positions).toEqual(['QB']);
    });

    it('passes undefined positions when "All" pill is selected', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getAllByText('QB')[0]);
      fireEvent.press(screen.getByText('All'));
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[] } },
      ];
      expect(lastCall[0].variables.positions).toBeUndefined();
    });

    it('accumulates multiple positions for multi-select (LS-6464)', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getAllByText('QB')[0]);
      fireEvent.press(screen.getByText('WR'));
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[] } },
      ];
      expect(lastCall[0].variables.positions).toEqual(['QB', 'WR']);
    });

    it('toggles a position off when its pill is pressed again', () => {
      render(<FootballPlayers />);
      fireEvent.press(screen.getAllByText('QB')[0]);
      fireEvent.press(screen.getAllByText('QB')[0]);
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
      fireEvent.press(screen.getByTestId('select-item-AFC'));
      fireEvent.press(screen.getByTestId('select-item-All'));
      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { conference?: string; nflTeam?: string } },
      ];
      expect(lastCall[0].variables.nflTeam).toBeUndefined();
      expect(lastCall[0].variables.conference).toBeUndefined();
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
