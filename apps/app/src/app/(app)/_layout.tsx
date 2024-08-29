import { Redirect, router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Drawer } from 'expo-router/drawer';
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItem,
  DrawerItemList,
} from '@react-navigation/drawer';
import { Separator } from 'tamagui';
import {
  useAuthHandlers,
  useCurrentUserInfo,
} from '../../common/auth/AuthHooks';
import { LoadingPanel } from '../../common/components/LoadingPanel';

function CustomDrawerContent(props: DrawerContentComponentProps): JSX.Element {
  const { logout } = useAuthHandlers();

  const doLogout = () => {
    logout();
  };

  return (
    <DrawerContentScrollView>
      <DrawerItemList {...props} />
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer drawerContent={CustomDrawerContent}>
        <Drawer.Screen
          name="index"
          options={{
            drawerLabel: 'Home',
            title: '',
          }}
        />

        <Drawer.Screen
          name="view_game_logs"
          options={{
            drawerLabel: 'View Game Logs',
          }}
        />
        <Drawer.Screen
          name="view_career_stats"
          options={{
            drawerLabel: 'View Career Stats',
          }}
        />

        <Drawer.Screen
          name="football/index"
          options={{
            drawerLabel: 'Football',
          }}
        />

        <Drawer.Screen
          name="baseball/index"
          options={{
            drawerLabel: 'Baseball',
          }}
        />

        <Drawer.Screen
          name="/logout"
          options={{
            drawerLabel: 'Logout',
          }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}
