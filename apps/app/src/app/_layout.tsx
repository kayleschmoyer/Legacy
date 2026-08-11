import * as React from 'react';
import { useEffect } from 'react';
import { TamaguiProvider, Theme } from 'tamagui';
import { Slot } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {
  GrowthBook,
  GrowthBookProvider,
  useGrowthBook,
} from '@growthbook/growthbook-react';
import { ApolloProvider } from '@apollo/client/react';
import {
  getRollbarConfigFromEnv,
  initRollbar,
} from '@legacy-sports/rollbar/native';
import { AuthProvider, ErrorBoundary } from '@legacy-sports/shared-components';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';
import type { OAuthConfig } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import { useGetUserByIdQuery } from '@legacy-sports/graphql';
import { DbClientContext } from '../common/ApolloClientContext';
import { useCurrentUserInfo } from '../common/auth/AuthHooks';
import { getMobileOAuthConfig } from '../common/auth/mobileOAuthConfig';
import {
  ThemeProvider,
  ThemeServerSync,
  useThemeContext,
} from '../context/ThemeContext';
import { setUserProperties } from '../utils/analytics';
import { installGlobalErrorCapture } from '../lib/installGlobalErrorCapture';

const isDev = process.env.NODE_ENV !== 'production';

// Keep the splash screen up until the brand fonts (docs/design/brand.md —
// Big Shoulders Display / Literata) finish loading via useFonts() below, so
// Tamagui's $heading/$body never briefly render the Inter fallback.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Safe to ignore — the splash screen may already be hidden (e.g. Fast Refresh).
});

// Registered names must match the `face` keys in
// lib/tamagui-config/src/lib/tamagui-config.ts exactly.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports -- Metro/Expo asset loading requires `require()` for binary font files; it returns an opaque module ID, not a typed value. Standard expo-font pattern, no ESM alternative in this bundler setup. */
const BRAND_FONTS = {
  'BigShouldersDisplay-SemiBold': require('../../assets/fonts/BigShouldersDisplay-SemiBold.ttf'),
  'BigShouldersDisplay-Bold': require('../../assets/fonts/BigShouldersDisplay-Bold.ttf'),
  'BigShouldersDisplay-ExtraBold': require('../../assets/fonts/BigShouldersDisplay-ExtraBold.ttf'),
  'Literata-Regular': require('../../assets/fonts/Literata-Regular.ttf'),
  'Literata-SemiBold': require('../../assets/fonts/Literata-SemiBold.ttf'),
  'Literata-Italic': require('../../assets/fonts/Literata-Italic.ttf'),
};
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports */

