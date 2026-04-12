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
  return {
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
          accessLevel: 'user' as const,
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

  it('updates from user to admin when accessLevel changes', async () => {
    // Pre-populate localStorage with a "user" profile so the provider
    // restores it on mount (simulating an existing session)
    const MockedAuthService = jest.mocked(AuthService);
    const mockInstance = {
      getStoredUserProfile: jest.fn(() => ({
        id: 42,
        email: 'user@test.com',
        username: 'RegularUser',
        accessLevel: 'user',
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
          accessLevel: 'user' as const,
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
        'RegularUser|user',
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
      accessLevel: 'user' as const,
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
          accessLevel: 'user' as const,
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
      expect(screen.getByTestId('user-info').textContent).toBe('OldName|user');
    });

    act(() => {
      fireEvent.click(screen.getByTestId('update-username'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe('NewName|user');
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
      accessLevel: 'user' as const,
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
        'TargetUser|user',
      );
    });

    // Clear mock calls from initialization
    mockInstance.storeUserProfile.mockClear();

    act(() => {
      fireEvent.click(screen.getByTestId('update-username'));
    });

    // UI should update even during impersonation
    await waitFor(() => {
      expect(screen.getByTestId('user-info').textContent).toBe('NewName|user');
    });

    // But storeUserProfile should NOT have been called (impersonation guard)
    expect(mockInstance.storeUserProfile).not.toHaveBeenCalled();
  });
});
