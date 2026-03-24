import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Import the component under test ──────────────────────────────────────────
import Layout from './_layout';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
  ActivityIndicator: React.ComponentType;
};

interface MockDrawerContentProps {
  navigation: { closeDrawer: jest.Mock; navigate: jest.Mock };
  state: { routes: unknown[]; index: number };
  descriptors: Record<string, unknown>;
}

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock expo-router
const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native') as RNComponents;
  return {
    useRouter: () => ({ navigate: mockNavigate }),
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

// Mock @react-navigation/drawer
const mockCloseDrawer = jest.fn();

jest.mock('@react-navigation/drawer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Text } = require('react-native') as RNComponents;

  return {
    createDrawerNavigator: () => ({
      Navigator: ({
        children,
        drawerContent,
      }: {
        children: React.ReactNode;
        drawerContent?: (props: MockDrawerContentProps) => React.ReactNode;
        screenOptions?: Record<string, unknown>;
      }) => (
        <View testID="drawer-navigator">
          {drawerContent?.({
            navigation: {
              closeDrawer: mockCloseDrawer,
              navigate: jest.fn(),
            },
            state: { routes: [], index: 0 },
            descriptors: {},
          })}
          {children}
        </View>
      ),
      Screen: ({
        name,
        component: _component,
      }: {
        name: string;
        component: React.ComponentType;
        options?: Record<string, unknown>;
      }) => (
        <View testID={`screen-${name}`}>
          <Text>{name}</Text>
        </View>
      ),
    }),
  };
});

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'mock-token' }),
}));

// Mock expo-device
jest.mock('expo-device', () => ({ isDevice: false }));

// Mock @legacy-sports/logging
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock @legacy-sports/shared-components
jest.mock('@legacy-sports/shared-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, ActivityIndicator } = require('react-native') as RNComponents;
  return {
    UnifiedLoadingPanel: () => (
      <View testID="loading-panel">
        <ActivityIndicator />
      </View>
    ),
  };
});

// Mock tamagui
jest.mock('tamagui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Text: RNText } = require('react-native') as RNComponents;
  return {
    Text: ({
      children,
      onPress,
      color: _color,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      color?: string;
      testID?: string;
      padding?: string;
      fontSize?: string;
      pressStyle?: Record<string, unknown>;
    }) => (
      <RNText onPress={onPress} {...rest}>
        {children}
      </RNText>
    ),
    YStack: ({
      children,
      ...rest
    }: {
      children: React.ReactNode;
      flex?: number;
      backgroundColor?: string;
      padding?: string;
    }) => <View {...rest}>{children}</View>,
    Separator: () => <View testID="separator" />,
  };
});

// Mock the GraphQL mutation
const mockDisableDeviceToken = jest.fn().mockResolvedValue({});
jest.mock('../../api/db/graphql.generated', () => ({
  useDisableDeviceTokenMutation: () => [mockDisableDeviceToken],
}));

