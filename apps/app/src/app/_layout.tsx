import * as React from 'react';
import { useColorScheme } from 'react-native';
import { TamaguiProvider } from 'tamagui';
import Constants from 'expo-constants';
import {
  AppNavigator,
  AppProvider,
  BaseballScreen,
  createAuthConfig,
  createAuthService,
  EnhancedAuthGuard,
  FootballScreen,
  HomeScreen,
  NavigationRoute,
  tamaguiConfig,
  validateAuthConfig,
} from '@legacy-sports/shared-components';
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

// Create authentication configuration for mobile
const authConfig = createAuthConfig({
  oauthProxyUrl:
    (Constants.expoConfig?.extra?.oauthProxyUrl as string) ||
    'http://localhost:5001',
  googleClientId:
    (Constants.expoConfig?.extra?.googleClientId as string) ||
    '1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3.apps.googleusercontent.com',
});

// Initialize authentication service
let authServiceInitialized = false;
if (!authServiceInitialized) {
  try {
    validateAuthConfig(authConfig);
    createAuthService(authConfig);
    authServiceInitialized = true;
  } catch (error) {
    console.warn('Auth configuration validation failed:', error);
    // Create auth service anyway for development
    createAuthService(authConfig);
    authServiceInitialized = true;
  }
}

function AuthenticatedContent(): React.JSX.Element {
  const client = React.useContext(DbClientContext);
  const colorScheme = useColorScheme();

  return (
    <AppProvider
      apolloClient={client.apolloClient}
      colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}
      isLoading={false}
    >
      <AppNavigator routes={routes} initialRoute="Home" />
    </AppProvider>
  );
}

function InnerLayout(): React.JSX.Element {
  return (
    <EnhancedAuthGuard
      oauthProxyUrl={authConfig.oauthProxyUrl}
      googleClientId={authConfig.googleClientId}
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
