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
import { storeDiscordSessionPreCache } from '../../lib/session-precache';

// Shared handle so individual tests can control hydrateSession's return value.
const mockHydrateSession = jest.fn();
// Shared handle for the email/password login path (LGN-017).
const mockLogin = jest.fn();
const mockClearError = jest.fn();
let mockAuthError: string | null = null;

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
    login: mockLogin,
    loginWithOAuth: jest.fn(),
    hydrateSession: mockHydrateSession,
    clearError: mockClearError,
    error: mockAuthError,
  }),
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('../../lib/csrf', () => ({ storeCsrfToken: jest.fn() }));
jest.mock('../../lib/session-precache', () => ({
  storeDiscordSessionPreCache: jest.fn(),
}));
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

// The signup link reads the *browser* URL (window.location), not the router
// location, so tests drive it via the history API.
function setBrowserUrl(url: string) {
  window.history.replaceState({}, '', url);
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
  mockLogin.mockResolvedValue(undefined);
  mockAuthError = null;
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
  // Reset the browser URL so a forwarded ?redirect= param does not leak into
  // subsequent tests.
  setBrowserUrl('/login');
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

describe('LoginPage Discord callback — missing oauthProxyUrl hard-fail (LGN-010 / LS-6665)', () => {
  const ORIGINAL_URL = window.location.href;
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    window.history.replaceState({}, '', ORIGINAL_URL);
  });

  it('does not POST to a localhost fallback and surfaces an error when oauthProxyUrl is missing', async () => {
    // Production-config bug: discordClientId is present (so the callback effect
    // runs) but oauthProxyUrl is undefined. The callback must hard-fail rather
    // than fall back to http://localhost:5001 and POST the OAuth code in the
    // clear (the MITM injection vector described in LGN-010).
    mockAuthConfig = {
      googleClientId: 'test-client-id',
      discordClientId: 'test-discord-id',
      // oauthProxyUrl intentionally omitted
    };

    const fetchSpy = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({ jwt: 'header.payload.sig' }),
      }),
    ) as unknown as typeof fetch;
    global.fetch = fetchSpy;

    window.history.replaceState(
      {},
      '',
      '/auth/discord/callback?code=abc&state=xyz',
    );

    renderPage();

    // The callback must error out cleanly — never POST anywhere.
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        'Discord callback exchange failed:',
        expect.any(Error),
      );
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/discord sign-in is not configured/i),
    ).toBeTruthy();
    // The Discord button must recover — never stuck in the "Connecting…" state.
    await waitFor(() => {
      const discordBtn = screen.getByRole('button', {
        name: /continue with discord/i,
      });
      expect(discordBtn).not.toBeDisabled();
    });
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

  it('humanizes a coded OAuth SDK failure and never leaks the raw SDK message (LS-6683)', async () => {
    // Google SDK rejections always carry a typed OAuthErrorCode; their raw
    // message can leak internals, so a coded failure maps to humanized copy and
    // the raw SDK string must never reach the DOM.
    const sdkError = Object.assign(
      new Error('UNKNOWN_ERROR: idpiframe_initialization_failed'),
      { code: 'UNKNOWN_ERROR' },
    );
    signInSpy.mockRejectedValueOnce(sdkError);

    renderPage();
    const btn = await waitForSignInButton();

    act(() => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      // Error instance is passed directly so Rollbar can extract the stack trace.
      expect(errorSpy).toHaveBeenCalledWith(
        'Sign-in failed on login page:',
        sdkError,
      );
    });
    expect(debugSpy).not.toHaveBeenCalledWith(
      'Google sign-in popup closed by user',
    );
    // Humanized copy is shown; the raw SDK string is not leaked.
    expect(
      await screen.findByText('Sign-in failed. Please try again.'),
    ).toBeTruthy();
    expect(screen.queryByText(/idpiframe_initialization_failed/)).toBeNull();
  });

  it('maps a NETWORK_ERROR code to humanized connection copy (LS-6683)', async () => {
    // Model an SDK rejection whose raw message leaks internals — the typed code
    // drives humanized copy and the raw string never reaches the DOM.
    const networkError = Object.assign(
      new Error('NETWORK_ERROR: Failed to fetch from accounts.google.com'),
      { code: 'NETWORK_ERROR' },
    );
    signInSpy.mockRejectedValueOnce(networkError);

    renderPage();
    const btn = await waitForSignInButton();

    act(() => {
      fireEvent.click(btn);
    });

    expect(
      await screen.findByText(
        'Could not reach Google — please check your connection and try again.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(/Failed to fetch from accounts\.google\.com/),
    ).toBeNull();
  });

  it('preserves a user-facing backend error message that carries no OAuth code (LS-6683)', async () => {
    // Failures from the downstream oauth-proxy exchange (surfaced via
    // loginWithOAuth) carry no OAuthErrorCode and have intentional, user-facing
    // copy. These must be shown verbatim, not rewritten — e.g. the access-denied
    // and "Secure OAuth failed: <status>" messages the login E2E suite asserts.
    const backendError = new Error(
      'Access denied: Your account is not authorized to access this application.',
    );
    signInSpy.mockRejectedValueOnce(backendError);

    renderPage();
    const btn = await waitForSignInButton();

    act(() => {
      fireEvent.click(btn);
    });

    expect(
      await screen.findByText(
        'Access denied: Your account is not authorized to access this application.',
      ),
    ).toBeTruthy();
  });
});