// Mock auth hooks
const mockLogout = jest.fn().mockResolvedValue(undefined);
const mockCurrentUser = { id: 1, name: 'Test User' };
const mockUseCurrentUserInfo = jest.fn(() => ({
  data: mockCurrentUser,
  loading: false,
}));
jest.mock('../../common/auth/AuthHooks', () => ({
  useAuthHandlers: () => ({ logout: mockLogout }),
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

// Mock DeviceUtils
jest.mock('../../common/utilities/DeviceUtils', () => ({
  isPhysicalDevice: false,
}));

// Mock all screen components with inline factories (jest.mock is hoisted)
jest.mock('./baseball', () => ({
  __esModule: true,
  default: () => 'BaseballHome',
}));
jest.mock('./DraftBoardPage', () => ({
  __esModule: true,
  default: () => 'DraftBoardPage',
}));
jest.mock('./football', () => ({
  __esModule: true,
  default: () => 'FootballHome',
}));
jest.mock('./season-draft', () => ({
  __esModule: true,
  default: () => 'SeasonDraftGamesScreen',
}));
jest.mock('./season-draft/[gameId]', () => ({
  __esModule: true,
  default: () => 'SeasonDraftGameScreen',
}));
jest.mock('./season-draft/create', () => ({
  __esModule: true,
  default: () => 'SeasonDraftGameCreateScreen',
}));
jest.mock('./PlayerDetail', () => ({
  __esModule: true,
  default: () => 'PlayerDetail',
}));
jest.mock('./PlayerStats', () => ({
  __esModule: true,
  default: () => 'PlayerStats',
}));
jest.mock('./view_career_stats', () => ({
  __esModule: true,
  default: () => 'ViewCareerStats',
}));
jest.mock('./view_game_logs', () => ({
  __esModule: true,
  default: () => 'ViewGameLogs',
}));
jest.mock('./FreeAgents', () => ({
  __esModule: true,
  default: () => 'FreeAgents',
}));
jest.mock('./management', () => ({
  __esModule: true,
  default: () => 'ManagementScreen',
}));
jest.mock('./about', () => ({
  __esModule: true,
  default: () => 'AboutScreen',
}));
jest.mock('./help', () => ({
  __esModule: true,
  default: () => 'HelpScreen',
}));
jest.mock('./profile-settings', () => ({
  __esModule: true,
  default: () => 'ProfileSettingsScreen',
}));
jest.mock('./preferences', () => ({
  __esModule: true,
  default: () => 'PreferencesScreen',
}));
jest.mock('./notifications', () => ({
  __esModule: true,
  default: () => 'NotificationsScreen',
}));
jest.mock('./subscription-settings', () => ({
  __esModule: true,
  default: () => 'SubscriptionSettingsScreen',
}));
jest.mock('.', () => ({ __esModule: true, default: () => 'Home' }));
jest.mock('./baseball/league/create', () => ({
  __esModule: true,
  default: () => 'LeagueCreatePage',
}));
jest.mock('./baseball/league/join', () => ({
  __esModule: true,
  default: () => 'JoinLeagueByCode',
}));
jest.mock('./baseball/matchup', () => ({
  __esModule: true,
  default: () => 'MatchupDetail',
}));
jest.mock('./baseball/league/[leagueId]', () => ({
  __esModule: true,
  default: () => 'LeagueId',
  LeagueIdHeader: () => 'League',
}));
jest.mock('./baseball/team/[teamId]', () => ({
  __esModule: true,
  default: () => 'Team',
  TeamIdHeader: () => 'Team',
}));

// ── Expected data ────────────────────────────────────────────────────────────

const EXPECTED_DRAWER_ROUTES = [
  { route: 'index', title: 'Home' },
  { route: 'view_game_logs', title: 'View Game Logs' },
  { route: 'view_career_stats', title: 'View Career Stats' },
  { route: 'PlayerStats', title: 'Player Statistics' },
  { route: 'baseball/index', title: 'Baseball' },
  { route: 'baseball/league/create', title: 'Create League' },
  { route: 'football/index', title: 'Football' },
  { route: 'DraftBoardPage', title: 'Draft Board' },
  { route: 'season-draft/index', title: 'Season Draft Games' },
  { route: 'FreeAgents', title: 'Free Agents' },
  { route: 'management', title: 'Management' },
  { route: 'baseball/league/join', title: 'Join League' },
  { route: 'notifications', title: 'Notifications' },
  { route: 'preferences', title: 'Preferences' },
  { route: 'profile-settings', title: 'Profile Settings' },
  { route: 'help', title: 'Help' },
  { route: 'about', title: 'About' },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('App Drawer Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCurrentUserInfo.mockReturnValue({
      data: mockCurrentUser,
      loading: false,
    });
  });

  describe('drawer route definitions', () => {
    it('renders all expected drawer items', () => {
      render(<Layout />);

      for (const { title } of EXPECTED_DRAWER_ROUTES) {
        expect(screen.getByText(title)).toBeTruthy();
      }
    });

    it('renders exactly 17 navigation items plus Logout', () => {
      render(<Layout />);

      for (const { title } of EXPECTED_DRAWER_ROUTES) {
        expect(screen.getByText(title)).toBeTruthy();
      }
      expect(screen.getByText('Logout')).toBeTruthy();

      // Verify exact count: all pressable text elements (onPress) in the drawer
      const allTextElements = screen.queryAllByText(/.+/);
      const pressableItems = allTextElements.filter(
        (el) => typeof el.props.onPress === 'function',
      );
      expect(pressableItems).toHaveLength(EXPECTED_DRAWER_ROUTES.length + 1);
    });

    it('renders the Logout button', () => {
      render(<Layout />);
      expect(screen.getByText('Logout')).toBeTruthy();
    });
  });

  describe('drawer item navigation', () => {
    it('navigates to Home when Home item is pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Home'));

      expect(mockNavigate).toHaveBeenCalledWith('index');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Baseball when Baseball item is pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Baseball'));

      expect(mockNavigate).toHaveBeenCalledWith('baseball/index');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Football when Football item is pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Football'));

      expect(mockNavigate).toHaveBeenCalledWith('football/index');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Draft Board when Draft Board item is pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Draft Board'));

      expect(mockNavigate).toHaveBeenCalledWith('DraftBoardPage');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Free Agents when Free Agents item is pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Free Agents'));

      expect(mockNavigate).toHaveBeenCalledWith('FreeAgents');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Notifications when Notifications item is pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Notifications'));

      expect(mockNavigate).toHaveBeenCalledWith('notifications');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Preferences when Preferences item is pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Preferences'));

      expect(mockNavigate).toHaveBeenCalledWith('preferences');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Profile Settings when pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Profile Settings'));

      expect(mockNavigate).toHaveBeenCalledWith('profile-settings');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Help when Help item is pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Help'));

      expect(mockNavigate).toHaveBeenCalledWith('help');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to About when About item is pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('About'));

      expect(mockNavigate).toHaveBeenCalledWith('about');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Management when Management item is pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Management'));

      expect(mockNavigate).toHaveBeenCalledWith('management');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Season Draft Games when pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Season Draft Games'));

      expect(mockNavigate).toHaveBeenCalledWith('season-draft/index');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Player Statistics when pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Player Statistics'));

      expect(mockNavigate).toHaveBeenCalledWith('PlayerStats');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to View Game Logs when pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('View Game Logs'));

      expect(mockNavigate).toHaveBeenCalledWith('view_game_logs');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to View Career Stats when pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('View Career Stats'));

      expect(mockNavigate).toHaveBeenCalledWith('view_career_stats');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Create League when pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Create League'));

      expect(mockNavigate).toHaveBeenCalledWith('baseball/league/create');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('navigates to Join League when pressed', () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Join League'));

      expect(mockNavigate).toHaveBeenCalledWith('baseball/league/join');
      expect(mockCloseDrawer).toHaveBeenCalled();
    });

    it('closes drawer after each navigation', () => {
      render(<Layout />);

      fireEvent.press(screen.getByText('Home'));
      expect(mockCloseDrawer).toHaveBeenCalledTimes(1);

      fireEvent.press(screen.getByText('About'));
      expect(mockCloseDrawer).toHaveBeenCalledTimes(2);
    });
  });

  describe('logout flow', () => {
    it('calls logout when Logout is pressed', async () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Logout'));

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });

    it('closes drawer after logout', async () => {
      render(<Layout />);
      fireEvent.press(screen.getByText('Logout'));

      await waitFor(() => {
        expect(mockCloseDrawer).toHaveBeenCalled();
      });
    });
  });

  describe('screen registration', () => {
    it('registers all 24 screens in the drawer navigator', () => {
      render(<Layout />);

      const expectedScreenNames = [
        'index',
        'view_game_logs',
        'view_career_stats',
        'football/index',
        'baseball/index',
        'baseball/league/create',
        'baseball/league/[leagueId]',
        'baseball/team/[teamId]',
        'DraftBoardPage',
        'season-draft/index',
        'season-draft/[gameId]',
        'season-draft/create',
        'FreeAgents',
        'PlayerStats',
        'PlayerDetail',
        'management',
        'baseball/league/join',
        'baseball/matchup',
        'about',
        'help',
        'profile-settings',
        'preferences',
        'notifications',
        'subscription-settings',
      ];

      for (const name of expectedScreenNames) {
        expect(screen.getByTestId(`screen-${name}`)).toBeTruthy();
      }
    });
  });

  describe('auth-dependent rendering', () => {
    it('renders the drawer when user is authenticated', () => {
      render(<Layout />);
      expect(screen.getByTestId('drawer-navigator')).toBeTruthy();
    });

    it('shows loading panel when user data is loading', () => {
      mockUseCurrentUserInfo.mockReturnValue({ data: null, loading: true });

      render(<Layout />);
      expect(screen.getByTestId('loading-panel')).toBeTruthy();
    });

    it('redirects to login when user is not authenticated', () => {
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

  describe('dynamic route parameters (type safety)', () => {
    it('defines leagueId parameter for league detail route', () => {
      render(<Layout />);
      expect(
        screen.getByTestId('screen-baseball/league/[leagueId]'),
      ).toBeTruthy();
    });

    it('defines teamId parameter for team detail route', () => {
      render(<Layout />);
      expect(screen.getByTestId('screen-baseball/team/[teamId]')).toBeTruthy();
    });

    it('defines gameId parameter for season draft game route', () => {
      render(<Layout />);
      expect(screen.getByTestId('screen-season-draft/[gameId]')).toBeTruthy();
    });

    it('defines matchup parameters for matchup detail route', () => {
      render(<Layout />);
      expect(screen.getByTestId('screen-baseball/matchup')).toBeTruthy();
    });
  });
});
