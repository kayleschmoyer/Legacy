import { Redirect, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  createDrawerNavigator,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import {
  Divider,
  DrawerElement,
  DrawerItem,
  Drawer as KittenDrawer,
  useTheme,
} from '@ui-kitten/components';
import { Fragment } from 'react';
import LeagueId, { LeagueIdHeader } from './baseball/league/[leagueId]';
import Team, { TeamIdHeader } from './baseball/team/[teamId]';
import ViewGameLogs from './view_game_logs';
import ViewCareerStats from './view_career_stats';
import FootballHome from './football';
import BaseballHome from './baseball';
import DraftBoardPage from './DraftBoardPage';
import { AuthorizedUserContextProvider } from '../../common/auth/AuthorizedUserContext';
import { LoadingPanel } from '../../common/components/LoadingPanel';
import {
  useAuthHandlers,
  useCurrentUserInfo,
} from '../../common/auth/AuthHooks';
import Home from '.';

const { Navigator, Screen } = createDrawerNavigator();

interface Route {
  title: string;
  route: string;
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
]);

function CustomDrawerContent(
  props: DrawerContentComponentProps
): DrawerElement {
  const router = useRouter();
  const { logout } = useAuthHandlers();

  const doLogout = () => {
    logout();
  };

  const onItemSelect = (route: string): void => {
    router.navigate(route);
    props.navigation.closeDrawer();
  };

  return (
    <KittenDrawer>
      <Fragment>
        {ROUTES.map((r) => (
          <DrawerItem
            key={r.route}
            title={r.title}
            onPress={() => onItemSelect(r.route)}
          />
        ))}
      </Fragment>
      <Divider />
      <DrawerItem title="Logout" onPress={doLogout} />
    </KittenDrawer>
  );
}

export default function Layout() {
  const { data: currentUser, loading } = useCurrentUserInfo();
  const theme = useTheme();

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
          drawerContent={(props) => <CustomDrawerContent {...props} />}
          screenOptions={{
            headerStyle: {
              backgroundColor: theme['background-basic-color-4'],
            },
            sceneContainerStyle: {
              backgroundColor: theme['background-basic-color-1'],
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
        </Navigator>
      </GestureHandlerRootView>
    </AuthorizedUserContextProvider>
  );
}
