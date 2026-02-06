import * as React from 'react';
import { useColorScheme } from 'react-native';
import { TamaguiProvider } from 'tamagui';
import Constants from 'expo-constants';
import {
  captureError,
  getSentryConfigFromEnv,
  initSentry,
} from '@legacy-sports/sentry/native';
import {
  AppProvider,
  AuthProvider,
  BaseballScreen,
  EnhancedAuthGuard,
  ErrorBoundary,
  FootballScreen,
  HomeScreen,
  TamaguiAppNavigator,
} from '@legacy-sports/shared-components';
import type { NavigationRoute } from '@legacy-sports/shared-components';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';
import type { OAuthConfig } from '@legacy-sports/shared-components';
import { DbClientContext } from '../common/ApolloClientContext';

// Initialize Sentry for mobile app
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

// Create a wrapper for HomeScreen that provides required props
function MobileHomeScreen() {
  const handleSportPress = (sportKey: string) => {
    console.log('Mobile app - Sport selected:', sportKey);
    // In a real app, this would navigate to the sport-specific screen
  };

  return (
    <HomeScreen
      onSportPress={handleSportPress}
      title="Fantasy Sports Hub"
      subtitle="Choose your sport to get started"
    />
  );
}

// Define your app routes
const routes: NavigationRoute[] = [
  {
    name: 'Home',
    component: MobileHomeScreen,
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
  oauthProxyUrl:
    (Constants.expoConfig?.extra?.oauthProxyUrl as string) ||
    'http://localhost:5001', // OAuth proxy lambda URL
  additionalScopes: ['openid', 'profile', 'email'],
  offlineAccess: true,
};

function AuthenticatedContent(): React.JSX.Element {
  const client = React.useContext(DbClientContext);
  const colorScheme = useColorScheme();

  return (
    <AppProvider
      apolloClient={client.apolloClient}
      colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}
      isLoading={false}
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      tamaguiConfig={tamaguiConfig}
    >
      <TamaguiAppNavigator routes={routes} initialRoute="Home" />
    </AppProvider>
  );
}

/**
 * Main Mobile App Layout - Clean authentication flow
 * Uses EnhancedAuthGuard at root level for consistent behavior
 */
export default function Layout() {
  const colorScheme = useColorScheme();

  return (
    <ErrorBoundary reportError={captureError}>
      <TamaguiProvider
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config={tamaguiConfig}
        defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}
      >
        <AuthProvider config={authConfig}>
          <EnhancedAuthGuard
            loginTitle="Welcome to Legacy Sports!"
            loginSubtitle="Sign in to access your fantasy leagues and stats"
            testMode={__DEV__} // Enable test mode in development
            onLoginSuccess={() => {
              console.log('Mobile app login successful!');
            }}
            onLoginFailure={(error) => {
              console.error('Mobile app login failed:', error);
              captureError(new Error(error), { context: 'mobile-app-login' });
            }}
          >
            <AuthenticatedContent />
          </EnhancedAuthGuard>
        </AuthProvider>
      </TamaguiProvider>
    </ErrorBoundary>
  );
}
