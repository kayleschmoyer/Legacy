import React from 'react';
import { renderToString } from 'react-dom/server';
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

  it('renders the LoginPage for an unauthenticated user on a protected path (auth is always enforced — no test-mode bypass)', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    MockedAuthService.mockImplementation(
      () => makeMockAuthService() as unknown as AuthService,
    );
    // A non-public route: the guard must wall it off behind login. This locks
    // the removal of the former `testMode` escape hatch, which could short-
    // circuit authentication and return children unconditionally (LS-7942).
    setLocation('/baseball/league/1');

    render(
      <AuthProvider config={testConfig}>
        <EnhancedAuthGuard>
          <div data-testid="app">app</div>
        </EnhancedAuthGuard>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeTruthy();
    });
    expect(screen.queryByTestId('app')).toBeNull();
  });

  it('shows the LoginPage when an authenticated user is logged out while on a public path', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    const mockInstance = makeMockAuthService({
      getStoredUserProfile: jest.fn(() => ({
        id: 1,
        email: 'user@test.com',
        username: 'ActiveUser',
        accessLevel: 'none' as const,
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
  it('shows the LoginPage when sign-in and a session-expiry logout are batched into one render (LS-11057)', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    MockedAuthService.mockImplementation(
      () => makeMockAuthService() as unknown as AuthService,
    );
    setLocation('/about');

    render(
      <AuthProvider config={testConfig}>
        <EnhancedAuthGuard publicPaths={['/about']}>
          <div data-testid="app">app</div>
        </EnhancedAuthGuard>
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeTruthy();
    });

    // AUTH_SUCCESS followed by a forced AUTH_LOGOUT before React commits a
    // render with isAuthenticated=true — the WebKit timing where a restored
    // session and a fast 401 refresh rejection land in the same batch.
    act(() => {
      window.dispatchEvent(
        new CustomEvent('auth:token-refreshed', {
          detail: {
            user: {
              id: 1,
              email: 'user@test.com',
              username: 'ActiveUser',
              accessLevel: 'none',
            },
          },
        }),
      );
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeTruthy();
    });
    expect(screen.queryByTestId('app')).toBeNull();
  });

  it('keeps the public-path bypass for a visitor who was never signed in', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    MockedAuthService.mockImplementation(
      () => makeMockAuthService() as unknown as AuthService,
    );
    setLocation('/about');

    render(
      <AuthProvider config={testConfig}>
        <EnhancedAuthGuard publicPaths={['/about']}>
          <div data-testid="app">app</div>
        </EnhancedAuthGuard>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeTruthy();
    });
    expect(screen.queryByTestId('login-page')).toBeNull();
  });
});

describe('EnhancedAuthGuard – client-side navigation from a public path (LS-10488)', () => {
  function renderAtPath(path: string) {
    const MockedAuthService = jest.mocked(AuthService);
    MockedAuthService.mockImplementation(
      () => makeMockAuthService() as unknown as AuthService,
    );
    const ui = (currentPath: string) => (
      <AuthProvider config={testConfig}>
        <EnhancedAuthGuard currentPath={currentPath} publicPaths={['/pricing']}>
          <div data-testid="app">app</div>
        </EnhancedAuthGuard>
      </AuthProvider>
    );
    const view = render(ui(path));
    return { rerenderAt: (p: string) => view.rerender(ui(p)) };
  }

  it('shows the login screen when a signed-out user navigates from a public to a protected path', async () => {
    const { rerenderAt } = renderAtPath('/pricing');
    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeTruthy();
    });

    // Same auth state, new path: the guard must re-gate on the new path.
    rerenderAt('/profile/subscription');

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeTruthy();
    });
    expect(screen.queryByTestId('app')).toBeNull();
  });

  it('shows the loading state, not the page, on a protected path while auth is resolving', () => {
    const MockedAuthService = jest.mocked(AuthService);
    MockedAuthService.mockImplementation(
      () => makeMockAuthService() as unknown as AuthService,
    );
    // Effects do not run in a server render, so AuthProvider is still in its
    // initial isLoading state — the window a mid-session navigation hits.
    const html = renderToString(
      <AuthProvider config={testConfig}>
        <EnhancedAuthGuard
          currentPath="/profile/subscription"
          publicPaths={['/pricing']}
        >
          <div data-testid="app">app</div>
        </EnhancedAuthGuard>
      </AuthProvider>,
    );
    expect(html).toContain('Loading...');
    expect(html).not.toContain('data-testid="app"');
  });
});