describe('LoginPage email/password form (LGN-017)', () => {
  // This suite renders the real shared AuthCard (tamagui), so it asserts the
  // form is wired into the page (presence) rather than driving the inputs —
  // tamagui's controlled <input> does not pick up fireEvent.change values in
  // jsdom. The form-interaction logic (submit, trim, Enter, disabled-until-
  // filled) is covered in the shared-components LoginPage spec (which mocks
  // tamagui), and the web handler → useAuth().login wiring + error handling is
  // covered in LoginPage.email-password.spec.tsx (which mocks the AuthCard).
  it('renders the email/password form on the login page', async () => {
    renderPage();
    // Let the OAuth configure effect settle so the card is interactive.
    await waitForSignInButton();

    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter your password')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /sign in with email and password/i }),
    ).toBeTruthy();
  });
});

describe('LoginPage header signup affordance (LS-6689)', () => {
  // LS-6689 supersedes the LS-6688 /signup redirect-forwarding behaviour: the
  // app is OAuth-only and /signup has no route, so the header no longer links
  // there. It now directs new users to the on-page OAuth card.
  it('does not link to the dead /signup route', async () => {
    renderPage();
    // Let the async OAuth configure effect settle before asserting.
    await waitForSignInButton();
    const deadLink = document.querySelector('a[href^="/signup"]');
    expect(deadLink).toBeNull();
    expect(
      screen.queryByRole('link', { name: /create an account/i }),
    ).toBeNull();
  });

  it('directs new users to the OAuth card on the page', async () => {
    renderPage();
    await waitForSignInButton();
    // Discord is disabled in the test config, so only Google is named.
    const signupLink = screen.getByRole('link', {
      name: /sign up with google/i,
    });
    expect(signupLink.getAttribute('href')).toBe('#ll-signup-card');
    // The anchor target (the OAuth card) exists so the in-page jump resolves.
    expect(document.getElementById('ll-signup-card')).not.toBeNull();
  });
});

describe('LoginPage account-recovery affordance (LGN-024)', () => {
  // The app is OAuth-only (no passwords), so there is no password-reset flow to
  // link to. Rather than a dead "Forgot password?" link, the login screen must
  // still offer a real recovery path — a support contact — so users who cannot
  // sign in are not stranded (cf. LS-6689, which removed the dead /signup link
  // for the same OAuth-only reason).
  it('renders a recovery link to support, not a dead password-reset route', async () => {
    renderPage();
    await waitForSignInButton();

    const recoveryLink = screen.getByRole('link', {
      name: /get help accessing your account/i,
    });
    expect(recoveryLink.getAttribute('href')).toMatch(
      /^mailto:support@legacysports\.com/,
    );
    // The surrounding prompt frames it as a recovery affordance.
    expect(recoveryLink.parentElement?.textContent).toMatch(
      /trouble signing in\?/i,
    );

    // No dead password-reset affordance is introduced.
    expect(document.querySelector('a[href^="/forgot"]')).toBeNull();
    expect(document.querySelector('a[href^="/reset"]')).toBeNull();
  });
});

