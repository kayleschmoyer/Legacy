import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AuthProvider, useAuth } from './useAuth';
import type { OAuthConfig } from '../../../platform-components/types';
import { AuthService } from '../services/AuthService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const testConfig: OAuthConfig = {
  googleClientId: 'test-client-id',
  oauthProxyUrl: 'http://localhost:5001',
};

/** Simple consumer that renders auth state for assertions. */
function AuthConsumer() {
  const { user, isLoading, updateUserProfile } = useAuth();
  if (isLoading) return <div data-testid="loading">loading</div>;
  if (!user) return <div data-testid="no-user">no user</div>;
  return (
    <div>
      <div data-testid="user-info">
        {user.username}|{user.accessLevel}
      </div>
      <button
        data-testid="update-username"
        onClick={() => updateUserProfile({ username: 'NewName' })}
      />
    </div>
  );
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock AuthService so no real network calls happen
jest.mock('../services/AuthService', () => {
  // Re-export the real error class so instanceof checks in useAuth.tsx work
  const actual = jest.requireActual<typeof import('../services/AuthService')>(
    '../services/AuthService',
  );
  return {
    AuthSessionExpiredError: actual.AuthSessionExpiredError,
    AuthService: jest.fn().mockImplementation(() => ({
      getStoredUserProfile: jest.fn(() => null),
      getStoredTokenExpiry: jest.fn(() => null),
      getStoredAdminProfile: jest.fn(() => null),
      getStoredImpersonatedUserProfile: jest.fn(() => null),
      storeUserProfile: jest.fn(),
      storeAdminProfile: jest.fn(),
      storeImpersonatedUserProfile: jest.fn(),
      clearAdminProfile: jest.fn(),
      clearImpersonatedUserProfile: jest.fn(),
      clearTokens: jest.fn(),
      verifyToken: jest.fn(() => false),
      refreshJwt: jest.fn(() => Promise.resolve(null)),
      authenticateWithEmail: jest.fn(),
      authenticateWithOAuth: jest.fn(),
      requestLogout: jest.fn(() => Promise.resolve()),
      startImpersonation: jest.fn(() =>
        Promise.resolve({
          id: 99,
          email: 'impersonated@test.com',
          username: 'ImpersonatedUser',
          accessLevel: 'none' as const,
        }),
      ),
      stopImpersonation: jest.fn(() => Promise.resolve()),
      getStoredToken: jest.fn(() => null),
      getCurrentToken: jest.fn(() => null),
    })),
  };
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthProvider – auth:token-refreshed event', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updates user state when auth:token-refreshed event is dispatched', async () => {
    render(
      <AuthProvider config={testConfig}>
        <AuthConsumer />
      </AuthProvider>,
    );

    // Wait for initial loading to finish (no cached profile → no user)
    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeTruthy();
    });

    // Simulate the Apollo error link dispatching a token-refreshed event
    // (e.g. after a 401 → silent refresh → new JWT with admin accessLevel)
    act(() => {
      window.dispatchEvent(
        new CustomEvent('auth:token-refreshed', {
          detail: {
            user: {
              id: 42,
              email: 'admin@test.com',
              username: 'AdminUser',
              accessLevel: 'admin',
            },
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
        }),
      );
    });

    // The auth state should now reflect the refreshed user
    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe(
        'AdminUser|admin',
      );
    });
  });

  it('updates from none to admin when accessLevel changes', async () => {
    // Pre-populate localStorage with a "user" profile so the provider
    // restores it on mount (simulating an existing session)
    const MockedAuthService = jest.mocked(AuthService);
    const mockInstance = {
      getStoredUserProfile: jest.fn(() => ({
        id: 42,
        email: 'user@test.com',
        username: 'RegularUser',
        accessLevel: 'none',
      })),
      getStoredTokenExpiry: jest.fn(() => Math.floor(Date.now() / 1000) + 3600),
      getStoredAdminProfile: jest.fn(() => null),
      getStoredImpersonatedUserProfile: jest.fn(() => null),
      storeUserProfile: jest.fn(),
      storeAdminProfile: jest.fn(),
      storeImpersonatedUserProfile: jest.fn(),
      clearAdminProfile: jest.fn(),
      clearImpersonatedUserProfile: jest.fn(),
      clearTokens: jest.fn(),
      verifyToken: jest.fn(() => false),
      refreshJwt: jest.fn(() => Promise.resolve(null)),
      authenticateWithEmail: jest.fn(),
      authenticateWithOAuth: jest.fn(),
      requestLogout: jest.fn(() => Promise.resolve()),
      startImpersonation: jest.fn(() =>
        Promise.resolve({
          id: 99,
          email: 'impersonated@test.com',
          username: 'ImpersonatedUser',
          accessLevel: 'none' as const,
        }),
      ),
      stopImpersonation: jest.fn(() => Promise.resolve()),
      getStoredToken: jest.fn(() => null),
      getCurrentToken: jest.fn(() => null),
    };
    MockedAuthService.mockImplementation(
      () => mockInstance as unknown as AuthService,
    );

    render(
      <AuthProvider config={testConfig}>
        <AuthConsumer />
      </AuthProvider>,
    );

    // Initially shows the cached user profile
    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe(
        'RegularUser|none',
      );
    });

    // Now dispatch an event simulating the token refresh returned admin claims
    act(() => {
      window.dispatchEvent(
        new CustomEvent('auth:token-refreshed', {
          detail: {
            user: {
              id: 42,
              email: 'user@test.com',
              username: 'RegularUser',
              accessLevel: 'admin',
            },
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
        }),
      );
    });

    // The access level should now be admin — no page refresh needed
    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe(
        'RegularUser|admin',
      );
    });

    // storeUserProfile should have been called with the updated profile
    expect(mockInstance.storeUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ accessLevel: 'admin' }),
    );
  });
});

