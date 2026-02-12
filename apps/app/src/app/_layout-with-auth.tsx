import * as React from 'react';
import { useColorScheme } from 'react-native';
import { TamaguiProvider } from 'tamagui';
import Constants from 'expo-constants';
import {
  AppNavigator,
  AppProvider,
  AuthProvider,
  BaseballScreen,
  EnhancedAuthGuard,
  FootballScreen,
  HomeScreen,
  NavigationRoute,
} from '@legacy-sports/shared-components';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';
import type { OAuthConfig } from '@legacy-sports/shared-components';
import { DbClientContext } from '../common/ApolloClientContext';

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
];

// Create modern OAuth configuration for mobile
const authConfig: OAuthConfig = {
  googleClientId:
    (Constants.expoConfig?.extra?.googleClientId as string) ||
    '1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3.apps.googleusercontent.com',
  additionalScopes: ['openid', 'profile', 'email'],
  offlineAccess: true,
};

function AuthenticatedContent(): React.JSX.Element {
  const client = React.useContext(DbClientContext);
  const colorScheme = useColorScheme();

  return (
    <AppProvider
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      apolloClient={client.apolloClient}
      colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}
      isLoading={false}
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      tamaguiConfig={tamaguiConfig}
    >
      <AppNavigator routes={routes} initialRoute="Home" />
    </AppProvider>
  );
}

function InnerLayout(): React.JSX.Element {
  return (
    <AuthProvider config={authConfig}>
      <EnhancedAuthGuard
        loginTitle="Welcome to Legacy Sports!"
        loginSubtitle="Sign in to access your fantasy leagues and stats"
        testMode={__DEV__} // Enable test mode in development
        onLoginSuccess={() => {
          console.log('Mobile login successful!');
        }}
        onLoginFailure={(error) => {
          console.error('Mobile login failed:', error);
        }}
      >
        <AuthenticatedContent />
      </EnhancedAuthGuard>
    </AuthProvider>
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