describe('LoginPage handleSignIn re-entrancy guard (LS-6685)', () => {
  it('calls OAuthProvider.signIn only once for a synchronous double-tap', async () => {
    // Hold the sign-in promise open so the in-flight latch stays set across both
    // clicks — this reproduces a rapid double-tap firing two synchronous click
    // handlers before React commits setIsLoading(true).
    type SignInResult = Awaited<ReturnType<typeof OAuthProvider.signIn>>;
    let resolveSignIn: (value: SignInResult) => void = () => undefined;
    signInSpy.mockReturnValueOnce(
      new Promise<SignInResult>((resolve) => {
        resolveSignIn = resolve;
      }),
    );

    renderPage();
    const btn = await waitForSignInButton();

    // Two clicks dispatched within the same synchronous batch: the button's
    // disabled attribute (driven by isLoading state) has not re-rendered yet, so
    // only the useRef latch can prevent the second invocation.
    act(() => {
      fireEvent.click(btn);
      fireEvent.click(btn);
    });

    expect(signInSpy).toHaveBeenCalledTimes(1);

    // Release the pending promise so the handler settles cleanly.
    await act(async () => {
      resolveSignIn({});
      await Promise.resolve();
    });
  });

  it('allows a subsequent sign-in after the first attempt settles', async () => {
    signInSpy.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    renderPage();
    const btn = await waitForSignInButton();

    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
    });

    expect(signInSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// LS-6693 — Discord callback redirect: in-memory hydrate instead of full reload
// ---------------------------------------------------------------------------

describe('LoginPage Discord callback redirect (LS-6693)', () => {
  const originalFetch = global.fetch;
  const mockedStorePreCache = jest.mocked(storeDiscordSessionPreCache);

  beforeEach(() => {
    mockHydrateSession.mockReset();
    // Clear came-from (LGN-037) and last-visited-league (LS-6694) so neither
    // leaks between tests.
    sessionStorage.clear();
    localStorage.clear();
    // Put jsdom on the Discord callback URL so the LoginPage effect fires.
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

  it('hydrates the session in-memory and SPA-navigates home without a full reload', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
        json: () =>
          Promise.resolve({ jwt: 'header.payload.sig', csrfToken: 'csrf-1' }),
      }),
    ) as unknown as typeof fetch;
    mockHydrateSession.mockReturnValue(true);
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    renderPage();

    await waitFor(() => {
      expect(mockHydrateSession).toHaveBeenCalledWith('header.payload.sig');
    });
    // The callback URL is rewritten to the app root (no window.location.replace).
    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/');
    });
    // The full-reload fallback must NOT run on the happy path.
    expect(mockedStorePreCache).not.toHaveBeenCalled();

    replaceStateSpy.mockRestore();
  });

  it('returns the user to their stored came-from deep link (LGN-037)', async () => {
    // Simulate the path captured before the Discord round-trip.
    sessionStorage.setItem('ls_login_came_from', '/league/123?tab=roster');
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
        json: () =>
          Promise.resolve({ jwt: 'header.payload.sig', csrfToken: 'csrf-1' }),
      }),
    ) as unknown as typeof fetch;
    mockHydrateSession.mockReturnValue(true);
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    renderPage();

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(
        null,
        '',
        '/league/123?tab=roster',
      );
    });
    // The came-from entry is single-use: it must be cleared after consumption.
    expect(sessionStorage.getItem('ls_login_came_from')).toBeNull();

    replaceStateSpy.mockRestore();
  });

  it('redirects to the stored last-visited league after a Discord login (LS-6694)', async () => {
    localStorage.setItem(
      'ls_last_visited_league',
      JSON.stringify({ leagueId: 42, sport: 'football' }),
    );
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
        json: () =>
          Promise.resolve({ jwt: 'header.payload.sig', csrfToken: 'csrf-1' }),
      }),
    ) as unknown as typeof fetch;
    mockHydrateSession.mockReturnValue(true);
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    renderPage();

    await waitFor(() => {
      expect(mockHydrateSession).toHaveBeenCalledWith('header.payload.sig');
    });
    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(
        null,
        '',
        '/football/league/42',
      );
    });

    replaceStateSpy.mockRestore();
    localStorage.clear();
  });

  it('falls back to pre-cache + full reload when the JWT cannot be hydrated', async () => {
    const replaceLocationSpy = jest.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        pathname: '/auth/discord/callback',
        search: '?code=abc&state=xyz',
        replace: replaceLocationSpy,
      },
    });

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({ jwt: 'bad.jwt' }),
      }),
    ) as unknown as typeof fetch;
    mockHydrateSession.mockReturnValue(false);

    renderPage();

    await waitFor(() => {
      expect(mockedStorePreCache).toHaveBeenCalledWith('bad.jwt');
    });
    expect(replaceLocationSpy).toHaveBeenCalledWith('/');

    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });
});

// ---------------------------------------------------------------------------
// LGN-012 / LS-6667 — full-screen "Signing in with Discord…" progress screen
// ---------------------------------------------------------------------------

