import * as React from 'react';
import { useColorScheme } from 'react-native';
import { TamaguiProvider } from 'tamagui';
import {
  AppNavigator,
  AppProvider,
  BaseballScreen,
  DemoScreen,
  FootballScreen,
  HomeScreen,
  NavigationRoute,
  tamaguiConfig,
} from '@legacy-sports/shared-components';
import { DbClientContext } from '../common/ApolloClientContext';
import { useCurrentUserInfo } from '../common/auth/AuthHooks';

// Define your app routes
const routes: NavigationRoute[] = [
  {
    name: 'Home',
    component: HomeScreen,
    title: 'Fantasy Sports Hub',
  },
  {
    name: 'Football',
    component: FootballScreen,
    title: 'Football',
  },
  {
    name: 'Baseball',
    component: BaseballScreen,
    title: 'Baseball',
  },
  {
    name: 'Demo',
    component: DemoScreen,
    title: 'Component Demo',
  },
];

function InnerLayout(): JSX.Element {
  const { loading } = useCurrentUserInfo();
  const client = React.useContext(DbClientContext);
  const colorScheme = useColorScheme();

  return (
    <AppProvider
      apolloClient={client.apolloClient}
      colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}
      isLoading={loading}
    >
      <AppNavigator routes={routes} initialRoute="Home" />
    </AppProvider>
  );
}

export default function Layout() {
  const colorScheme = useColorScheme();

  return (
    <TamaguiProvider
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      config={tamaguiConfig}
      defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}
    >
      <InnerLayout />
    </TamaguiProvider>
  );
}
