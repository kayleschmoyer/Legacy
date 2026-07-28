// Session-lifecycle coverage for native auth (LS-8454, AC1 + AC2).
//
// Native auth is a secure-store JWT: the `(app)` route group calls the REAL
// `useCurrentUserInfo()` -> `getJwt()` -> `SecureStorageProvider.getItem(INTERNAL_JWT)`
// on every launch and redirects to `/login` when nothing is stored. The existing
// `_layout.spec.tsx` asserts the guard's branches with `useCurrentUserInfo`
// *mocked*; it never exercises the persistence chain the ACs are about. This spec
// closes that gap: it drives the guard through the real hook against a persistent
// secure-store double, seeded/cleared via the LS-8454 session-injection harness, so
// "relaunch with a stored session" and "relaunch after logout" are exercised
// end-to-end without EXPO_PUBLIC_BYPASS_AUTH.
//
// A fresh `render(<Layout />)` models a cold app launch; the module-scoped store
// persists across renders exactly like the on-device Keychain/Keystore persists
// across process restarts. Emulator-driven variants of these flows are deferred to
// the AppiumNativeDriver (LS-8447) — see apps/app-e2e/SESSION-LIFECYCLE-E2E.md.

import React from 'react';
import { render, screen } from '@testing-library/react-native';

import Layout from './_layout';
import {
  buildTestJwt,
  clearTestSession,
  injectTestSession,
} from '../../common/auth/testHarness/sessionInjection';

// ── Persistent secure-store double (the "device keychain") ───────────────────
// Named `mock*` so jest allows the mock factory below to close over it.
const mockSecureStore: Record<string, string> = {};

// ── Mocks: the guard's own dependencies (mirrors _layout.spec.tsx) ───────────

jest.mock('expo-router', () => {
  const { View, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Stack = ({ children }: { children: React.ReactNode }) => (
    <View testID="stack-navigator">{children}</View>
  );
  Stack.Screen = ({ name }: { name: string }) => (
    <View testID={`screen-${name}`} />
  );
  return {
    Stack,
    Redirect: ({ href }: { href: string }) => (
      <Text testID="redirect">{`Redirect:${href}`}</Text>
    ),
    useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('react-native-gesture-handler', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GestureHandlerRootView: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      style?: Record<string, unknown>;
    }) => <View {...props}>{children}</View>,
    gestureHandlerRootHOC: (Component: React.ComponentType) => Component,
  };
});

// @legacy-sports/shared-components: BrandedSplash for the guard + the persistent
// SecureStorageProvider the REAL AuthHooks reads/writes through, + the OAuth
// runtime symbols AuthHooks imports at module load (stubbed — never invoked here).
jest.mock('@legacy-sports/shared-components', () => {
  const { View, ActivityIndicator } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BrandedSplash: () => (
      <View testID="branded-splash">
        <ActivityIndicator />
      </View>
    ),
    SecureStorageProvider: {
      getItem: (key: string): Promise<string | null> =>
        Promise.resolve(mockSecureStore[key] ?? null),
      setItem: (key: string, value: string): Promise<void> => {
        mockSecureStore[key] = value;
        return Promise.resolve();
      },
      removeItem: (key: string): Promise<void> => {
        delete mockSecureStore[key];
        return Promise.resolve();
      },
      hasItem: (key: string): Promise<boolean> =>
        Promise.resolve(key in mockSecureStore),
      clear: (): Promise<void> => {
        Object.keys(mockSecureStore).forEach((k) => delete mockSecureStore[k]);
        return Promise.resolve();
      },
    },
    buildGoogleAuthPayload: jest.fn(),
    exchangeGoogleCode: jest.fn(),
    exchangeAppleCode: jest.fn(),
    exchangeDiscordCode: jest.fn(),
    OAuthErrorCode: { DEVELOPER_ERROR: 'DEVELOPER_ERROR' },
    OAuthProvider: {
      configure: jest.fn().mockResolvedValue(undefined),
      signIn: jest.fn(),
      signOut: jest.fn(),
    },
  };
});

jest.mock('../../common/auth/AuthorizedUserContext', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AuthorizedUserContextProvider: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <View testID="auth-context">{children}</View>,
  };
});

jest.mock('../../features/notifications/hooks/usePushNotifications', () => ({
  usePushNotifications: jest.fn(),
}));

jest.mock('../../context/ThemeContext', () => ({
  useThemeContext: () => ({ resolvedTheme: 'dark' }),
}));

jest.mock('./_screenErrorBoundary', () => ({
  ScreenErrorBoundary: () => null,
}));

// ── Mocks: the REAL AuthHooks' native transitive deps (mirrors AuthHooks.spec) ──
// AuthHooks itself is NOT mocked — useCurrentUserInfo / getJwt run for real.

jest.mock('../../common/auth/mobileOAuthConfig', () => ({
  getMobileOAuthConfig: () => ({ oauthProxyUrl: 'https://oauth.example.com' }),
}));
jest.mock('../../common/auth/appleAuth', () => ({
  APPLE_SIGN_IN_CANCELLED: 'ERR_REQUEST_CANCELED',
  isAppleAuthAvailable: jest.fn().mockResolvedValue(false),
  signInWithApple: jest.fn(),
}));
jest.mock('../../common/auth/discordAuth', () => ({
  DISCORD_SIGN_IN_CANCELLED: 'DISCORD_SIGN_IN_CANCELLED',
  signInWithDiscord: jest.fn(),
}));
jest.mock('../../common/ApolloClientContext', () => ({
  clearApolloCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../utils/analytics', () => ({
  trackGoogleSignInFailure: jest.fn(),
}));
jest.mock('@legacy-sports/rollbar/native', () => ({
  captureError: jest.fn(),
}));
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
// Force the real-auth path: BYPASS_AUTH must be off so getJwt() actually reads
// the persisted session rather than returning a fake LOCAL_USER.
jest.mock('@legacy-sports/env-utilities', () => ({
  getEnvVarOptional: () => undefined,
  getEnvVarRequired: (key: string) => {
    throw new Error(`Missing required env var: ${key}`);
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

const TEST_USER = { id: 42, username: 'testuser' };

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(mockSecureStore).forEach((k) => delete mockSecureStore[k]);
});

describe('native session lifecycle', () => {
  it('AC1: relaunch with a stored session lands authenticated (no login screen)', async () => {
    await injectTestSession(buildTestJwt(TEST_USER));

    render(<Layout />);

    // Cold launch reads the persisted JWT, resolves the user, renders the app.
    expect(await screen.findByTestId('stack-navigator')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('AC2: relaunch with no stored session redirects to /login', async () => {
    // No injected session — the cleared-session cold-start case.
    render(<Layout />);

    expect(await screen.findByTestId('redirect')).toBeTruthy();
    expect(screen.getByText('Redirect:/login')).toBeTruthy();
    expect(screen.queryByTestId('stack-navigator')).toBeNull();
  });

  it('AC2: logout clears the session so the next relaunch redirects to /login', async () => {
    // First launch: authenticated from a persisted session.
    await injectTestSession(buildTestJwt(TEST_USER));
    const first = render(<Layout />);
    expect(await screen.findByTestId('stack-navigator')).toBeTruthy();
    first.unmount();

    // Logout clears secure storage (the storage half of AuthHooks.logout).
    await clearTestSession();

    // Next cold launch finds no token and self-guards to /login.
    render(<Layout />);
    expect(await screen.findByTestId('redirect')).toBeTruthy();
    expect(screen.getByText('Redirect:/login')).toBeTruthy();
  });
});
