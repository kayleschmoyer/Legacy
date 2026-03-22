import { Redirect, useRouter } from 'expo-router';
import {
  createDrawerNavigator,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Separator, Text, YStack } from 'tamagui';
import { getExpoPushTokenAsync } from 'expo-notifications';
import { LOGGER } from '@legacy-sports/logging';
import { UnifiedLoadingPanel } from '@legacy-sports/shared-components';

import BaseballHome from './baseball';
import DraftBoardPage from './DraftBoardPage';
import FootballHome from './football';
import SeasonDraftGamesScreen from './season-draft';
import SeasonDraftGameScreen from './season-draft/[gameId]';
import SeasonDraftGameCreateScreen from './season-draft/create';
import PlayerDetail from './PlayerDetail';
import PlayerStats from './PlayerStats';
import ViewCareerStats from './view_career_stats';
import ViewGameLogs from './view_game_logs';
import LeagueId, { LeagueIdHeader } from './baseball/league/[leagueId]';
import LeagueCreatePage from './baseball/league/create';
import JoinLeagueByCode from './baseball/league/join';
import MatchupDetail from './baseball/matchup';
import Team, { TeamIdHeader } from './baseball/team/[teamId]';
import FreeAgents from './FreeAgents';
import ManagementScreen from './management';
import AboutScreen from './about';
import HelpScreen from './help';
import ProfileSettingsScreen from './profile-settings';
import PreferencesScreen from './preferences';
import NotificationsScreen from './notifications';
import SubscriptionSettingsScreen from './subscription-settings';
import { useDisableDeviceTokenMutation } from '../../api/db/graphql.generated';
import { AuthorizedUserContextProvider } from '../../common/auth/AuthorizedUserContext';
import {
  useAuthHandlers,
  useCurrentUserInfo,
} from '../../common/auth/AuthHooks';
import { usePushNotifications } from '../../features/notifications/hooks/usePushNotifications';
import { isPhysicalDevice } from '../../common/utilities/DeviceUtils';
import Home from '.';

export type AppDrawerParamList = {
  index: undefined;
  view_game_logs: undefined;
  view_career_stats: undefined;
  'baseball/index': undefined;
  'baseball/league/create': undefined;
  'baseball/league/join': undefined;
  'baseball/matchup': { matchupId: string; leagueId: string };
  'football/index': undefined;
  DraftBoardPage: undefined;
  'season-draft/index': undefined;
  'season-draft/[gameId]': { gameId: string };
  'season-draft/create': undefined;
  FreeAgents: undefined;
  PlayerStats: undefined;
  PlayerDetail: { playerId: string; playerName: string };
  'baseball/league/[leagueId]': { leagueId: string };
  'baseball/team/[teamId]': { teamId: string };
  management: undefined;
  about: undefined;
  help: undefined;
  'profile-settings': undefined;
  preferences: undefined;
  notifications: undefined;
  'subscription-settings': undefined;
};

const { Navigator, Screen } = createDrawerNavigator<AppDrawerParamList>();

interface Route {
  title: string;
  route: keyof AppDrawerParamList;
}

const ROUTES = Object.freeze<Route[]>([
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
    route: 'baseball/index',
    title: 'Baseball',
  },
  {
    route: 'baseball/league/create',
    title: 'Create League',
  },
  {
    route: 'football/index',
    title: 'Football',
  },
  {
    route: 'DraftBoardPage',
    title: 'Draft Board',
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
    route: 'management',
    title: 'Management',
  },
  {
    route: 'baseball/league/join',
    title: 'Join League',
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
]);

