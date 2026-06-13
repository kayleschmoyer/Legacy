import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Import the component under test ──────────────────────────────────────────
import Layout from './_layout';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
  ActivityIndicator: React.ComponentType;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock expo-router (Stack navigator + Redirect)
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Text } = require('react-native') as RNComponents;

  const Stack = ({ children }: { children: React.ReactNode }) => (
    <View testID="stack-navigator">{children}</View>
  );

  Stack.Screen = ({
    name,
    options,
  }: {
    name: string;
    options?: Record<string, unknown>;
  }) => (
    <View testID={`screen-${name}`}>
      <Text testID={`opts-${name}`}>
        {JSON.stringify({ name, ...(options ?? {}) })}
      </Text>
    </View>
  );

  return {
    Stack,
    Redirect: ({ href }: { href: string }) => (
      <Text testID="redirect">{`Redirect:${href}`}</Text>
    ),
  };
});

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as RNComponents;
  return {
    GestureHandlerRootView: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      style?: Record<string, unknown>;
    }) => <View {...props}>{children}</View>,
    gestureHandlerRootHOC: (Component: React.ComponentType) => Component,
  };
});

// Mock @legacy-sports/shared-components
jest.mock('@legacy-sports/shared-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, ActivityIndicator } = require('react-native') as RNComponents;
  return {
    BrandedSplash: () => (
      <View testID="branded-splash">
        <ActivityIndicator />
      </View>
    ),
  };
});

// Mock auth hooks
const mockCurrentUser = { id: 1, name: 'Test User' };
const mockUseCurrentUserInfo = jest.fn(() => ({
  data: mockCurrentUser as { id: number; name: string } | null,
  loading: false,
}));
jest.mock('../../common/auth/AuthHooks', () => ({
  useCurrentUserInfo: (...args: unknown[]) => mockUseCurrentUserInfo(...args),
}));

// Mock AuthorizedUserContext
jest.mock('../../common/auth/AuthorizedUserContext', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as RNComponents;
  return {
    AuthorizedUserContextProvider: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <View testID="auth-context">{children}</View>,
  };
});

// Mock push notifications hook
jest.mock('../../features/notifications/hooks/usePushNotifications', () => ({
  usePushNotifications: jest.fn(),
}));

// Mock the header-bearing route modules (named header exports only)
jest.mock('./baseball/league/[leagueId]', () => ({
  __esModule: true,
  default: () => 'LeagueId',
  LeagueIdHeader: () => 'League',
}));
jest.mock('./football/league/[leagueId]', () => ({
  __esModule: true,
  default: () => 'FootballLeagueId',
  FootballLeagueIdHeader: () => 'FootballLeague',
}));
jest.mock('./league/[leagueId]', () => ({
  __esModule: true,
  default: () => 'LeagueContext',
  LeagueContextHeader: () => 'League',
}));
jest.mock('./baseball/team/[teamId]', () => ({
  __esModule: true,
  default: () => 'Team',
  TeamIdHeader: () => 'Team',
}));
jest.mock('./football/team/[teamId]', () => ({
  __esModule: true,
  default: () => 'FootballTeam',
  FootballTeamHeader: () => 'FootballTeam',
}));

// ── Expected data ────────────────────────────────────────────────────────────

const EXPECTED_SCREENS = [
  '(tabs)',
  'index',
  'baseball/index',
  'football/index',
  'league/create',
  'league/join',
  'baseball/league/create',
  'football/league/create',
  'baseball/league/join',
  'football/league/join',
  'league-discovery',
  'league/[leagueId]',
  'baseball/league/[leagueId]',
  'football/league/[leagueId]',
  'baseball/team/[teamId]',
  'football/team/[teamId]',
  'baseball/matchup',
  'football/matchup',
  'DraftBoardPage',
  'FreeAgents',
  'PlayerStats',
  'PlayerDetail',
  'DirectMessages',
  'management',
  'games/index',
  'disclosure-game/index',
  'season-draft/index',
  'season-draft/[gameId]',
  'season-draft/create',
  'season-draft/join',
  'baseball/scoreboard',
  'about',
  'help',
  'profile-settings',
  'preferences',
  'notifications',
  'subscription-settings',
  'update-check',
];

// Screens intentionally removed from navigation (drawer removal).
const REMOVED_FROM_NAV = [
  'view_game_logs',
  'view_career_stats',
  'TradeCenterPage',
  'admin-revenue',
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('App (tabs) Stack Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCurrentUserInfo.mockReturnValue({
      data: mockCurrentUser,
      loading: false,
    });
  });

  describe('navigation structure', () => {
    it('renders a Stack navigator (the flat drawer is removed)', () => {
      render(<Layout />);
      expect(screen.getByTestId('stack-navigator')).toBeTruthy();
    });

    it('registers every expected screen in the stack', () => {
      render(<Layout />);
      for (const name of EXPECTED_SCREENS) {
        expect(screen.getByTestId(`screen-${name}`)).toBeTruthy();
      }
    });

    it('hides the header on the (tabs) group and the index redirect', () => {
      render(<Layout />);
      // Both the tab group and the `/` redirect opt out of a stack header so
      // there is no chrome stacked above the tab bar / during the redirect.
      expect(
        screen.getByText(
          JSON.stringify({ name: '(tabs)', headerShown: false }),
        ),
      ).toBeTruthy();
      expect(
        screen.getByText(JSON.stringify({ name: 'index', headerShown: false })),
      ).toBeTruthy();
    });

    it('no longer registers screens removed from navigation', () => {
      render(<Layout />);
      for (const name of REMOVED_FROM_NAV) {
        expect(screen.queryByTestId(`screen-${name}`)).toBeNull();
      }
    });
  });

  describe('auth-dependent rendering', () => {
    it('renders the navigator when the user is authenticated', () => {
      render(<Layout />);
      expect(screen.getByTestId('stack-navigator')).toBeTruthy();
    });

    it('shows the branded splash while user data is loading', () => {
      mockUseCurrentUserInfo.mockReturnValue({ data: null, loading: true });
      render(<Layout />);
      expect(screen.getByTestId('branded-splash')).toBeTruthy();
    });

    it('redirects to login when the user is not authenticated', () => {
      mockUseCurrentUserInfo.mockReturnValue({ data: null, loading: false });
      render(<Layout />);
      expect(screen.getByTestId('redirect')).toBeTruthy();
      expect(screen.getByText('Redirect:/login')).toBeTruthy();
    });

    it('wraps content with AuthorizedUserContextProvider', () => {
      render(<Layout />);
      expect(screen.getByTestId('auth-context')).toBeTruthy();
    });
  });
});
