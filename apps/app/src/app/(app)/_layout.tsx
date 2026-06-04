import { Redirect, useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Separator, Text, XStack, YStack } from 'tamagui';
import { getExpoPushTokenAsync } from 'expo-notifications';
import { useFeatureIsOn } from '@growthbook/growthbook-react';
import { LOGGER } from '@legacy-sports/logging';
import { UnifiedLoadingPanel } from '@legacy-sports/shared-components';

import { LeagueIdHeader } from './baseball/league/[leagueId]';
import { FootballLeagueIdHeader } from './football/league/[leagueId]';
import { TeamIdHeader } from './baseball/team/[teamId]';
import { FootballTeamHeader } from './football/team/[teamId]';
import {
  useDisableDeviceTokenMutation,
  useGetUnreadNotificationCountQuery,
} from '../../api/db/graphql.generated';
import { AuthorizedUserContextProvider } from '../../common/auth/AuthorizedUserContext';
import {
  useAuthHandlers,
  useCurrentUserInfo,
} from '../../common/auth/AuthHooks';
import { usePushNotifications } from '../../features/notifications/hooks/usePushNotifications';
import { isPhysicalDevice } from '../../common/utilities/DeviceUtils';

export type AppDrawerParamList = {
  '(tabs)': undefined;
  index: undefined;
  view_game_logs: undefined;
  view_career_stats: undefined;
  'baseball/index': undefined;
  'baseball/league/create': undefined;
  'baseball/league/join': undefined;
  'baseball/mock-draft': undefined;
  'baseball/matchup': { matchupId: string; leagueId: string };
  'football/index': undefined;
  'football/players': undefined;
  'football/league/create': undefined;
  'football/league/join': undefined;
  'football/matchup': { matchupId: string; leagueId: string };
  DraftBoardPage: { leagueId?: string } | undefined;
  'league-discovery': undefined;
  'games/index': undefined;
  'disclosure-game/index': undefined;
  'season-draft/index': undefined;
  'season-draft/[gameId]': { gameId: string };
  'season-draft/create': undefined;
  TradeCenterPage: undefined;
  FreeAgents: undefined;
  PlayerStats: undefined;
  PlayerComparison: undefined;
  PlayerDetail: { playerId: string; playerName: string };
  'baseball/league/[leagueId]': { leagueId: string };
  'football/league/[leagueId]': { leagueId: string };
  'baseball/team/[teamId]': { teamId: string };
  'football/team/[teamId]': { teamId: string };
  DirectMessages: undefined;
  management: undefined;
  about: undefined;
  help: undefined;
  'profile-settings': undefined;
  preferences: undefined;
  notifications: undefined;
  'subscription-settings': undefined;
  'update-check': undefined;
};

interface DrawerNavigationLike {
  closeDrawer: () => void;
}

interface Route {
  title: string;
  route: keyof AppDrawerParamList;
}

const ROUTES = Object.freeze<Route[]>([
  {
    route: '(tabs)',
    title: 'Dashboard',
  },
  {
    route: 'index',
    title: 'Home',
  },
  {
    route: 'view_game_logs',
    title: 'View Game Logs',
  },
  {
    route: 'view_career_stats',
    title: 'View Career Stats',
  },
  {
    route: 'PlayerStats',
    title: 'Player Statistics',
  },
  {
    route: 'PlayerComparison',
    title: 'Compare Players',
  },
  {
    route: 'baseball/index',
    title: 'Baseball',
  },
  {
    route: 'baseball/league/create',
    title: 'Create League',
  },
  {
    route: 'baseball/mock-draft',
    title: 'Mock Draft',
  },
  {
    route: 'football/index',
    title: 'Football',
  },
  {
    route: 'football/players',
    title: 'Football Players',
  },
  {
    route: 'DraftBoardPage',
    title: 'Draft Board',
  },
  {
    route: 'games/index',
    title: 'Minigames',
  },
  {
    route: 'season-draft/index',
    title: 'Season Draft Games',
  },
  {
    route: 'FreeAgents',
    title: 'Free Agents',
  },
  {
    route: 'TradeCenterPage',
    title: 'Trade Center',
  },
  {
    route: 'DirectMessages',
    title: 'Messages',
  },
  {
    route: 'management',
    title: 'Management',
  },
  {
    route: 'baseball/league/join',
    title: 'Join League',
  },
  {
    route: 'football/league/join',
    title: 'Join Football League',
  },
  {
    route: 'league-discovery',
    title: 'Browse Leagues',
  },
  {
    route: 'notifications',
    title: 'Notifications',
  },
  {
    route: 'preferences',
    title: 'Preferences',
  },
  {
    route: 'profile-settings',
    title: 'Profile Settings',
  },
  {
    route: 'help',
    title: 'Help',
  },
  {
    route: 'about',
    title: 'About',
  },
  ...(Platform.OS === 'android'
    ? [
        {
          route: 'update-check' as const,
          title: 'Check for Updates',
        },
      ]
    : []),
]);

