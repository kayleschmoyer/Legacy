import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
// ── Import types for test data ──────────────────────────────────────────────
import type { LegacySportsJwt } from './AuthHooks';

// ── Import module under test (jest.mock calls are hoisted above this) ───────
import {
  getJwt,
  readKeychainValue,
  Secret,
  useAuthHandlers,
  useCurrentUserInfo,
} from './AuthHooks';

// ── Mocks ───────────────────────────────────────────────────────────────────

// The Google code-exchange now goes through the shared `exchangeGoogleCode`
// helper (lib/shared-components), which uses `fetch` rather than axios. We mock
// the global `fetch` and let the REAL shared helpers run (see the
// shared-components mock below) so these tests still assert the actual POST URL
// (`${base}/google`) and payload assembly.
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

/** Build a successful `fetch` Response stub for the shared exchange helper. */
function okJsonResponse(body: unknown): unknown {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

// Mock expo-constants (uses native expo-modules-core which is unavailable in Jest)
jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
  expoConfig: { extra: {} },
}));

// Mock expo-router
const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  const { Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => ({ replace: mockReplace }),
    Redirect: ({ href }: { href: string }) => (
      <Text testID="redirect">{`Redirect:${href}`}</Text>
    ),
  };
});

// Mock @legacy-sports/logging
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock secure storage
const mockSecureStorage: Record<string, string> = {};
const mockGetItem = jest.fn((key: string) =>
  Promise.resolve(mockSecureStorage[key] ?? null),
);
const mockSetItem = jest.fn((key: string, value: string) => {
  mockSecureStorage[key] = value;
  return Promise.resolve();
});
const mockRemoveItem = jest.fn((key: string) => {
  delete mockSecureStorage[key];
  return Promise.resolve();
});

// Mock OAuthProvider
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockConfigure = jest.fn().mockResolvedValue(undefined);

jest.mock('@legacy-sports/shared-components', () => {
  // Use the REAL shared payload/transport helpers (their only import is a
  // type, so requiring the source file directly pulls in nothing native) while
  // still stubbing the native OAuthProvider/SecureStorageProvider. This keeps
  // the POST-URL and payload assertions below exercising production code.
  const { buildGoogleAuthPayload, exchangeGoogleCode } = jest.requireActual<
    typeof import('@legacy-sports/shared-components')
  >(
    '../../../../../lib/shared-components/src/features/auth/services/googleAuthExchange',
  );
  const { exchangeAppleCode } = jest.requireActual<
    typeof import('@legacy-sports/shared-components')
  >(
    '../../../../../lib/shared-components/src/features/auth/services/appleAuthExchange',
  );
  return {
    buildGoogleAuthPayload,
    exchangeGoogleCode,
    exchangeAppleCode,
    OAuthProvider: {
      configure: (...args: unknown[]): unknown => mockConfigure(...args),
      signIn: (...args: unknown[]): unknown => mockSignIn(...args),
      signOut: (...args: unknown[]): unknown => mockSignOut(...args),
    },
    SecureStorageProvider: {
      getItem: (...args: unknown[]): unknown => mockGetItem(...args),
      setItem: (...args: unknown[]): unknown => mockSetItem(...args),
      removeItem: (...args: unknown[]): unknown => mockRemoveItem(...args),
    },
  };
});

// Mock the native Apple auth wrapper (expo-apple-authentication is unavailable
// in Jest). `appleLogin` calls signInWithApple() and the REAL exchangeAppleCode
// helper above, so the fetch URL/payload assertions exercise production code.
const mockSignInWithApple = jest.fn();
jest.mock('./appleAuth', () => ({
  APPLE_SIGN_IN_CANCELLED: 'ERR_REQUEST_CANCELED',
  isAppleAuthAvailable: jest.fn().mockResolvedValue(true),
  signInWithApple: (...args: unknown[]): unknown =>
    mockSignInWithApple(...args),
}));

// Mock app-config/native so getMobileOAuthConfig() reads our test URL
jest.mock('@legacy-sports/app-config/native', () => ({
  config: {
    oauthProxy: 'https://oauth-proxy.example.com',
    googleClientId: 'test-google-client-id',
    graphqlHost: 'https://test.api.example.com/graphql',
  },
}));

