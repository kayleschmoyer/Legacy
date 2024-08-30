import { Redirect, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Drawer } from 'expo-router/drawer';
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItem,
} from '@react-navigation/drawer';
import { Separator } from 'tamagui';
import { LeagueIdHeader } from './baseball/league/[leagueId]';
import {
  useAuthHandlers,
  useCurrentUserInfo,
} from '../../common/auth/AuthHooks';
import { LoadingPanel } from '../../common/components/LoadingPanel';
import { AuthorizedUserContextProvider } from '../../common/auth/AuthorizedUserContext';

interface Route {
  title: string;
  route: string;
}

const ROUTES = Object.freeze<Route[]>([
  { title: 'Home', route: '/' },
  { title: 'View Game Logs', route: 'view_game_logs' },
  { title: 'View Career Stats', route: 'view_career_stats' },
  { title: 'Baseball', route: 'baseball' },
  { title: 'Football', route: 'football' },
]);

function CustomDrawerContent(props: DrawerContentComponentProps): JSX.Element {
  const router = useRouter();
  const { logout } = useAuthHandlers();

  const doLogout = () => {
    logout();
  };

  return (
    <DrawerContentScrollView>
      {ROUTES.map((r) => (
        <DrawerItem
          key={r.route}
          label={r.title}
          onPress={() => router.navigate(r.route)}
        />
      ))}

      <Separator />
      <DrawerItem label="Logout" onPress={doLogout} />
    </DrawerContentScrollView>
  );
}

export default function Layout() {
  const { data: currentUser, loading } = useCurrentUserInfo();

  // You can keep the splash screen open, or render a loading screen like we do here.
  if (loading) {
    return <LoadingPanel />;
  }

  // Only require authentication within the (app) group's layout as users
  // need to be able to access the (auth) group and sign in again.
  if (!currentUser) {
    // On web, static rendering will stop here as the user is not authenticated
    // in the headless Node process that the pages are rendered in.
    return <Redirect href="/login" />;
  }

  // This layout can be deferred because it's not the root layout.
  return (
    <AuthorizedUserContextProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Drawer drawerContent={CustomDrawerContent}>
          <Drawer.Screen
            name="index"
            options={{
              drawerLabel: 'Home',
              title: '',
            }}
          />

          <Drawer.Screen name="view_game_logs" />
          <Drawer.Screen name="view_career_stats" />
          <Drawer.Screen name="football/index" options={{title: 'Football Home'}} />
          <Drawer.Screen name="baseball/index" options={{title: 'Baseball Home'}} />
          <Drawer.Screen name="baseball/league/[leagueId]" options={{ headerTitle: LeagueIdHeader }} />
        </Drawer>
      </GestureHandlerRootView>
    </AuthorizedUserContextProvider>
  );
}