describe('AuthProvider – auth:session-expired event', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clears tokens and logs out when auth:session-expired is dispatched', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    const mockInstance = {
      getStoredUserProfile: jest.fn(() => ({
        id: 42,
        email: 'user@test.com',
        username: 'ActiveUser',
        accessLevel: 'none' as const,
      })),
      getStoredTokenExpiry: jest.fn(() => Math.floor(Date.now() / 1000) + 3600),
      getStoredAdminProfile: jest.fn(() => null),
      getStoredImpersonatedUserProfile: jest.fn(() => null),
      storeUserProfile: jest.fn(),
      storeAdminProfile: jest.fn(),
      storeImpersonatedUserProfile: jest.fn(),
      clearAdminProfile: jest.fn(),
      clearImpersonatedUserProfile: jest.fn(),
      clearTokens: jest.fn(),
      verifyToken: jest.fn(() => false),
      refreshJwt: jest.fn(() => Promise.resolve(null)),
      authenticateWithEmail: jest.fn(),
      authenticateWithOAuth: jest.fn(),
      requestLogout: jest.fn(() => Promise.resolve()),
      startImpersonation: jest.fn(),
      stopImpersonation: jest.fn(),
      getStoredToken: jest.fn(() => null),
      getCurrentToken: jest.fn(() => null),
    };
    MockedAuthService.mockImplementation(
      () => mockInstance as unknown as AuthService,
    );

    render(
      <AuthProvider config={testConfig}>
        <AuthConsumer />
      </AuthProvider>,
    );

    // Wait for the cached session to restore the user
    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe(
        'ActiveUser|none',
      );
    });

    // Simulate the Apollo error link signalling that the server definitively
    // rejected the JWT refresh (401/403 from /oauth/refresh-jwt)
    act(() => {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    });

    // The user should now be logged out
    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeTruthy();
    });

    // clearTokens must be called to remove stale localStorage state
    expect(mockInstance.clearTokens).toHaveBeenCalled();
  });
});