function CustomDrawerContent(
  props: DrawerContentComponentProps,
): React.JSX.Element {
  const router = useRouter();
  const { logout } = useAuthHandlers();
  const [disableDeviceToken] = useDisableDeviceTokenMutation();

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
    <YStack flex={1} backgroundColor="$background" padding="$4">
      {ROUTES.map((r) => (
        <Text
          key={r.route}
          padding="$3"
          fontSize="$5"
          onPress={() => onItemSelect(r.route)}
          pressStyle={{ backgroundColor: '$gray3' }}
        >
          {r.title}
        </Text>
      ))}
      <Separator marginVertical="$3" />
      <Text
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
      <GestureHandlerRootView data-testid="gesture-handler" style={{ flex: 1 }}>
        <Navigator
          drawerContent={(props: DrawerContentComponentProps) => (
            <CustomDrawerContent {...props} />
          )}
          screenOptions={{
            headerStyle: {
              backgroundColor: '#f5f5f5',
            },
          }}
        >
          <Screen
            name="index"
            options={{
              drawerLabel: 'Home',
              title: '',
            }}
            component={Home}
          />
          <Screen name="view_game_logs" component={ViewGameLogs} />
          <Screen name="view_career_stats" component={ViewCareerStats} />
          <Screen
            name="football/index"
            options={{ title: 'Football Home' }}
            component={FootballHome}
          />
          <Screen
            name="baseball/index"
            options={{ title: 'Baseball Home' }}
            component={BaseballHome}
          />
          <Screen
            name="baseball/league/create"
            options={{
              drawerLabel: () => null,
              headerShown: true,
              headerTitle: 'Create League',
            }}
            component={LeagueCreatePage}
          />
          <Screen
            name="baseball/league/[leagueId]"
            options={{ headerTitle: LeagueIdHeader }}
            component={LeagueId}
          />
          <Screen
            name="baseball/team/[teamId]"
            options={{
              drawerLabel: () => null,
              headerShown: true,
              headerTitle: () => <TeamIdHeader />,
            }}
            component={Team}
          />
          <Screen
            name="DraftBoardPage"
            options={{ title: 'Draft Board' }}
            component={DraftBoardPage}
          />
          <Screen
            name="season-draft/index"
            options={{ title: 'Season Draft Games' }}
            component={SeasonDraftGamesScreen}
          />
          <Screen
            name="season-draft/[gameId]"
            options={{
              drawerLabel: () => null,
              title: 'Season Draft Game',
            }}
            component={SeasonDraftGameScreen}
          />
          <Screen
            name="season-draft/create"
            options={{
              drawerLabel: () => null,
              title: 'Create Season Draft Game',
            }}
            component={SeasonDraftGameCreateScreen}
          />
          <Screen
            name="FreeAgents"
            options={{ title: 'Free Agents' }}
            component={FreeAgents}
          />
          <Screen
            name="PlayerStats"
            options={{ title: 'Player Statistics' }}
            component={PlayerStats}
          />
          <Screen
            name="PlayerDetail"
            options={{ title: 'Player Details' }}
            component={PlayerDetail}
          />
          <Screen
            name="management"
            options={{ title: 'Management' }}
            component={ManagementScreen}
          />
          <Screen
            name="baseball/league/join"
            options={{ title: 'Join League' }}
            component={JoinLeagueByCode}
          />
          <Screen
            name="baseball/matchup"
            options={{ drawerLabel: () => null, title: 'Matchup Detail' }}
            component={MatchupDetail}
          />
          <Screen
            name="about"
            options={{ title: 'About' }}
            component={AboutScreen}
          />
          <Screen
            name="help"
            options={{ title: 'Help & Support' }}
            component={HelpScreen}
          />
          <Screen
            name="profile-settings"
            options={{ title: 'Profile Settings' }}
            component={ProfileSettingsScreen}
          />
          <Screen
            name="preferences"
            options={{ title: 'Preferences' }}
            component={PreferencesScreen}
          />
          <Screen
            name="notifications"
            options={{ title: 'Notifications' }}
            component={NotificationsScreen}
          />
          <Screen
            name="subscription-settings"
            options={{
              drawerLabel: () => null,
              title: 'Subscription & Billing',
            }}
            component={SubscriptionSettingsScreen}
          />
        </Navigator>
      </GestureHandlerRootView>
    </AuthorizedUserContextProvider>
  );
}