describe('EnhancedAuthGuard – premium path interception', () => {
  function makeAuthenticatedService() {
    return makeMockAuthService({
      getStoredUserProfile: jest.fn(() => ({
        id: 1,
        email: 'user@test.com',
        username: 'FreeUser',
        accessLevel: 'none' as const,
      })),
      getStoredTokenExpiry: jest.fn(() => Math.floor(Date.now() / 1000) + 3600),
    });
  }

  beforeEach(() => {
    localStorage.clear();
    setLocation('/');
  });

  it('renders children on a premium path when isPremiumUser is true', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    MockedAuthService.mockImplementation(
      () => makeAuthenticatedService() as unknown as AuthService,
    );
    setLocation('/leagues/1/analytics');

    render(
      <AuthProvider config={testConfig}>
        <EnhancedAuthGuard premiumPaths={['/leagues']} isPremiumUser={true}>
          <div data-testid="app">app</div>
        </EnhancedAuthGuard>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeTruthy();
    });
  });

  it('renders premiumFallback on a premium prefix path when isPremiumUser is false', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    MockedAuthService.mockImplementation(
      () => makeAuthenticatedService() as unknown as AuthService,
    );
    setLocation('/leagues/1/analytics');

    render(
      <AuthProvider config={testConfig}>
        <EnhancedAuthGuard
          premiumPaths={['/leagues']}
          isPremiumUser={false}
          premiumFallback={<div data-testid="upgrade">upgrade</div>}
        >
          <div data-testid="app">app</div>
        </EnhancedAuthGuard>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('upgrade')).toBeTruthy();
    });
    expect(screen.queryByTestId('app')).toBeNull();
  });

  it('renders premiumFallback on a premium exact path when isPremiumUser is false', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    MockedAuthService.mockImplementation(
      () => makeAuthenticatedService() as unknown as AuthService,
    );
    setLocation('/leagues/1/analytics');

    render(
      <AuthProvider config={testConfig}>
        <EnhancedAuthGuard
          premiumExactPaths={['/leagues/1/analytics']}
          isPremiumUser={false}
          premiumFallback={<div data-testid="upgrade">upgrade</div>}
        >
          <div data-testid="app">app</div>
        </EnhancedAuthGuard>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('upgrade')).toBeTruthy();
    });
    expect(screen.queryByTestId('app')).toBeNull();
  });

  it('renders children on a non-premium path even when isPremiumUser is false', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    MockedAuthService.mockImplementation(
      () => makeAuthenticatedService() as unknown as AuthService,
    );
    setLocation('/baseball');

    render(
      <AuthProvider config={testConfig}>
        <EnhancedAuthGuard
          premiumPaths={['/leagues']}
          isPremiumUser={false}
          premiumFallback={<div data-testid="upgrade">upgrade</div>}
        >
          <div data-testid="app">app</div>
        </EnhancedAuthGuard>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeTruthy();
    });
    expect(screen.queryByTestId('upgrade')).toBeNull();
  });

  it('renders children when isPremiumUser is undefined even on a premium path', async () => {
    const MockedAuthService = jest.mocked(AuthService);
    MockedAuthService.mockImplementation(
      () => makeAuthenticatedService() as unknown as AuthService,
    );
    setLocation('/leagues/1/analytics');

    render(
      <AuthProvider config={testConfig}>
        <EnhancedAuthGuard
          premiumPaths={['/leagues']}
          premiumFallback={<div data-testid="upgrade">upgrade</div>}
        >
          <div data-testid="app">app</div>
        </EnhancedAuthGuard>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeTruthy();
    });
    expect(screen.queryByTestId('upgrade')).toBeNull();
  });
});