describe('AuthProvider – updateUserProfile', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updates username in auth state and persists to stored profile', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    const storedProfile = {
      id: 1,
      email: 'test@test.com',
      username: 'OldName',
      accessLevel: 'none' as const,
    };
    const mockInstance = {
      getStoredUserProfile: jest.fn(() => storedProfile),
      getStoredTokenExpiry: jest.fn(() => Math.floor(Date.now() / 1000) + 3600),
      getStoredAdminProfile: jest.fn(() => null),
      getStoredImpersonatedUserProfile: jest.fn(() => null),
      storeUserProfile: jest.fn(),
      storeAdminProfile: jest.fn(),
      storeImpersonatedUserProfile: jest.fn(),
      clearAdminProfile: jest.fn(),
      clearImpersonatedUserProfile: jest.fn(),
      clearTokens: jest.fn(),
      verifyToken: jest.fn(() => false),
      refreshJwt: jest.fn(() => Promise.resolve(null)),
      authenticateWithEmail: jest.fn(),
      authenticateWithOAuth: jest.fn(),
      requestLogout: jest.fn(() => Promise.resolve()),
      startImpersonation: jest.fn(() =>
        Promise.resolve({
          id: 99,
          email: 'impersonated@test.com',
          username: 'ImpersonatedUser',
          accessLevel: 'none' as const,
        }),
      ),
      stopImpersonation: jest.fn(() => Promise.resolve()),
      getStoredToken: jest.fn(() => null),
      getCurrentToken: jest.fn(() => null),
    };
    MockedAuthService.mockImplementation(
      () => mockInstance as unknown as AuthService,
    );

    render(
      <AuthProvider config={testConfig}>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe('OldName|none');
    });

    act(() => {
      fireEvent.click(screen.getByTestId('update-username'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe('NewName|none');
    });

    expect(mockInstance.storeUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'NewName', id: 1 }),
    );
  });

  it('skips persistence during impersonation', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    const adminProfile = {
      id: 99,
      email: 'admin@test.com',
      username: 'AdminUser',
      accessLevel: 'admin' as const,
    };
    const impersonatedUser = {
      id: 5,
      email: 'target@test.com',
      username: 'TargetUser',
      accessLevel: 'none' as const,
    };

    const mockInstance = {
      getStoredUserProfile: jest.fn(() => null),
      getStoredTokenExpiry: jest.fn(() => null),
      getStoredAdminProfile: jest.fn(() => adminProfile),
      getStoredImpersonatedUserProfile: jest.fn(() => impersonatedUser),
      clearImpersonatedUserProfile: jest.fn(),
      storeUserProfile: jest.fn(),
      storeAdminProfile: jest.fn(),
      storeImpersonatedUserProfile: jest.fn(),
      clearAdminProfile: jest.fn(),
      clearTokens: jest.fn(),
      verifyToken: jest.fn(() => true),
      refreshJwt: jest.fn(() => Promise.resolve(null)),
      authenticateWithEmail: jest.fn(),
      authenticateWithOAuth: jest.fn(),
      requestLogout: jest.fn(() => Promise.resolve()),
      startImpersonation: jest.fn(() => Promise.resolve(impersonatedUser)),
      stopImpersonation: jest.fn(() => Promise.resolve()),
      getStoredToken: jest.fn(() => null),
      getCurrentToken: jest.fn(() => null),
    };
    MockedAuthService.mockImplementation(
      () => mockInstance as unknown as AuthService,
    );

    render(
      <AuthProvider config={testConfig}>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe(
        'TargetUser|none',
      );
    });

    // Clear mock calls from initialization
    mockInstance.storeUserProfile.mockClear();

    act(() => {
      fireEvent.click(screen.getByTestId('update-username'));
    });

    // UI should update even during impersonation
    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe('NewName|none');
    });

    // But storeUserProfile should NOT have been called (impersonation guard)
    expect(mockInstance.storeUserProfile).not.toHaveBeenCalled();
  });
});

describe('AuthProvider – background refresh 401 during initializeAuth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('logs out the user when the background refresh returns AuthSessionExpiredError (401)', async () => {
    const { AuthSessionExpiredError: SessionExpiredError } = jest.requireActual<
      typeof import('../services/AuthService')
    >('../services/AuthService');

    const MockedAuthService = jest.mocked(AuthService);
    const mockInstance = {
      getStoredUserProfile: jest.fn(() => ({
        id: 1,
        email: 'user@test.com',
        username: 'CachedUser',
        accessLevel: 'none' as const,
      })),
      getStoredTokenExpiry: jest.fn(() => Math.floor(Date.now() / 1000) + 3600),
      getStoredAdminProfile: jest.fn(() => null),
      getStoredImpersonatedUserProfile: jest.fn(() => null),
      storeUserProfile: jest.fn(),
      storeAdminProfile: jest.fn(),
      storeImpersonatedUserProfile: jest.fn(),
      clearAdminProfile: jest.fn(),
      clearImpersonatedUserProfile: jest.fn(),
      clearTokens: jest.fn(),
      verifyToken: jest.fn(() => false),
      // Simulate a 401 from the /refresh-jwt endpoint
      refreshJwt: jest.fn(() => Promise.reject(new SessionExpiredError())),
      authenticateWithEmail: jest.fn(),
      authenticateWithOAuth: jest.fn(),
      requestLogout: jest.fn(() => Promise.resolve()),
      startImpersonation: jest.fn(),
      stopImpersonation: jest.fn(),
      getStoredToken: jest.fn(() => null),
      getCurrentToken: jest.fn(() => null),
    };
    MockedAuthService.mockImplementation(
      () => mockInstance as unknown as AuthService,
    );

    render(
      <AuthProvider config={testConfig}>
        <AuthConsumer />
      </AuthProvider>,
    );

    // The background refresh fails with 401 — the user should be logged out
    // rather than remaining in a broken authenticated state.
    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeTruthy();
    });

    expect(mockInstance.clearTokens).toHaveBeenCalled();
  });
});

