import * as React from 'react';
import { useEffect } from 'react';
import { TamaguiProvider } from 'tamagui';
import Constants from 'expo-constants';
import {
  getRollbarConfigFromEnv,
  initRollbar,
} from '@legacy-sports/rollbar/native';
import {
  AppProvider,
  AuthProvider,
  BaseballScreen,
  EnhancedAuthGuard,
  ErrorBoundary,
  FootballScreen,
  HomeScreen,
  TamaguiAppNavigator,
  useAuth,
} from '@legacy-sports/shared-components';
import type { NavigationRoute } from '@legacy-sports/shared-components';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';
import type { OAuthConfig } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { DbClientContext } from '../common/ApolloClientContext';
import { ThemeProvider, useThemeContext } from '../context/ThemeContext';
import { setUserId, setUserProperties } from '../utils/analytics';
import { useGetUserByIdQuery } from '../api/db/graphql.generated';

// Initialize Rollbar for mobile app
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// Create a wrapper for HomeScreen that provides required props
function MobileHomeScreen() {
  const handleSportPress = (sportKey: string) => {
    LOGGER.info('Mobile app - Sport selected:', sportKey);
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

/**
 * Runs inside AppProvider (Apollo context) to set analytics identity using
 * the real subscriptionTier from the database.
 */
function AnalyticsIdentify({ userId }: { userId: number }): null {
  const { data } = useGetUserByIdQuery({
    variables: { id: userId },
    skip: !userId,
  });

  useEffect(() => {
    if (!data?.user) return;
    const tier = data.user.subscriptionTier === 'premium' ? 'premium' : 'free';
    setUserId(userId);
    setUserProperties({ userId, subscriptionTier: tier });
  }, [userId, data]);

  return null;
}

function AuthenticatedContent(): React.JSX.Element {
  const client = React.useContext(DbClientContext);
  const { resolvedTheme } = useThemeContext();
  const { user } = useAuth();

  return (
    <AppProvider
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      apolloClient={client.apolloClient}
      colorScheme={resolvedTheme}
      isLoading={false}
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      tamaguiConfig={tamaguiConfig}
    >
      {user?.id ? <AnalyticsIdentify userId={user.id} /> : null}
      <TamaguiAppNavigator routes={routes} initialRoute="Home" />
    </AppProvider>
  );
}

/**
 * Inner layout — wraps auth guard with theme-aware content.
 * Placed inside ThemeProvider so it can read resolvedTheme.
 */
function InnerLayout(): React.JSX.Element {
  return (
    <AuthProvider config={authConfig}>
      <EnhancedAuthGuard
        loginTitle="Welcome to Legacy Sports!"
        loginSubtitle="Sign in to access your fantasy leagues and stats"
        testMode={__DEV__} // Enable test mode in development
        onLoginSuccess={() => {
          LOGGER.info('Mobile app login successful!');
        }}
        onLoginFailure={(error) => {
          LOGGER.error('Mobile app login failed:', error);
        }}
      >
        <AuthenticatedContent />
      </EnhancedAuthGuard>
    </AuthProvider>
  );
}

/**
 * Main Mobile App Layout - Clean authentication flow
 * Uses EnhancedAuthGuard at root level for consistent behavior
 */
export default function Layout() {
  return (
    <ErrorBoundary>
      <TamaguiProvider
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config={tamaguiConfig}
        defaultTheme="dark"
      >
        {/* ThemeProvider must live inside TamaguiProvider so the Theme component works */}
        <ThemeProvider>
          <InnerLayout />
        </ThemeProvider>
      </TamaguiProvider>
    </ErrorBoundary>
  );
}

// Export testID constants for E2E test selectors
export const APP_TEST_IDS = {
  loginScreen: 'login-screen',
  loginButton: 'login-button',
  loginTitle: 'login-title',
  loginError: 'login-error',
  loginLoading: 'login-loading',
  homeScreen: 'home-screen',
  homeTitle: 'home-title',
  homeContent: 'home-content',
  sportSelection: 'sport-selection',
  sportButtonFootball: 'sport-button-football',
  sportButtonBaseball: 'sport-button-baseball',
  aboutButton: 'about-button',
  drawerContent: 'drawer-content',
  drawerLogout: 'drawer-logout',
  gestureHandler: 'gesture-handler',
} as const;