// Construct the GrowthBook instance lazily rather than at module-evaluation
// time. `config.growthbookClientKey` resolves `Constants.expoConfig?.extra`,
// which on Android cold-starts / prebuilds may be undefined or stale when JS
// modules are first evaluated — before the native bridge is ready. Calling this
// from a render-time `useMemo` defers the read until the bridge is up (LS-4965).
function createGrowthbook(): GrowthBook {
  return new GrowthBook({
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
}

// Initialize Rollbar for mobile app. Safe at module-evaluation time: the config
// is sourced from `EXPO_PUBLIC_*` env vars (inlined into the bundle by
// babel-preset-expo at build time), not from `Constants.expoConfig`.
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// Install global JS error capture after Rollbar so LOGGER → RollbarOutputDestination
// is ready to receive errors. Must run before any component renders.
installGlobalErrorCapture();

/**
 * Runs inside AppProvider (Apollo context) to set analytics identity and
 * GrowthBook targeting attributes using the real subscriptionTier from the
 * database.
 */
function AnalyticsIdentify({ userId }: { userId: number }): null {
  // Read the GrowthBook instance from context (provided by GrowthBookProvider)
  // rather than a module-level singleton, so this module never constructs one at
  // evaluation time (LS-4965).
  const growthbook = useGrowthBook();
  const { data } = useGetUserByIdQuery({
    variables: { id: userId },
    skip: !userId,
  });

  useEffect(() => {
    if (!data?.user) return;
    const tier = data.user.subscriptionTier === 'premium' ? 'premium' : 'free';
    void setUserProperties({ userId, subscriptionTier: tier });
    void growthbook.setAttributes({ id: userId, subscriptionTier: tier });
  }, [userId, data, growthbook]);

  return null;
}

function AuthenticatedContent(): React.JSX.Element {
  const client = React.useContext(DbClientContext);
  // Source the analytics identity from the native auth state (the secure-store
  // JWT), not the shared web AuthProvider — the latter never authenticates on
  // React Native (no localStorage / cookies). `id > 0` skips the BYPASS_AUTH
  // LOCAL_USER sentinel (id === -1).
  const { data: currentUser } = useCurrentUserInfo();

  const authenticatedUserId =
    currentUser?.id && currentUser.id > 0 ? currentUser.id : undefined;

  return (
    <ApolloProvider client={client.apolloClient}>
      {authenticatedUserId ? (
        <AnalyticsIdentify userId={authenticatedUserId} />
      ) : null}
      <ThemeServerSync userId={authenticatedUserId} />
      <Slot />
    </ApolloProvider>
  );
}

/**
 * Reads the resolved theme from ThemeContext and applies it as a Tamagui Theme
 * wrapper so every component under it re-renders with the correct token set.
 * Must be rendered inside ThemeProvider and TamaguiProvider.
 */
function ThemedApp(): React.JSX.Element {
  const { resolvedTheme } = useThemeContext();
  return (
    <Theme name={resolvedTheme}>
      <InnerLayout />
    </Theme>
  );
}

/**
 * Inner layout — provides the OAuth context and renders the router outlet.
 *
 * Auth gating is the router's job, NOT a top-level guard: the public `/login`
 * route renders the login screen, and the authenticated `(app)` route group
 * self-guards via `useCurrentUserInfo()` (the native secure-store JWT),
 * redirecting to `/login` when there is no session — see
 * `app/(app)/_layout.tsx` and `AuthorizedUserContext`.
 *
 * The previous `EnhancedAuthGuard` here gated on the shared web `AuthProvider`,
 * whose `isAuthenticated` never flips on React Native (no localStorage /
 * cookies / window events). Its `testMode={isDev}` bypass masked this in dev,
 * but in release builds the guard was active and trapped users on the login
 * screen even after a successful native login (LS-7942). `AuthProvider` is kept
 * so any shared component that reads `useAuth()` still finds its context; it is
 * inert on native and performs no network calls.
 */
function InnerLayout(): React.JSX.Element {
  // Resolve the OAuth config at render time, not module-evaluation time:
  // getMobileOAuthConfig() reads config.googleClientId / discordClientId /
  // oauthProxy, each of which resolves Constants.expoConfig?.extra. Deferring to
  // a useMemo keeps that read off the import path so it runs once the native
  // bridge is ready (LS-4965). The single shared helper keeps the AuthProvider
  // config and the imperative googleLogin flow in sync, and prevents the
  // app.json placeholder client ID from leaking into GoogleSignin.
  const authConfig = React.useMemo<OAuthConfig>(
    () => getMobileOAuthConfig(),
    [],
  );

  return (
    <AuthProvider config={authConfig}>
      <AuthenticatedContent />
    </AuthProvider>
  );
}

/**
 * Main Mobile App Layout — provider stack + router outlet. Auth gating is
 * delegated to the router (`/login` is public; the `(app)` group self-guards
 * via the native secure-store JWT), not a top-level guard (LS-7942).
 */
export default function Layout() {
  // Build the GrowthBook instance once, at render time. See createGrowthbook()
  // for why this must not happen at module-evaluation time (LS-4965).
  const growthbook = React.useMemo(() => createGrowthbook(), []);

  useEffect(() => {
    if (!config.growthbookClientKey) return;
    growthbook.loadFeatures({ autoRefresh: true }).catch((err: unknown) => {
      LOGGER.warn(
        '[GrowthBook] Feature load failed (non-fatal):',
        err as Error,
      );
    });
  }, [growthbook]);

  const [fontsLoaded, fontError] = useFonts(BRAND_FONTS);

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    if (fontError) {
      LOGGER.warn('[Fonts] Brand font load failed (non-fatal):', fontError);
    }
    SplashScreen.hideAsync().catch(() => {
      // Safe to ignore — see preventAutoHideAsync() above.
    });
  }, [fontsLoaded, fontError]);

  // Keep the splash screen visible (return null, not a fallback UI) until
  // fonts resolve — Tamagui's $heading/$body must never render Inter.
  if (!fontsLoaded && !fontError) {
    return null;
  }

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
      defaultTheme="light"
    >
      <GrowthBookProvider growthbook={growthbook}>
        <ErrorBoundary>
          {/* ThemeProvider must live inside TamaguiProvider so the Theme component works */}
          <ThemeProvider>
            <ThemedApp />
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
  loginOAuthExchanging: 'login-oauth-exchanging',
  homeScreen: 'home-screen',
  homeTitle: 'home-title',
  homeContent: 'home-content',
  sportSelection: 'sport-selection',
  sportButtonFootball: 'sport-button-football',
  sportButtonBaseball: 'sport-button-baseball',
  aboutButton: 'about-button',
  gestureHandler: 'gesture-handler',
} as const;
