/**
 * LS-7782 — PublicLandingPage Discord callback: missing oauthProxyUrl guard.
 *
 * The Discord callback exchange effect must not silently fall back to
 * `http://localhost:5001` when `config.oauthProxyUrl` is unset. Instead it
 * surfaces a configuration error and aborts the exchange (no network call),
 * mirroring the LoginPage fix from LS-6666.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicLandingPage } from './PublicLandingPage';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@legacy-sports/shared-components/ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory needs runtime require
  const React = require('react');
  return {
    OAuthProvider: {
      configure: jest.fn(() => Promise.resolve()),
      signIn: jest.fn(),
    },
    XStack: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    ),
    YStack: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    ),
  };
});

// Mutable so individual tests can supply a config without oauthProxyUrl.
let mockAuthConfig: Record<string, unknown> = {};
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({
    config: mockAuthConfig,
    loginWithOAuth: jest.fn(),
    clearError: jest.fn(),
    error: null,
  }),
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('../../lib/csrf', () => ({ storeCsrfToken: jest.fn() }));
jest.mock('../../lib/session-precache', () => ({
  storeDiscordSessionPreCache: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <PublicLandingPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PublicLandingPage Discord callback — oauthProxyUrl guard (LS-7782)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthConfig = {
      googleClientId: 'test-client-id',
      discordClientId: 'test-discord-id',
      oauthProxyUrl: 'http://localhost:5001',
    };
    window.history.replaceState(
      {},
      '',
      '/auth/discord/callback?code=abc&state=xyz',
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.history.replaceState({}, '', '/');
  });

  it('shows a configuration error and does not call fetch when oauthProxyUrl is unset', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    // No oauthProxyUrl — the guard must short-circuit before any network call.
    mockAuthConfig = {
      googleClientId: 'test-client-id',
      discordClientId: 'test-discord-id',
    };

    renderPage();

    expect(
      await screen.findByText(
        'Discord sign-in failed: OAuth proxy URL is not configured.',
      ),
    ).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows an invalid-state error and does not call fetch when code/state are missing', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    // Land on the callback route without the code/state query params.
    window.history.replaceState({}, '', '/auth/discord/callback');

    renderPage();

    expect(
      await screen.findByText(
        'Discord sign-in failed: invalid state. Please try again.',
      ),
    ).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses the configured proxy URL (no localhost fallback) when oauthProxyUrl is set', async () => {
    const fetchSpy = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({ jwt: 'header.payload.sig' }),
      }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;
    mockAuthConfig = {
      googleClientId: 'test-client-id',
      discordClientId: 'test-discord-id',
      oauthProxyUrl: 'https://proxy.example.com',
    };

    // jsdom does not implement navigation; stub window.location so the
    // success-path redirect does not emit a "Not implemented" error.
    const replaceSpy = jest.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        pathname: '/auth/discord/callback',
        search: '?code=abc&state=xyz',
        replace: replaceSpy,
      },
    });

    try {
      renderPage();

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          'https://proxy.example.com/discord',
          expect.objectContaining({ method: 'POST' }),
        );
      });
      await waitFor(() => {
        expect(replaceSpy).toHaveBeenCalled();
      });
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
    }
  });
});