// Mock env utilities (still used by AuthHooks for BYPASS_AUTH)
const mockEnvVars: Record<string, string> = {};

jest.mock('@legacy-sports/env-utilities', () => ({
  getEnvVarRequired: (key: string) => {
    const val = mockEnvVars[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
  },
  getEnvVarOptional: (key: string) => mockEnvVars[key] ?? undefined,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a fake JWT string that jwt-decode can parse (base64url-encoded payload) */
function createFakeJwt(payload: LegacySportsJwt): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'fake-signature';
  return `${header}.${body}.${signature}`;
}

const TEST_USER: LegacySportsJwt = {
  id: 42,
  email: 'test@example.com',
  username: 'testuser',
  isAdmin: false,
  about: null,
};

const TEST_JWT = createFakeJwt(TEST_USER);

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AuthHooks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Re-establish default mock implementations after resetAllMocks
    mockGetItem.mockImplementation((key: string) =>
      Promise.resolve(mockSecureStorage[key] ?? null),
    );
    mockSetItem.mockImplementation((key: string, value: string) => {
      mockSecureStorage[key] = value;
      return Promise.resolve();
    });
    mockRemoveItem.mockImplementation((key: string) => {
      delete mockSecureStorage[key];
      return Promise.resolve();
    });
    // Clear mock secure storage
    Object.keys(mockSecureStorage).forEach(
      (key) => delete mockSecureStorage[key],
    );
    // Reset env vars
    delete mockEnvVars['EXPO_PUBLIC_BYPASS_AUTH'];
  });

  // ── readKeychainValue ───────────────────────────────────────────────────

  describe('readKeychainValue', () => {
    it('returns stored value from secure storage', async () => {
      mockSecureStorage['INTERNAL_JWT'] = TEST_JWT;

      const result = await readKeychainValue(Secret.INTERNAL_JWT);
      expect(result).toBe(TEST_JWT);
      expect(mockGetItem).toHaveBeenCalledWith('INTERNAL_JWT');
    });

    it('returns null when no value is stored', async () => {
      const result = await readKeychainValue(Secret.INTERNAL_JWT);
      expect(result).toBeNull();
    });

    it('returns null and logs error when secure storage throws', async () => {
      mockGetItem.mockRejectedValueOnce(new Error('Storage unavailable'));

      const result = await readKeychainValue(Secret.INTERNAL_JWT);
      expect(result).toBeNull();
    });
  });

  // ── getJwt ──────────────────────────────────────────────────────────────

  describe('getJwt', () => {
    it('decodes and returns JWT payload from secure storage', async () => {
      mockSecureStorage['INTERNAL_JWT'] = TEST_JWT;

      const jwt = await getJwt();
      expect(jwt).toMatchObject({
        id: 42,
        email: 'test@example.com',
        username: 'testuser',
        isAdmin: false,
      });
    });

    it('returns null when no JWT is stored', async () => {
      const jwt = await getJwt();
      expect(jwt).toBeNull();
    });
  });

  // ── useAuthHandlers: Google Login ─────────────────────────────────────

  describe('useAuthHandlers - googleLogin', () => {
    it('exchanges server auth code for JWT and stores token', async () => {
      mockSignIn.mockResolvedValue({ serverAuthCode: 'auth-code-123' });
      mockFetch.mockResolvedValue(okJsonResponse({ jwt: TEST_JWT }));

      const onSuccess = jest.fn();
      const { result } = renderHook(() => useAuthHandlers({ onSuccess }));

      await act(async () => {
        await result.current.googleLogin();
      });

      // Native serverAuthCode must be sent as `code` with an explicit empty
      // `redirect_uri` (the LS-5082 fix), to the `/google` route (the LS-5084
      // fix) — both now enforced by the shared helper.
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth-proxy.example.com/google',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ code: 'auth-code-123', redirect_uri: '' }),
        }),
      );
      expect(mockSetItem).toHaveBeenCalledWith('INTERNAL_JWT', TEST_JWT);
      expect(onSuccess).toHaveBeenCalled();
    });

    it('exchanges authorization code flow for JWT', async () => {
      mockSignIn.mockResolvedValue({ code: 'web-auth-code' });
      mockFetch.mockResolvedValue(okJsonResponse({ jwt: TEST_JWT }));

      const { result } = renderHook(() => useAuthHandlers());

      await act(async () => {
        await result.current.googleLogin();
      });

      // Bare code leaves `redirect_uri` unset so the proxy applies its default.
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth-proxy.example.com/google',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ code: 'web-auth-code' }),
        }),
      );
    });

    it('exchanges credential (One Tap ID token) for JWT', async () => {
      mockSignIn.mockResolvedValue({ credential: 'google-id-token' });
      mockFetch.mockResolvedValue(okJsonResponse({ jwt: TEST_JWT }));

      const { result } = renderHook(() => useAuthHandlers());

      await act(async () => {
        await result.current.googleLogin();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth-proxy.example.com/google',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ credential: 'google-id-token' }),
        }),
      );
    });

    it('calls onFailure when OAuth sign-in fails', async () => {
      mockSignIn.mockRejectedValue(new Error('User cancelled'));

      const onFailure = jest.fn();
      const { result } = renderHook(() => useAuthHandlers({ onFailure }));

      await act(async () => {
        await result.current.googleLogin();
      });

      expect(onFailure).toHaveBeenCalledWith(expect.any(String));
      expect(mockSetItem).not.toHaveBeenCalled();
    });

    it('calls onFailure when OAuth proxy returns error', async () => {
      mockSignIn.mockResolvedValue({ serverAuthCode: 'auth-code-123' });
      mockFetch.mockRejectedValue(new Error('Network Error'));

      const onFailure = jest.fn();
      const { result } = renderHook(() => useAuthHandlers({ onFailure }));

      await act(async () => {
        await result.current.googleLogin();
      });

      expect(onFailure).toHaveBeenCalledWith('Network Error');
    });

    it('handles OAuthError objects from provider', async () => {
      const oauthError = {
        code: 'SIGN_IN_CANCELLED',
        message: 'User cancelled the sign-in flow',
      };
      mockSignIn.mockRejectedValue(oauthError);

      const onFailure = jest.fn();
      const { result } = renderHook(() => useAuthHandlers({ onFailure }));

      await act(async () => {
        await result.current.googleLogin();
      });

      expect(onFailure).toHaveBeenCalledWith('User cancelled the sign-in flow');
    });

    it('calls onFailure when response has no valid auth code or credential', async () => {
      mockSignIn.mockResolvedValue({});

      const onFailure = jest.fn();
      const { result } = renderHook(() => useAuthHandlers({ onFailure }));

      await act(async () => {
        await result.current.googleLogin();
      });

      // The shared payload builder throws before any network call is made.
      expect(mockFetch).not.toHaveBeenCalled();
      expect(onFailure).toHaveBeenCalledWith(
        'No valid authentication code or credential received',
      );
    });
  });

  // ── useAuthHandlers: Apple Login ──────────────────────────────────────

  describe('useAuthHandlers - appleLogin', () => {
    it('exchanges the Apple identity token for a JWT and stores it', async () => {
      mockSignInWithApple.mockResolvedValue({
        identityToken: 'apple-id-token',
        fullName: 'Jane Doe',
      });
      mockFetch.mockResolvedValue(okJsonResponse({ jwt: TEST_JWT }));

      const onSuccess = jest.fn();
      const { result } = renderHook(() => useAuthHandlers({ onSuccess }));

      await act(async () => {
        await result.current.appleLogin();
      });

      // The identity token must be POSTed to the `/apple` route.
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth-proxy.example.com/apple',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            identityToken: 'apple-id-token',
            fullName: 'Jane Doe',
          }),
        }),
      );
      expect(mockSetItem).toHaveBeenCalledWith('INTERNAL_JWT', TEST_JWT);
      expect(onSuccess).toHaveBeenCalled();
    });

    it('reports onFailure with undefined when the user cancels', async () => {
      mockSignInWithApple.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });

      const onFailure = jest.fn();
      const { result } = renderHook(() => useAuthHandlers({ onFailure }));

      await act(async () => {
        await result.current.appleLogin();
      });

      // Cancellation clears any in-flight error state without surfacing a
      // user-facing failure message, and no exchange/storage happens.
      expect(onFailure).toHaveBeenCalledWith(undefined);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSetItem).not.toHaveBeenCalled();
    });

    it('reports onFailure with a message when the exchange fails', async () => {
      mockSignInWithApple.mockResolvedValue({
        identityToken: 'apple-id-token',
      });
      mockFetch.mockRejectedValue(new Error('Network Error'));

      const onFailure = jest.fn();
      const { result } = renderHook(() => useAuthHandlers({ onFailure }));

      await act(async () => {
        await result.current.appleLogin();
      });

      expect(onFailure).toHaveBeenCalledWith('Network Error');
      expect(mockSetItem).not.toHaveBeenCalled();
    });
  });

  // ── useAuthHandlers: Logout ───────────────────────────────────────────

  describe('useAuthHandlers - logout', () => {
    it('signs out via OAuthProvider and clears secure storage', async () => {
      mockSecureStorage['INTERNAL_JWT'] = TEST_JWT;
      mockSecureStorage['GOOGLE_JWT'] = 'google-token';
      mockSignOut.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuthHandlers());

      await act(() => result.current.logout());

      expect(mockSignOut).toHaveBeenCalled();
      expect(mockRemoveItem).toHaveBeenCalledWith('GOOGLE_JWT');
      expect(mockRemoveItem).toHaveBeenCalledWith('INTERNAL_JWT');
      expect(mockReplace).toHaveBeenCalledWith('/');
    });

    it('continues logout even if OAuthProvider.signOut fails', async () => {
      mockSignOut.mockRejectedValue(new Error('Sign-out error'));

      const { result } = renderHook(() => useAuthHandlers());

      await act(() => result.current.logout());

      // Token clearing and redirect should still happen
      expect(mockRemoveItem).toHaveBeenCalledWith('INTERNAL_JWT');
      expect(mockReplace).toHaveBeenCalledWith('/');
    });

    it('navigates to root after logout', async () => {
      mockSignOut.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuthHandlers());

      await act(() => result.current.logout());

      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  // ── useCurrentUserInfo ────────────────────────────────────────────────

  describe('useCurrentUserInfo', () => {
    it('returns user info when valid JWT exists in storage', async () => {
      mockSecureStorage['INTERNAL_JWT'] = TEST_JWT;

      const { result } = renderHook(() => useCurrentUserInfo());

      // Initially loading
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toMatchObject({
        id: 42,
        email: 'test@example.com',
        username: 'testuser',
      });
    });

    it('returns null when no JWT exists in storage', async () => {
      // No JWT in storage. The legacy /oauth/google/refresh endpoint was
      // removed in LS-2547 — it was dead code (always 500'd) — so missing
      // JWT now simply resolves to null without an HTTP call.
      const { result } = renderHook(() => useCurrentUserInfo());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBeNull();
      const refreshWasCalled = mockFetch.mock.calls.some(
        ([url]) => typeof url === 'string' && url.includes('/refresh'),
      );
      expect(refreshWasCalled).toBe(false);
    });

    it('returns LOCAL_USER when BYPASS_AUTH is true', async () => {
      mockEnvVars['EXPO_PUBLIC_BYPASS_AUTH'] = 'true';

      const { result } = renderHook(() => useCurrentUserInfo());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toMatchObject({
        id: -1,
        username: 'LOCAL USER',
      });
    });

    it('surfaces an error when BYPASS_AUTH is true in a production build', async () => {
      mockEnvVars['EXPO_PUBLIC_BYPASS_AUTH'] = 'true';
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const { result } = renderHook(() => useCurrentUserInfo());

        await waitFor(() => {
          expect(result.current.loading).toBe(false);
        });

        expect(result.current.data).toBeNull();
        expect(result.current.error?.message).toMatch(
          /BYPASS_AUTH.*production/i,
        );
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });
});