describe('AuthProvider – proactive refresh 401 during scheduleProactiveRefresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('logs out the user when the proactive refresh timer fires and returns AuthSessionExpiredError', async () => {
    const { AuthSessionExpiredError: SessionExpiredError } = jest.requireActual<
      typeof import('../services/AuthService')
    >('../services/AuthService');

    const MockedAuthService = jest.mocked(AuthService);
    // Token expires in 4 minutes (within the 5-minute proactive window → timer fires immediately)
    const nowSec = Math.floor(Date.now() / 1000);
    const expirySec = nowSec + 4 * 60;
    const mockInstance = {
      getStoredUserProfile: jest.fn(() => ({
        id: 1,
        email: 'user@test.com',
        username: 'CachedUser',
        accessLevel: 'none' as const,
      })),
      getStoredTokenExpiry: jest.fn(() => expirySec),
      getStoredAdminProfile: jest.fn(() => null),
      getStoredImpersonatedUserProfile: jest.fn(() => null),
      storeUserProfile: jest.fn(),
      storeAdminProfile: jest.fn(),
      storeImpersonatedUserProfile: jest.fn(),
      clearAdminProfile: jest.fn(),
      clearImpersonatedUserProfile: jest.fn(),
      clearTokens: jest.fn(),
      verifyToken: jest.fn(() => true),
      refreshJwt: jest.fn(() => Promise.reject(new SessionExpiredError())),
      authenticateWithEmail: jest.fn(),
      authenticateWithOAuth: jest.fn(),
      requestLogout: jest.fn(() => Promise.resolve()),
      startImpersonation: jest.fn(),
      stopImpersonation: jest.fn(),
      getStoredToken: jest.fn(() => null),
      getCurrentToken: jest.fn(() => null),
    };
    MockedAuthService.mockImplementation(
      () => mockInstance as unknown as AuthService,
    );

    render(
      <AuthProvider config={testConfig}>
        <AuthConsumer />
      </AuthProvider>,
    );

    // Wait for initialization to complete (user visible from cache)
    await waitFor(() => {
      expect(screen.getByTestId('user-info')).toBeTruthy();
    });

    // Fire the proactive refresh timer — token expires in 4 min, which is
    // within the 5-minute window, so the timer fires at msUntilRefresh=0.
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // The proactive refresh returned AuthSessionExpiredError → user logged out
    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeTruthy();
    });

    expect(mockInstance.clearTokens).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Logout/login race-condition tests (generation guard + logout promise ref)
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthProvider – logout/login race conditions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not re-authenticate when a background refresh resolves after logout', async () => {
    const MockedAuthService = jest.mocked(AuthService);

    let resolveRefresh!: (token: string | null) => void;
    const refreshPromise = new Promise<string | null>((resolve) => {
      resolveRefresh = resolve;
    });

    const mockInstance = {
      getStoredUserProfile: jest.fn(() => ({
        id: 1,
        email: 'user@test.com',
        username: 'CachedUser',
        accessLevel: 'none' as const,
      })),
      getStoredTokenExpiry: jest.fn(() => Math.floor(Date.now() / 1000) + 3600),
      getStoredAdminProfile: jest.fn(() => null),
      getStoredImpersonatedUserProfile: jest.fn(() => null),
      storeUserProfile: jest.fn(),
      storeAdminProfile: jest.fn(),
      storeImpersonatedUserProfile: jest.fn(),
      clearAdminProfile: jest.fn(),
      clearImpersonatedUserProfile: jest.fn(),
      clearTokens: jest.fn(),
      verifyToken: jest.fn(() => false),
      refreshJwt: jest.fn(() => refreshPromise),
      authenticateWithEmail: jest.fn(),
      authenticateWithOAuth: jest.fn(),
      requestLogout: jest.fn(() => Promise.resolve()),
      startImpersonation: jest.fn(),
      stopImpersonation: jest.fn(),
      getStoredToken: jest.fn(() => null),
      getCurrentToken: jest.fn(() => null),
    };
    MockedAuthService.mockImplementation(
      () => mockInstance as unknown as AuthService,
    );

    let logoutFn!: () => Promise<void>;

    function AuthWithLogout() {
      const { user, isLoading, logout } = useAuth();
      logoutFn = logout;
      if (isLoading) return <div data-testid="loading" />;
      if (!user) return <div data-testid="no-user" />;
      return <div data-testid="user-info">{user.username}</div>;
    }

    render(
      <AuthProvider config={testConfig}>
        <AuthWithLogout />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe('CachedUser');
    });

    // Logout while the background refresh is still in flight
    await act(async () => {
      await logoutFn();
    });

    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeTruthy();
    });

    // Resolve the background refresh — generation guard must block re-auth
    await act(async () => {
      resolveRefresh('fresh-token-after-logout');
      await Promise.resolve();
      await Promise.resolve();
    });

    // User should still be logged out
    expect(screen.getByTestId('no-user')).toBeTruthy();
  });

  it('login completes after waiting for an in-flight logout without deadlocking', async () => {
    const MockedAuthService = jest.mocked(AuthService);

    let resolveLogout!: () => void;
    const logoutServerPromise = new Promise<void>((resolve) => {
      resolveLogout = resolve;
    });

    const newUser = {
      id: 2,
      email: 'new@test.com',
      username: 'NewUser',
      accessLevel: 'none' as const,
    };

    const mockInstance = {
      getStoredUserProfile: jest.fn(() => ({
        id: 1,
        email: 'old@test.com',
        username: 'OldUser',
        accessLevel: 'none' as const,
      })),
      getStoredTokenExpiry: jest.fn(() => Math.floor(Date.now() / 1000) + 3600),
      getStoredAdminProfile: jest.fn(() => null),
      getStoredImpersonatedUserProfile: jest.fn(() => null),
      storeUserProfile: jest.fn(),
      storeAdminProfile: jest.fn(),
      storeImpersonatedUserProfile: jest.fn(),
      clearAdminProfile: jest.fn(),
      clearImpersonatedUserProfile: jest.fn(),
      clearTokens: jest.fn(),
      verifyToken: jest.fn(() => false),
      refreshJwt: jest.fn(() => Promise.resolve(null)),
      authenticateWithEmail: jest.fn(() => Promise.resolve(newUser)),
      authenticateWithOAuth: jest.fn(),
      requestLogout: jest.fn(() => logoutServerPromise),
      startImpersonation: jest.fn(),
      stopImpersonation: jest.fn(),
      getStoredToken: jest.fn(() => null),
      getCurrentToken: jest.fn(() => null),
    };
    MockedAuthService.mockImplementation(
      () => mockInstance as unknown as AuthService,
    );

    let logoutFn!: () => Promise<void>;
    let loginFn!: (email: string, password: string) => Promise<void>;

    function AuthWithActions() {
      const { user, isLoading, logout, login } = useAuth();
      logoutFn = logout;
      loginFn = login;
      if (isLoading) return <div data-testid="loading" />;
      if (!user) return <div data-testid="no-user" />;
      return <div data-testid="user-info">{user.username}</div>;
    }

    render(
      <AuthProvider config={testConfig}>
        <AuthWithActions />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe('OldUser');
    });

    // Trigger logout — client state clears immediately, server call is slow
    act(() => {
      void logoutFn();
    });

    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeTruthy();
    });

    // Start login while requestLogout is still pending — login() should wait
    act(() => {
      void loginFn('new@test.com', 'password');
    });

    // Resolve the server logout — login() should now proceed
    await act(async () => {
      resolveLogout();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Login should complete and show the new user
    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe('NewUser');
    });
  });
});