function CustomDrawerContent(props: {
  navigation: DrawerNavigationLike;
}): React.JSX.Element {
  const router = useRouter();
  const { logout } = useAuthHandlers();
  const [disableDeviceToken] = useDisableDeviceTokenMutation();
  const { data: unreadData } = useGetUnreadNotificationCountQuery();
  const unreadCount = unreadData?.getUnreadNotificationCount ?? 0;
  const footballEnabled = useFeatureIsOn('football_enabled');
  const { data: currentUser } = useCurrentUserInfo();
  const isAdmin = currentUser?.isAdmin ?? false;
  const visibleRoutes = footballEnabled
    ? ROUTES
    : ROUTES.filter(
        (r) => r.route !== 'football/index' && r.route !== 'football/players',
      );

  const doLogout = async () => {
    // Best-effort: deactivate push token before clearing credentials
    if (isPhysicalDevice) {
      try {
        const tokenData = await getExpoPushTokenAsync();
        await disableDeviceToken({
          variables: { deviceToken: tokenData.data },
        });
      } catch (err) {
        LOGGER.warn(
          'Could not deactivate push token on logout:',
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    await logout();
    props.navigation.closeDrawer();
  };

  const onItemSelect = (route: keyof AppDrawerParamList): void => {
    router.navigate(route);
    props.navigation.closeDrawer();
  };

  return (
    <YStack
      testID="drawer-content"
      flex={1}
      backgroundColor="$background"
      padding="$4"
    >
      {visibleRoutes.map((r) => (
        <XStack
          testID={`drawer-item-${r.route.replace(/\//g, '-')}`}
          key={r.route}
          padding="$3"
          alignItems="center"
          justifyContent="space-between"
          onPress={() => onItemSelect(r.route)}
          pressStyle={{ backgroundColor: '$gray3' }}
        >
          <Text fontSize="$5">{r.title}</Text>
          {r.route === 'notifications' && unreadCount > 0 && (
            <XStack
              backgroundColor="$red10"
              borderRadius="$10"
              paddingHorizontal="$2"
              paddingVertical="$0.5"
              minWidth={22}
              alignItems="center"
              justifyContent="center"
            >
              <Text
                fontSize="$1"
                fontWeight="700"
                color="white"
                textAlign="center"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </XStack>
          )}
        </XStack>
      ))}
      {isAdmin && (
        <Text
          testID="drawer-admin-web-notice"
          padding="$3"
          fontSize="$3"
          color="$gray10"
        >
          Use the web dashboard for admin tools
        </Text>
      )}
      <Separator marginVertical="$3" />
      <Text
        testID="drawer-logout"
        padding="$3"
        fontSize="$5"
        color="$red10"
        onPress={() => {
          void doLogout();
        }}
        pressStyle={{ backgroundColor: '$gray3' }}
      >
        Logout
      </Text>
    </YStack>
  );
}

export default function Layout() {
  const { data: currentUser, loading } = useCurrentUserInfo();

  usePushNotifications(currentUser?.id ?? null);

  if (loading) {
    return <UnifiedLoadingPanel />;
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  return (
    <AuthorizedUserContextProvider>
      <GestureHandlerRootView testID="gesture-handler" style={{ flex: 1 }}>
        <Drawer
          drawerContent={(props: { navigation: DrawerNavigationLike }) => (
            <CustomDrawerContent {...props} />
          )}
          screenOptions={{
            headerStyle: {
              backgroundColor: '#f5f5f5',
            },
          }}
        >
          <Drawer.Screen
            name="(tabs)"
            options={{
              drawerLabel: 'Dashboard',
              title: 'Dashboard',
            }}
          />
          <Drawer.Screen
            name="index"
            options={{
              drawerLabel: 'Home',
              title: '',
            }}
          />
          <Drawer.Screen name="view_game_logs" />
          <Drawer.Screen name="view_career_stats" />
          <Drawer.Screen
            name="football/index"
            options={{ title: 'Football Home' }}
          />
          <Drawer.Screen
            name="football/players"
            options={{ title: 'Football Players' }}
          />
          <Drawer.Screen
            name="football/league/create"
            options={{
              drawerLabel: () => null,
              headerShown: true,
              headerTitle: 'Create Football League',
            }}
          />
          <Drawer.Screen
            name="baseball/index"
            options={{ title: 'Baseball Home' }}
          />
          <Drawer.Screen
            name="baseball/league/create"
            options={{
              drawerLabel: () => null,
              headerShown: true,
              headerTitle: 'Create League',
            }}
          />
          <Drawer.Screen
            name="baseball/mock-draft"
            options={{ title: 'Mock Draft' }}
          />
          <Drawer.Screen
            name="baseball/league/[leagueId]"
            options={{ headerTitle: LeagueIdHeader }}
          />
          <Drawer.Screen
            name="football/league/[leagueId]"
            options={{ headerTitle: FootballLeagueIdHeader }}
          />
          <Drawer.Screen
            name="baseball/team/[teamId]"
            options={{
              drawerLabel: () => null,
              headerShown: true,
              headerTitle: () => <TeamIdHeader />,
            }}
          />
          <Drawer.Screen
            name="football/team/[teamId]"
            options={{
              drawerLabel: () => null,
              headerShown: true,
              headerTitle: () => <FootballTeamHeader />,
            }}
          />
          <Drawer.Screen
            name="DraftBoardPage"
            options={{ title: 'Draft Board' }}
          />
          <Drawer.Screen name="games/index" options={{ title: 'Minigames' }} />
          <Drawer.Screen
            name="disclosure-game/index"
            options={{
              drawerLabel: () => null,
              title: 'Who Am I?',
            }}
          />
          <Drawer.Screen
            name="season-draft/index"
            options={{ title: 'Season Draft Games' }}
          />
          <Drawer.Screen
            name="season-draft/[gameId]"
            options={{
              drawerLabel: () => null,
              title: 'Season Draft Game',
            }}
          />
          <Drawer.Screen
            name="season-draft/create"
            options={{
              drawerLabel: () => null,
              title: 'Create Season Draft Game',
            }}
          />
          <Drawer.Screen name="FreeAgents" options={{ title: 'Free Agents' }} />
          <Drawer.Screen
            name="TradeCenterPage"
            options={{ title: 'Trade Center' }}
          />
          <Drawer.Screen
            name="PlayerStats"
            options={{ title: 'Player Statistics' }}
          />
          <Drawer.Screen
            name="PlayerComparison"
            options={{ title: 'Player Comparison' }}
          />
          <Drawer.Screen
            name="PlayerDetail"
            options={{ title: 'Player Details' }}
          />
          <Drawer.Screen
            name="DirectMessages"
            options={{ title: 'Messages' }}
          />
          <Drawer.Screen name="management" options={{ title: 'Management' }} />
          <Drawer.Screen
            name="baseball/league/join"
            options={{ title: 'Join League' }}
          />
          <Drawer.Screen
            name="football/league/join"
            options={{ title: 'Join Football League' }}
          />
          <Drawer.Screen
            name="league-discovery"
            options={{ title: 'Browse Leagues' }}
          />
          <Drawer.Screen
            name="baseball/matchup"
            options={{ drawerLabel: () => null, title: 'Matchup Detail' }}
          />
          <Drawer.Screen
            name="football/matchup"
            options={{ drawerLabel: () => null, title: 'Matchup Detail' }}
          />
          <Drawer.Screen name="about" options={{ title: 'About' }} />
          <Drawer.Screen name="help" options={{ title: 'Help & Support' }} />
          <Drawer.Screen
            name="profile-settings"
            options={{ title: 'Profile Settings' }}
          />
          <Drawer.Screen
            name="preferences"
            options={{ title: 'Preferences' }}
          />
          <Drawer.Screen
            name="notifications"
            options={{ title: 'Notifications' }}
          />
          <Drawer.Screen
            name="subscription-settings"
            options={{
              drawerLabel: () => null,
              title: 'Subscription & Billing',
            }}
          />
          <Drawer.Screen
            name="update-check"
            options={{ title: 'Check for Updates' }}
          />
        </Drawer>
      </GestureHandlerRootView>
    </AuthorizedUserContextProvider>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
