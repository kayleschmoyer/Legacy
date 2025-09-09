/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
import { Redirect, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  createDrawerNavigator,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { Separator, Text, YStack } from 'tamagui';
import LeagueId, { LeagueIdHeader } from './baseball/league/[leagueId]';
import Team, { TeamIdHeader } from './baseball/team/[teamId]';
import ViewGameLogs from './view_game_logs';
import ViewCareerStats from './view_career_stats';
import FootballHome from './football';
import BaseballHome from './baseball';
import DraftBoardPage from './DraftBoardPage';
import FreeAgents from './FreeAgents';
import { AuthorizedUserContextProvider } from '../../common/auth/AuthorizedUserContext';
import { LoadingPanel } from '../../common/components/LoadingPanel';
import {
  useAuthHandlers,
  useCurrentUserInfo,
} from '../../common/auth/AuthHooks';
import Home from '.';

export type AppDrawerParamList = {
  '/': undefined;
  view_game_logs: undefined;
  view_career_stats: undefined;
  baseball: undefined;
  football: undefined;
  DraftBoardPage: undefined;
  FreeAgents: undefined;
  'baseball/league/[leagueId]': { leagueId: string };
  'baseball/team/[teamId]': { teamId: string };
};

const { Navigator, Screen } = createDrawerNavigator<AppDrawerParamList>();

interface Route {
  title: string;
  route: keyof AppDrawerParamList;
}

const ROUTES = Object.freeze<Route[]>([
  {
    route: '/',
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
    route: 'baseball',
    title: 'Baseball',
  },
  {
    route: 'football',
    title: 'Football',
  },
  {
    route: 'DraftBoardPage',
    title: 'Draft Board',
  },
  {
    route: 'FreeAgents',
    title: 'Free Agents',
  },
]);

function CustomDrawerContent(props: DrawerContentComponentProps): JSX.Element {
  const router = useRouter();
  const { logout } = useAuthHandlers();

  const doLogout = () => {
    logout();
    router.navigate('/login');
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
        onPress={doLogout}
        pressStyle={{ backgroundColor: '$gray3' }}
      >
        Logout
      </Text>
    </YStack>
  );
}

export default function Layout() {
  const { data: currentUser, loading } = useCurrentUserInfo();

  if (loading) {
    return <LoadingPanel />;
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
            sceneContainerStyle: {
              backgroundColor: '#ffffff',
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
            name="baseball/team/[teamId]"
            options={{ headerTitle: TeamIdHeader }}
            component={Team}
          />
          <Screen
            name="baseball/league/[leagueId]"
            options={{ headerTitle: LeagueIdHeader }}
            component={LeagueId}
          />
          <Screen
            name="DraftBoardPage"
            options={{ title: 'Draft Board' }}
            component={DraftBoardPage}
          />
          <Screen
            name="FreeAgents"
            options={{ title: 'Free Agents' }}
            component={FreeAgents}
          />
        </Navigator>
      </GestureHandlerRootView>
    </AuthorizedUserContextProvider>
  );
}
