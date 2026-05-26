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

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({
    config: {
      googleClientId: 'test-client-id',
      oauthProxyUrl: 'http://localhost:5001',
    },
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