describe('LoginPage Discord callback progress screen (LS-6667)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
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

  it('shows the progress screen and hides the OAuth buttons during the exchange', async () => {
    // A never-resolving fetch keeps the callback in-flight so the progress UI
    // (rendered before the exchange settles) can be asserted.
    global.fetch = jest.fn(
      () => new Promise(() => undefined),
    ) as unknown as typeof fetch;

    renderPage();

    // Dedicated progress indicator is shown immediately — no login-form flash.
    expect(screen.getByText(/signing in with discord/i)).toBeTruthy();
    // Neither OAuth button (nor the rest of the login form) is rendered.
    expect(
      screen.queryByRole('button', { name: /continue with google/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /continue with discord/i }),
    ).toBeNull();

    // Flush the always-mounted Google-configure effect so its state update
    // lands inside act() (the progress screen never awaits it).
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('does not render the progress screen when the callback carries an OAuth error', async () => {
    window.history.replaceState(
      {},
      '',
      '/auth/discord/callback?error=access_denied',
    );

    renderPage();

    // The error path falls straight through to the login form so the user sees
    // the message and can retry — the progress screen must not appear.
    await waitForSignInButton();
    expect(screen.queryByText(/signing in with discord/i)).toBeNull();
    expect(
      await screen.findByText(/discord sign-in was cancelled or denied/i),
    ).toBeTruthy();
  });

  it('falls back to the login form with a generic error when the server returns an unknown code (LGN-008)', async () => {
    // Server returns an unrecognised code — the raw error string must never
    // reach the DOM; the client falls back to generic copy (LGN-008 / LS-6663).
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            '{"error":"internal_exception_detail","code":"unknown_future_code"}',
          ),
        json: () =>
          Promise.resolve({
            error: 'internal_exception_detail',
            code: 'unknown_future_code',
          }),
      }),
    ) as unknown as typeof fetch;

    renderPage();

    await waitForSignInButton();
    expect(screen.queryByText(/signing in with discord/i)).toBeNull();
    expect(
      await screen.findByText('Discord sign-in failed. Please try again.'),
    ).toBeTruthy();
    expect(screen.queryByText(/internal_exception_detail/)).toBeNull();
  });

  it('translates exchange_failed code to friendly copy without leaking server text (LGN-008)', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () =>
          Promise.resolve(
            '{"error":"Discord authentication failed","code":"exchange_failed"}',
          ),
        json: () =>
          Promise.resolve({
            error: 'Discord authentication failed',
            code: 'exchange_failed',
          }),
      }),
    ) as unknown as typeof fetch;

    renderPage();

    await waitForSignInButton();
    expect(
      await screen.findByText('Discord sign-in failed. Please try again.'),
    ).toBeTruthy();
  });

  it('translates email_unverified code to email-specific copy (LGN-008)', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            '{"error":"Discord email is not verified","code":"email_unverified"}',
          ),
        json: () =>
          Promise.resolve({
            error: 'Discord email is not verified',
            code: 'email_unverified',
          }),
      }),
    ) as unknown as typeof fetch;

    renderPage();

    await waitForSignInButton();
    expect(
      await screen.findByText(
        'Your Discord account does not have a verified email address.',
      ),
    ).toBeTruthy();
    // The raw server error string must not reach the DOM.
    expect(screen.queryByText(/Discord email is not verified/)).toBeNull();
  });

  it('translates invalid_state code to state-error copy (LGN-008)', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            '{"error":"Invalid OAuth state — please retry sign-in","code":"invalid_state"}',
          ),
        json: () =>
          Promise.resolve({
            error: 'Invalid OAuth state — please retry sign-in',
            code: 'invalid_state',
          }),
      }),
    ) as unknown as typeof fetch;

    renderPage();

    await waitForSignInButton();
    expect(
      await screen.findByText(
        'Discord sign-in failed: invalid state. Please try again.',
      ),
    ).toBeTruthy();
    // The raw server error string must not reach the DOM.
    expect(screen.queryByText(/Invalid OAuth state/)).toBeNull();
  });

  it('falls back to generic copy when the server response is not JSON (LGN-008)', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      }),
    ) as unknown as typeof fetch;

    renderPage();

    await waitForSignInButton();
    expect(
      await screen.findByText('Discord sign-in failed. Please try again.'),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// LS-6664 — Discord callback ?error= mapping: access_denied (genuine
// cancellation) vs every other OAuth error code (Discord-side / request faults).
// ---------------------------------------------------------------------------

describe('LoginPage Discord callback error mapping (LS-6664)', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/login');
  });

  it('shows the cancellation copy for access_denied', async () => {
    window.history.replaceState(
      {},
      '',
      '/auth/discord/callback?error=access_denied',
    );

    renderPage();

    expect(
      await screen.findByText('Discord sign-in was cancelled or denied.'),
    ).toBeTruthy();
    expect(
      screen.queryByText('Discord is having trouble. Please try again.'),
    ).toBeNull();
  });

  it.each([
    'invalid_request',
    'server_error',
    'temporarily_unavailable',
    'some_unrecognized_value',
  ])(
    'shows a neutral message (not blaming the user) for error=%s',
    async (errorCode) => {
      window.history.replaceState(
        {},
        '',
        `/auth/discord/callback?error=${errorCode}`,
      );

      renderPage();

      expect(
        await screen.findByText('Discord is having trouble. Please try again.'),
      ).toBeTruthy();
      expect(
        screen.queryByText('Discord sign-in was cancelled or denied.'),
      ).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// LS-6681 — clearError() is called when a new sign-in attempt begins so a
// stale auth-context error does not mask the clean state.
// ---------------------------------------------------------------------------

describe('LoginPage clearError on new sign-in attempt (LS-6681)', () => {
  it('calls clearError() when the Google sign-in button is clicked', async () => {
    mockAuthError = 'Previous auth failure';
    signInSpy.mockResolvedValueOnce({});

    renderPage();
    const btn = await waitForSignInButton();

    act(() => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(mockClearError).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// LS-7523 — Google One Tap deep-link preservation
// Unauthenticated deep links must bounce through login and return to the
// original URL after One Tap auth — storeCameFrom() must be called before
// loginWithOAuth so resolvePostLoginRedirect returns the correct path.
// ---------------------------------------------------------------------------

describe('LoginPage Google One Tap deep-link preservation (LS-7523)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    setBrowserUrl('/login');
    sessionStorage.clear();
    localStorage.clear();
  });

  it('returns to a trade-center deep link after One Tap sign-in', async () => {
    setBrowserUrl('/trade-center?leagueId=42');

    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    renderPage();

    // Simulate Google One Tap success event (fired by the GSI script).
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('gsi-one-tap-success', {
          detail: { authResponse: { credential: 'fake-id-token' } },
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(
        null,
        '',
        '/trade-center?leagueId=42',
      );
    });

    // The came-from entry is single-use — consumed by resolvePostLoginRedirect.
    expect(sessionStorage.getItem('ls_login_came_from')).toBeNull();

    replaceStateSpy.mockRestore();
  });

  it('does not overwrite a root URL with a came-from entry after One Tap sign-in', async () => {
    setBrowserUrl('/');

    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    renderPage();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('gsi-one-tap-success', {
          detail: { authResponse: { credential: 'fake-id-token' } },
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      // Falls back to env.baseUrl ('/') — not a came-from entry.
      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/');
    });
    expect(sessionStorage.getItem('ls_login_came_from')).toBeNull();

    replaceStateSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// LS-7520 — Google sign-in deep-link preservation
// Unauthenticated deep links must bounce through login and return to the
// original URL after auth — storeCameFrom() must be called before the popup.
// ---------------------------------------------------------------------------

describe('LoginPage Google sign-in deep-link preservation (LS-7520)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    setBrowserUrl('/login');
    sessionStorage.clear();
    localStorage.clear();
  });

  it('returns to a trade-center deep link after Google sign-in', async () => {
    // Simulate the auth-guard in-place scenario: LoginPage is rendered while
    // the browser URL is still the protected deep-link.
    setBrowserUrl('/trade-center?leagueId=42');

    signInSpy.mockResolvedValueOnce({});
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    renderPage();
    const btn = await waitForSignInButton();

    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(
        null,
        '',
        '/trade-center?leagueId=42',
      );
    });

    // The came-from entry is single-use — consumed by resolvePostLoginRedirect.
    expect(sessionStorage.getItem('ls_login_came_from')).toBeNull();

    replaceStateSpy.mockRestore();
  });

  it('does not overwrite a root URL with a came-from entry after Google sign-in', async () => {
    // When the LoginPage is rendered at the root (non-meaningful destination),
    // storeCameFrom() should be a no-op and the fallback redirect applies.
    setBrowserUrl('/');

    signInSpy.mockResolvedValueOnce({});
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    renderPage();
    const btn = await waitForSignInButton();

    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
    });

    await waitFor(() => {
      // Falls back to env.baseUrl ('/') — not a came-from entry.
      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/');
    });
    expect(sessionStorage.getItem('ls_login_came_from')).toBeNull();

    replaceStateSpy.mockRestore();
  });
});
