import * as React from 'react';
import { useEffect } from 'react';
import { TamaguiProvider } from 'tamagui';
import { Slot, usePathname } from 'expo-router';
import { GrowthBook, GrowthBookProvider } from '@growthbook/growthbook-react';
import { ApolloProvider } from '@apollo/client/react';
import {
  getRollbarConfigFromEnv,
  initRollbar,
} from '@legacy-sports/rollbar/native';
import {
  AuthProvider,
  EnhancedAuthGuard,
  ErrorBoundary,
  useAuth,
} from '@legacy-sports/shared-components';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';
import type { OAuthConfig } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import { DbClientContext } from '../common/ApolloClientContext';
import { getMobileOAuthConfig } from '../common/auth/mobileOAuthConfig';
import { ThemeProvider } from '../context/ThemeContext';
import { setUserProperties } from '../utils/analytics';
import { useGetUserByIdQuery } from '../api/db/graphql.generated';

const isDev = process.env.NODE_ENV !== 'production';

const growthbook = new GrowthBook({
  apiHost: 'https://cdn.growthbook.io',
  clientKey: config.growthbookClientKey ?? '',
  enableDevMode: isDev,
  trackingCallback: (
    experiment: { key: string },
    result: { variationId: string | number },
  ) => {
    LOGGER.info('[GrowthBook] Experiment viewed:', {
      experiment: experiment.key,
      variationId: result.variationId,
    });
  },
});

// Initialize Rollbar for mobile app
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// Modern OAuth configuration for mobile — resolved by the single shared helper
// so the AuthProvider config and the imperative googleLogin flow stay in sync
// and the app.json placeholder client ID can never leak into GoogleSignin.
const authConfig: OAuthConfig = getMobileOAuthConfig();

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
    void setUserProperties({ userId, subscriptionTier: tier });
  }, [userId, data]);

  return null;
}

function AuthenticatedContent(): React.JSX.Element {
  const client = React.useContext(DbClientContext);
  const { user } = useAuth();

  return (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Apollo's StoreValue type includes `any`, making ApolloClient<NormalizedCacheObject> flagged; same pattern as tamaguiConfig on L142
    <ApolloProvider client={client.apolloClient}>
      {user?.id ? <AnalyticsIdentify userId={user.id} /> : null}
      <Slot />
    </ApolloProvider>
  );
}

/**
 * Inner layout — wraps auth guard with theme-aware content.
 * Placed inside ThemeProvider so it can read resolvedTheme.
 */
function InnerLayout(): React.JSX.Element {
  const pathname = usePathname() ?? '';

  return (
    <AuthProvider config={authConfig}>
      <EnhancedAuthGuard
        currentPath={pathname}
        loginTitle="Welcome to Legacy Sports!"
        loginSubtitle="Sign in to access your fantasy leagues and stats"
        testMode={isDev} // Enable test mode in development
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
  useEffect(() => {
    if (!config.growthbookClientKey) return;
    growthbook.loadFeatures({ autoRefresh: true }).catch((err: unknown) => {
      LOGGER.warn(
        '[GrowthBook] Feature load failed (non-fatal):',
        err as Error,
      );
    });
  }, []);

  return (
    // TamaguiProvider must wrap ErrorBoundary: ErrorBoundary's fallback UI
    // uses tamagui components (YStack/Text/Button), which call useTheme().
    // With ErrorBoundary on the outside, any caught error would trigger a
    // fallback render that itself throws "Missing theme" because the
    // TamaguiProvider it was wrapping has been unmounted along with the
    // errored subtree. That secondary throw escapes and crashes the app.
    <TamaguiProvider
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- tamaguiConfig typed as any internally by tamagui package; safe to pass
      config={tamaguiConfig}
      defaultTheme="dark"
    >
      <GrowthBookProvider growthbook={growthbook}>
        <ErrorBoundary>
          {/* ThemeProvider must live inside TamaguiProvider so the Theme component works */}
          <ThemeProvider>
            <InnerLayout />
          </ThemeProvider>
        </ErrorBoundary>
      </GrowthBookProvider>
    </TamaguiProvider>
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
