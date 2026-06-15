/**
 * LGN-017 — email/password sign-in wiring.
 *
 * The web LoginPage surfaces the existing /oauth/login endpoint by passing an
 * onEmailPasswordSignIn handler to the shared AuthCard. This suite mocks the
 * AuthCard with a lightweight stub (the real tamagui card's controlled inputs
 * cannot be driven in jsdom) so the handler → useAuth().login wiring and the
 * error path can be asserted directly. The presentational form behaviour is
 * covered in the shared-components LoginPage spec.
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
import { LoginPage } from './LoginPage';

const mockLogin = jest.fn();

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
  OAuthErrorCode: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({
    config: { googleClientId: 'test', oauthProxyUrl: 'http://localhost:5001' },
    login: mockLogin,
    loginWithOAuth: jest.fn(),
    hydrateSession: jest.fn(),
    error: null,
    clearError: jest.fn(),
  }),
}));

// Stub the shared AuthCard so the email/password callback is invokable without
// fighting tamagui's controlled inputs in jsdom. It mirrors the real card's
// contract for the props this suite exercises.
jest.mock('@legacy-sports/shared-components', () => ({
  LoginPage: ({
    onEmailPasswordSignIn,
    isEmailPasswordLoading,
    errorMessage,
  }: {
    onEmailPasswordSignIn?: (email: string, password: string) => void;
    isEmailPasswordLoading?: boolean;
    errorMessage?: string;
  }) => (
    <div>
      <button
        type="button"
        aria-label="trigger-email-password"
        onClick={() => onEmailPasswordSignIn?.('mgr@test.ls', 'secret-pass')}
      >
        submit
      </button>
      {isEmailPasswordLoading ? <span>loading</span> : null}
      {errorMessage ? <span>{errorMessage}</span> : null}
    </div>
  ),
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('../../lib/csrf', () => ({ storeCsrfToken: jest.fn() }));
jest.mock('../../lib/session-precache', () => ({
  storeDiscordSessionPreCache: jest.fn(),
}));
jest.mock('../../config/environment', () => ({
  env: { baseUrl: '/', oauthProxyUrl: 'http://localhost:5001' },
}));
jest.mock('@legacy-sports/graphql', () => ({
  useGetOnThisDayQuery: () => ({ data: undefined }),
  useGetPlayerCountQuery: () => ({ data: undefined }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLogin.mockResolvedValue(undefined);
});

it('calls useAuth().login with the submitted credentials', async () => {
  renderPage();

  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: /trigger-email-password/i }),
    );
    await Promise.resolve();
  });

  expect(mockLogin).toHaveBeenCalledWith('mgr@test.ls', 'secret-pass');
});

it('guards against a synchronous double-submit — login is called once', async () => {
  // Hold the login promise open so the in-flight ref latch stays set across both
  // invocations, reproducing a rapid double-submit firing two handlers before
  // setIsEmailLoading(true) commits.
  let resolveLogin: () => void = () => undefined;
  mockLogin.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      resolveLogin = resolve;
    }),
  );

  renderPage();
  const btn = screen.getByRole('button', {
    name: /trigger-email-password/i,
  });

  await act(async () => {
    fireEvent.click(btn);
    fireEvent.click(btn);
    await Promise.resolve();
  });

  expect(mockLogin).toHaveBeenCalledTimes(1);

  // Release the pending login so the handler settles cleanly.
  await act(async () => {
    resolveLogin();
    await Promise.resolve();
  });
});

it('shows and logs an error when login rejects', async () => {
  mockLogin.mockRejectedValueOnce(new Error('Invalid email or password'));
  const errorSpy = jest
    .spyOn(LOGGER, 'error')
    .mockImplementation(() => undefined);

  renderPage();

  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: /trigger-email-password/i }),
    );
    await Promise.resolve();
  });

  await waitFor(() =>
    expect(screen.getByText('Invalid email or password')).toBeTruthy(),
  );
  expect(errorSpy).toHaveBeenCalledWith(
    'Email/password sign-in failed on login page:',
    expect.any(Error),
  );

  errorSpy.mockRestore();
});
