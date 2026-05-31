import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import axios from 'axios';
// ── Import types for test data ──────────────────────────────────────────────
import type { LegacySportsJwt, OAuthProxyTokens } from './AuthHooks';

// ── Import module under test (jest.mock calls are hoisted above this) ───────
import {
  getJwt,
  readKeychainValue,
  Secret,
  useAuthHandlers,
  useCurrentUserInfo,
} from './AuthHooks';

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockAxiosPost = jest.fn();
mockedAxios.post = mockAxiosPost;

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

jest.mock('@legacy-sports/shared-components', () => ({
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
}));

// Mock env utilities
const mockEnvVars: Record<string, string> = {
  EXPO_PUBLIC_OAUTH_PROXY: 'https://oauth-proxy.example.com',
};

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
    mockEnvVars['EXPO_PUBLIC_OAUTH_PROXY'] = 'https://oauth-proxy.example.com';
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
      const tokenResponse: OAuthProxyTokens = { jwt: TEST_JWT };
      mockSignIn.mockResolvedValue({ serverAuthCode: 'auth-code-123' });
      mockAxiosPost.mockResolvedValue({ data: tokenResponse });

      const onSuccess = jest.fn();
      const { result } = renderHook(() => useAuthHandlers({ onSuccess }));

      await act(async () => {
        await result.current.googleLogin();
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://oauth-proxy.example.com/google/auth',
        { code: 'auth-code-123', redirect_uri: '' },
      );
      expect(mockSetItem).toHaveBeenCalledWith('INTERNAL_JWT', TEST_JWT);
      expect(onSuccess).toHaveBeenCalled();
    });

    it('exchanges authorization code flow for JWT', async () => {
      const tokenResponse: OAuthProxyTokens = { jwt: TEST_JWT };
      mockSignIn.mockResolvedValue({ code: 'web-auth-code' });
      mockAxiosPost.mockResolvedValue({ data: tokenResponse });

      const { result } = renderHook(() => useAuthHandlers());

      await act(async () => {
        await result.current.googleLogin();
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://oauth-proxy.example.com/google/auth',
        { code: 'web-auth-code' },
      );
    });

    it('exchanges credential (One Tap ID token) for JWT', async () => {
      const tokenResponse: OAuthProxyTokens = { jwt: TEST_JWT };
      mockSignIn.mockResolvedValue({ credential: 'google-id-token' });
      mockAxiosPost.mockResolvedValue({ data: tokenResponse });

      const { result } = renderHook(() => useAuthHandlers());

      await act(async () => {
        await result.current.googleLogin();
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://oauth-proxy.example.com/google/auth',
        { credential: 'google-id-token' },
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
      mockAxiosPost.mockRejectedValue(new Error('Network Error'));

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
      mockAxiosPost.mockResolvedValue({ data: { jwt: TEST_JWT } });

      const onFailure = jest.fn();
      const { result } = renderHook(() => useAuthHandlers({ onFailure }));

      await act(async () => {
        await result.current.googleLogin();
      });

      expect(onFailure).toHaveBeenCalledWith(
        'No valid authentication code or credential received',
      );
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
      const refreshWasCalled = mockAxiosPost.mock.calls.some(
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
  });
});
