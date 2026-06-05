/**
 * LS-4839 — handleSignIn catch block: SIGN_IN_CANCELLED vs real auth failures.
 *
 * Covers:
 *   1. Closing the Google popup (SIGN_IN_CANCELLED) → LOGGER.debug, no error message.
 *   2. A genuine auth failure → LOGGER.error with the Error instance, error message shown.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LOGGER } from '@legacy-sports/logging';
import { OAuthProvider } from '@legacy-sports/shared-components/ui';
import { LoginPage } from './LoginPage';

// ---------------------------------------------------------------------------
// Module mocks — factories use jest.fn() inline to avoid hoisting/TDZ issues
// ---------------------------------------------------------------------------

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  OAuthProvider: {
    configure: jest.fn(() => Promise.resolve()),
    signIn: jest.fn(),
  },
  OAuthErrorCode: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    NETWORK_ERROR: 'NETWORK_ERROR',
    CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  },
}));

// Mutable so individual tests can supply a faulting config (e.g. a getter that
// throws synchronously to model a hot-swapped config — see LS-6687).
let mockAuthConfig: Record<string, unknown> = {};
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({
    config: mockAuthConfig,
    loginWithOAuth: jest.fn(),
    error: null,
  }),
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('../../lib/csrf', () => ({ storeCsrfToken: jest.fn() }));
jest.mock('../../config/environment', () => ({
  env: {
    baseUrl: '/',
    oauthProxyUrl: 'http://localhost:5001',
    googleClientId: 'test',
  },
}));
jest.mock('../../api/db/graphql.generated', () => ({
  useGetOnThisDayQuery: () => ({ data: undefined }),
  useGetPlayerCountQuery: () => ({ data: undefined }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForSignInButton() {
  return waitFor(() => {
    const btn = screen.getByRole('button', { name: /continue with google/i });
    // Button is disabled while isConfiguring. Wait until it is enabled.
    if (btn.hasAttribute('disabled')) throw new Error('still disabled');
    return btn;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let debugSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
let signInSpy: jest.SpyInstance;
let configureSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthConfig = {
    googleClientId: 'test-client-id',
    oauthProxyUrl: 'http://localhost:5001',
  };
  debugSpy = jest.spyOn(LOGGER, 'debug').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(LOGGER, 'error').mockImplementation(() => undefined);
  signInSpy = jest.spyOn(OAuthProvider, 'signIn');
  configureSpy = jest
    .spyOn(OAuthProvider, 'configure')
    .mockResolvedValue(undefined);
});

afterEach(() => {
  debugSpy.mockRestore();
  errorSpy.mockRestore();
  signInSpy.mockRestore();
  configureSpy.mockRestore();
});

describe('LoginPage Discord callback — synchronous config fault (LS-6687)', () => {
  const ORIGINAL_URL = window.location.href;

  afterEach(() => {
    window.history.replaceState({}, '', ORIGINAL_URL);
  });

  it('resets the Discord loading state when reading config throws synchronously during the callback', async () => {
    // Model a hot-swapped config: oauthProxyUrl is read safely during render
    // (the effect's deps array and handleDiscordSignIn's deps array), but
    // faults exactly once when the callback effect body reads it. Faulting only
    // on that read leaves render-phase and post-error re-render reads safe.
    let reads = 0;
    const EFFECT_BODY_READ = 3; // reads 1 & 2 are the two deps arrays at render
    mockAuthConfig = {
      googleClientId: 'test-client-id',
      discordClientId: 'test-discord-id',
      get oauthProxyUrl(): string {
        reads += 1;
        if (reads === EFFECT_BODY_READ) {
          throw new Error('config access fault');
        }
        return 'http://localhost:5001';
      },
    };

    // Land on the Discord OAuth callback route with a valid code/state so the
    // effect proceeds to setIsDiscordLoading(true) and the proxy-URL read.
    window.history.replaceState(
      {},
      '',
      '/auth/discord/callback?code=abc&state=xyz',
    );

    renderPage();

    // The Discord button must recover — never stuck in the "Connecting…" state.
    await waitFor(() => {
      const discordBtn = screen.getByRole('button', {
        name: /continue with discord/i,
      });
      expect(discordBtn).not.toBeDisabled();
    });
    expect(screen.queryByText(/connecting to discord/i)).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      'Discord callback exchange failed:',
      expect.any(Error),
    );
  });
});

describe('LoginPage handleSignIn catch block', () => {
  it('does not log an error or show a message when the user cancels the popup', async () => {
    const cancelledError = Object.assign(
      new Error('Sign-in popup was closed'),
      {
        code: 'SIGN_IN_CANCELLED',
      },
    );
    signInSpy.mockRejectedValueOnce(cancelledError);

    renderPage();
    const btn = await waitForSignInButton();

    act(() => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(debugSpy).toHaveBeenCalledWith(
        'Google sign-in popup closed by user',
      );
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/sign-in failed/i)).toBeNull();
  });

  it('logs an error and shows a message for non-cancellation failures', async () => {
    const authError = new Error('Network request failed');
    signInSpy.mockRejectedValueOnce(authError);

    renderPage();
    const btn = await waitForSignInButton();

    act(() => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      // Error instance is passed directly so Rollbar can extract the stack trace.
      expect(errorSpy).toHaveBeenCalledWith(
        'Sign-in failed on login page:',
        authError,
      );
    });
    expect(debugSpy).not.toHaveBeenCalledWith(
      'Google sign-in popup closed by user',
    );
    expect(await screen.findByText('Network request failed')).toBeTruthy();
  });
});
