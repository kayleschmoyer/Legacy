import React from 'react';
import { render } from '@testing-library/react-native';
import { colors } from '@legacy-sports/design-tokens';

// ── Import the component under test ──────────────────────────────────────────
import TabsLayout from './_layout';

// ── Mocks ────────────────────────────────────────────────────────────────────

/**
 * Navigator options captured during render. The `mock` prefix is what lets the
 * hoisted `jest.mock` factory below reference this binding.
 */
const mockNav: {
  screenOptions?: Record<string, unknown>;
  /** Tab names in registration order — the tab bar renders in this order. */
  order: string[];
  screens: Record<string, Record<string, unknown> | undefined>;
} = { order: [], screens: {} };

jest.mock('expo-router', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');

  const Tabs = ({
    children,
    screenOptions,
  }: {
    children?: React.ReactNode;
    screenOptions?: Record<string, unknown>;
  }) => {
    mockNav.screenOptions = screenOptions;
    return <View testID="tabs-navigator">{children}</View>;
  };

  Tabs.Screen = ({
    name,
    options,
  }: {
    name: string;
    options?: Record<string, unknown>;
  }) => {
    mockNav.order.push(name);
    mockNav.screens[name] = options;
    return <View testID={`tab-${name}`} />;
  };

  return { Tabs };
});

// Deep icon imports (`@tamagui/lucide-icons/icons/<Name>`) are routed to the
// barrel by apps/app/jest.config.ts (LS-9423), so one barrel mock covers all
// five tab icons.
jest.mock('@tamagui/lucide-icons', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const icon =
    (name: string) =>
    ({ color }: { color?: string; size?: number }) => (
      <View testID={`icon-${name}`} accessibilityLabel={color} />
    );
  return {
    Gamepad2: icon('gamepad2'),
    Home: icon('home'),
    Trophy: icon('trophy'),
    User: icon('user'),
    Users: icon('users'),
  };
});

const mockUnreadCount = jest.fn<
  { data: { getUnreadNotificationCount: number } | undefined },
  []
>(() => ({ data: { getUnreadNotificationCount: 0 } }));
jest.mock('@legacy-sports/graphql', () => ({
  useGetUnreadNotificationCountQuery: () => mockUnreadCount(),
}));

const mockResolvedTheme = jest.fn<'dark' | 'light', []>(() => 'dark');
jest.mock('../../../context/ThemeContext', () => ({
  useThemeContext: () => ({
    resolvedTheme: mockResolvedTheme(),
    themePreference: 'system',
    setThemePreference: jest.fn(),
  }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

/**
 * The five-tab shell is the app's primary navigation surface. These assertions
 * were ported from the retired `apps/app-e2e` WDIO scaffold (LS-8697), where
 * they existed only as string matches against this file's source text.
 */
describe('App (tabs) navigator', () => {
  const EXPECTED_TABS = ['home', 'leagues', 'players', 'games', 'you'];

  beforeEach(() => {
    jest.clearAllMocks();
    mockNav.screenOptions = undefined;
    mockNav.order = [];
    mockNav.screens = {};
    mockUnreadCount.mockReturnValue({
      data: { getUnreadNotificationCount: 0 },
    });
    mockResolvedTheme.mockReturnValue('dark');
  });

  describe('tab registration', () => {
    it('registers exactly the five tabs, in tab-bar order', () => {
      render(<TabsLayout />);

      expect(mockNav.order).toEqual(EXPECTED_TABS);
    });

    it('gives every tab a title and an icon', () => {
      render(<TabsLayout />);

      const titles = EXPECTED_TABS.map((name) => mockNav.screens[name]?.title);
      expect(titles).toEqual(['Home', 'Leagues', 'Players', 'Games', 'You']);

      for (const name of EXPECTED_TABS) {
        expect(typeof mockNav.screens[name]?.tabBarIcon).toBe('function');
      }
    });

    it('hides the native header for every tab', () => {
      render(<TabsLayout />);

      expect(mockNav.screenOptions?.headerShown).toBe(false);
    });

    it('re-enables font scaling on the tab labels (LS-7573)', () => {
      render(<TabsLayout />);

      expect(mockNav.screenOptions?.tabBarAllowFontScaling).toBe(true);
    });
  });

  describe('unread notification badge', () => {
    it('shows no badge on the You tab when nothing is unread', () => {
      render(<TabsLayout />);

      expect(mockNav.screens['you']?.tabBarBadge).toBeUndefined();
    });

    it('badges the You tab with the unread count', () => {
      mockUnreadCount.mockReturnValue({
        data: { getUnreadNotificationCount: 7 },
      });

      render(<TabsLayout />);

      expect(mockNav.screens['you']?.tabBarBadge).toBe(7);
    });

    it('shows no badge while the count query has no data yet', () => {
      mockUnreadCount.mockReturnValue({ data: undefined });

      render(<TabsLayout />);

      expect(mockNav.screens['you']?.tabBarBadge).toBeUndefined();
    });

    it('badges only the You tab', () => {
      mockUnreadCount.mockReturnValue({
        data: { getUnreadNotificationCount: 3 },
      });

      render(<TabsLayout />);

      for (const name of EXPECTED_TABS.filter((tab) => tab !== 'you')) {
        expect(mockNav.screens[name]?.tabBarBadge).toBeUndefined();
      }
    });
  });

  describe('theming', () => {
    it('colors the tab bar from the dark design tokens', () => {
      render(<TabsLayout />);

      expect(mockNav.screenOptions?.tabBarActiveTintColor).toBe(
        colors.dark.text.fg1,
      );
      expect(mockNav.screenOptions?.tabBarInactiveTintColor).toBe(
        colors.dark.text.fg3,
      );
      expect(mockNav.screenOptions?.tabBarStyle).toMatchObject({
        backgroundColor: colors.dark.surface.bg,
        borderTopColor: colors.dark.surface.panelBorder,
      });
    });

    it('follows the resolved theme into light mode', () => {
      mockResolvedTheme.mockReturnValue('light');

      render(<TabsLayout />);

      expect(mockNav.screenOptions?.tabBarActiveTintColor).toBe(
        colors.light.text.fg1,
      );
      expect(mockNav.screenOptions?.tabBarStyle).toMatchObject({
        backgroundColor: colors.light.surface.bg,
      });
    });
  });
});
