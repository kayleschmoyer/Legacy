import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from './hooks/useAuth';
import { EnhancedAuthGuard } from './EnhancedAuthGuard';
import { AuthService } from './services/AuthService';
import type { OAuthConfig } from '../../platform-components/types';

const testConfig: OAuthConfig = {
  googleClientId: 'test-client-id',
  oauthProxyUrl: 'http://localhost:5001',
};

jest.mock('./services/AuthService', () => {
  const actual = jest.requireActual<typeof import('./services/AuthService')>(
    './services/AuthService',
  );
  return {
    AuthSessionExpiredError: actual.AuthSessionExpiredError,
    AuthService: jest.fn(),
  };
});

// Stub the LoginPage import since rendering the real one (with all OAuth /
// Tamagui dependencies) is not the focus of these tests.
jest.mock('./LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page">login</div>,
}));

function setLocation(pathname: string) {
  window.history.replaceState({}, '', pathname);
}

function makeMockAuthService(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, jest.Mock> {
  return {
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
    startImpersonation: jest.fn(),
    stopImpersonation: jest.fn(),
    getStoredToken: jest.fn(() => null),
    getCurrentToken: jest.fn(() => null),
    ...overrides,
  } as Record<string, jest.Mock>;
}

describe('EnhancedAuthGuard – session expiry on a public path', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocation('/');
  });

  it('renders children for unauthenticated users on a public path (initial visit)', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    MockedAuthService.mockImplementation(
      () => makeMockAuthService() as unknown as AuthService,
    );
    setLocation('/baseball');

    render(
      <AuthProvider config={testConfig}>
        <EnhancedAuthGuard publicExactPaths={['/baseball']}>
          <div data-testid="app">app</div>
        </EnhancedAuthGuard>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeTruthy();
    });
    expect(screen.queryByTestId('login-page')).toBeNull();
  });

  it('shows the LoginPage when an authenticated user is logged out while on a public path', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    const mockInstance = makeMockAuthService({
      getStoredUserProfile: jest.fn(() => ({
        id: 1,
        email: 'user@test.com',
        username: 'ActiveUser',
        accessLevel: 'user' as const,
      })),
      getStoredTokenExpiry: jest.fn(() => Math.floor(Date.now() / 1000) + 3600),
    });
    MockedAuthService.mockImplementation(
      () => mockInstance as unknown as AuthService,
    );
    setLocation('/baseball');

    render(
      <AuthProvider config={testConfig}>
        <EnhancedAuthGuard publicExactPaths={['/baseball']}>
          <div data-testid="app">app</div>
        </EnhancedAuthGuard>
      </AuthProvider>,
    );

    // Cached profile restores the user → guard renders the app
    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeTruthy();
    });

    // Simulate session expiry (Apollo error link → AuthProvider listener)
    act(() => {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    });

    // Guard must now show LoginPage even though /baseball is a public exact path
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeTruthy();
    });
    expect(screen.queryByTestId('app')).toBeNull();
  });
});
