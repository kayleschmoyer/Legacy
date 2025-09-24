import * as React from 'react';
import { useColorScheme } from 'react-native';
import { TamaguiProvider } from 'tamagui';
import Constants from 'expo-constants';
import {
  AppNavigator,
  AppProvider,
  BaseballScreen,
  createAuthService,
  EnhancedAuthGuard,
  FootballScreen,
  HomeScreen,
  NavigationRoute,
  tamaguiConfig,
  validateAuthConfig,
} from '@legacy-sports/shared-components';
import type { AuthConfig } from '@legacy-sports/shared-components/src/features/auth/authConfig';
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

// Type assertions for platform-component magic string resolution
const typedValidateAuthConfig = validateAuthConfig as (
  config: AuthConfig,
) => void;
const typedCreateAuthService = createAuthService as (
  config: AuthConfig,
) => unknown;

// Create authentication configuration for mobile
const authConfig: AuthConfig = {
  oauthProxyUrl:
    (Constants.expoConfig?.extra?.oauthProxyUrl as string) ||
    'http://localhost:5001',
  googleClientId:
    (Constants.expoConfig?.extra?.googleClientId as string) ||
    '1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3.apps.googleusercontent.com',
};

// Initialize authentication service
let authServiceInitialized = false;
if (!authServiceInitialized) {
  try {
    typedValidateAuthConfig(authConfig);
    typedCreateAuthService(authConfig);
    authServiceInitialized = true;
  } catch (error) {
    console.warn('Auth configuration validation failed:', error);
    // Create auth service anyway for development
    typedCreateAuthService(authConfig);
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
  // Extract config values with explicit typing to avoid magic string issues
  const oauthProxyUrl =
    (Constants.expoConfig?.extra?.oauthProxyUrl as string) ||
    'http://localhost:5001';
  const googleClientId =
    (Constants.expoConfig?.extra?.googleClientId as string) ||
    '1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3.apps.googleusercontent.com';

  return (
    <EnhancedAuthGuard
      oauthProxyUrl={oauthProxyUrl}
      googleClientId={googleClientId}
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
