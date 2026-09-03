/**
 * Coverage for the mobile Login screen (`login.tsx`) — the only mobile auth
 * surface. Concerns covered:
 *
 * - Deep-link preservation: a successful login returns the user to their
 *   deep-linked route, falling back to home from the bare /login route
 *   (LGN-037).
 * - Last-visited-league redirect: a stored league is reopened with the `(tabs)`
 *   anchor loaded beneath it, so the user is never stranded on a headerless
 *   league screen with no back affordance (LS-6694).
 * - Google sign-in wiring: button press invokes googleLogin, the loading state
 *   surfaces while in flight, errors are displayed, and the error clears on
 *   retry (LS-6657).
 *
 * The native auth layer (`useAuthHandlers`) is exercised directly by
 * AuthHooks.spec.tsx and the LoginPage UI by shared-components/LoginPage.spec;
 * here both are mocked so these tests stay focused on the wrapper's wiring.
 */
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import Login from './login';

import type { AuthCallbacks } from '../common/auth/AuthHooks';

// ── Mocks ────────────────────────────────────────────────────────────────────

// expo-router: capture router.replace to assert the post-login destination, and
// drive usePathname so the deep-link resolution has a route to return to.
const mockReplace = jest.fn();
let mockPathname = '/';
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: (...args: unknown[]): void => {
      mockReplace(...args);
    },
  }),
  usePathname: () => mockPathname,
}));

// Capture the callbacks login.tsx wires into useAuthHandlers so tests can drive
// the success / failure paths without exercising the real OAuth flow, and expose
// jest fns for the sign-in actions.
const mockGoogleLogin = jest.fn();
const mockAppleLogin = jest.fn();
const mockAuthCallbacks: { current: AuthCallbacks | undefined } = {
  current: undefined,
};
jest.mock('../common/auth/AuthHooks', () => ({
  useAuthHandlers: (callbacks: AuthCallbacks) => {
    mockAuthCallbacks.current = callbacks;
    return {
      googleLogin: mockGoogleLogin,
      appleLogin: mockAppleLogin,
      logout: jest.fn(),
    };
  },
}));

// Apple is not the focus of this Android-only auth surface; resolve to false so
// the Apple button stays hidden and the useEffect settles to a stable state.
jest.mock('../common/auth/appleAuth', () => ({
  isAppleAuthAvailable: jest.fn().mockResolvedValue(false),
}));

// Drives the last-visited-league branch of the post-login redirect (LS-6694).
// Defaults to "nothing stored" so every other test lands on home.
const mockGetLastVisitedLeague = jest.fn<
  Promise<{ leagueId: number; sport: string } | null>,
  []
>();
jest.mock('../common/utilities/lastVisitedLeague', () => ({
  getLastVisitedLeague: (): unknown => mockGetLastVisitedLeague(),
}));

// tamagui's Theme/YStack/Button/Spinner/Text are layout-only in login.tsx;
// render children directly to avoid pulling the native tamagui runtime into Jest.
jest.mock('tamagui', () => {
  const {
    View,
    Pressable,
    Text: RNText,
  } = jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    createTokens: (tokens: unknown) => tokens,
    Theme: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement(View, null, children),
    YStack: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement(View, null, children),
    Button: ({
      children,
      onPress,
      disabled,
      testID,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      testID?: string;
    }) =>
      ReactActual.createElement(
        Pressable,
        { onPress, disabled, testID },
        children,
      ),
    Spinner: () => ReactActual.createElement(View, null),
    Text: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement(RNText, null, children),
  };
});

// Biometric helpers: return "no hardware" by default so the biometric button
// stays hidden and the auto-prompt never fires in non-biometric tests.
jest.mock('../common/auth/BiometricAuth', () => ({
  checkBiometricState: jest.fn().mockResolvedValue({
    hasHardware: false,
    isEnrolled: false,
    hasStoredToken: false,
  }),
  promptBiometric: jest.fn().mockResolvedValue(false),
  getStoredJwtIfValid: jest.fn().mockResolvedValue(null),
  storeJwtForBiometric: jest.fn().mockResolvedValue(undefined),
}));

// Lightweight LoginPage double. The real LoginPage UI is covered by
// shared-components/LoginPage.spec.tsx; here we only surface the props the
// Login wrapper wires through.
jest.mock('@legacy-sports/shared-components', () => {
  const { Pressable, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    LoginPage: ({
      onGoogleSignIn,
      isGoogleLoading,
      errorMessage,
      children,
    }: {
      onGoogleSignIn: () => void;
      isGoogleLoading?: boolean;
      errorMessage?: string;
      children?: React.ReactNode;
    }) =>
      ReactActual.createElement(
        ReactActual.Fragment,
        null,
        ReactActual.createElement(Pressable, {
          testID: 'login-button',
          disabled: isGoogleLoading,
          onPress: onGoogleSignIn,
        }),
        isGoogleLoading
          ? ReactActual.createElement(
              Text,
              { testID: 'login-loading' },
              'loading',
            )
          : null,
        errorMessage
          ? ReactActual.createElement(
              Text,
              { testID: 'login-error' },
              errorMessage,
            )
          : null,
        children,
      ),
    useAuth: jest.fn(() => ({
      loginWithToken: jest.fn().mockResolvedValue(undefined),
      isAuthenticated: false,
      token: null,
      user: null,
      isLoading: false,
      error: null,
    })),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Render Login and flush the Apple-availability effect so state is settled. */
async function renderLogin(): Promise<void> {
  render(<Login />);
  // Let the isAppleAuthAvailable() promise resolve and its setState flush.
  await act(async () => {
    await Promise.resolve();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// "Nothing stored" is the default for every suite below; the last-visited-league
// suite overrides it per test. Set at the root so it survives the
// `jest.clearAllMocks()` each nested beforeEach runs (clearAllMocks resets call
// records, not implementations).
beforeEach(() => {
  mockGetLastVisitedLeague.mockResolvedValue(null);
});

describe('Mobile Login screen — deep-link preservation (LGN-037)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthCallbacks.current = undefined;
    mockPathname = '/';
  });

  it('returns to the deep-linked route on successful login', async () => {
    mockPathname = '/baseball/league/123';
    await renderLogin();

    expect(mockAuthCallbacks.current?.onSuccess).toBeDefined();
    await act(async () => {
      mockAuthCallbacks.current?.onSuccess?.();
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith('/baseball/league/123', {
      withAnchor: true,
    });
  });

  it('falls back to home when login was reached at the /login route', async () => {
    mockPathname = '/login';
    await renderLogin();

    await act(async () => {
      mockAuthCallbacks.current?.onSuccess?.();
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});

/**
 * The post-login redirect must never leave the user on a screen with nothing
 * beneath it. Every route in the `(app)` group is headerless (LS-8766), so a
 * league screen mounted as the sole stack entry has no back button, no tab bar,
 * and a `canGoBack()` of false — the Android back button quits the app. Passing
 * `withAnchor: true` loads the group's `(tabs)` anchor underneath the
 * destination, which is what makes back work.
 */
describe('Mobile Login screen — last-visited-league redirect (LS-6694)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthCallbacks.current = undefined;
    mockPathname = '/login';
  });

  it('anchors the tab shell under a stored baseball league', async () => {
    mockGetLastVisitedLeague.mockResolvedValue({
      leagueId: 123,
      sport: 'baseball',
    });
    await renderLogin();

    await act(async () => {
      mockAuthCallbacks.current?.onSuccess?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        {
          pathname: '/baseball/league/[leagueId]',
          params: { leagueId: '123' },
        },
        { withAnchor: true },
      );
    });
  });

  it('anchors the tab shell under a stored football league', async () => {
    mockGetLastVisitedLeague.mockResolvedValue({
      leagueId: 7,
      sport: 'football',
    });
    await renderLogin();

    await act(async () => {
      mockAuthCallbacks.current?.onSuccess?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        {
          pathname: '/football/league/[leagueId]',
          params: { leagueId: '7' },
        },
        { withAnchor: true },
      );
    });
  });

  it('lands on home when no league is stored', async () => {
    mockGetLastVisitedLeague.mockResolvedValue(null);
    await renderLogin();

    await act(async () => {
      mockAuthCallbacks.current?.onSuccess?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });
});

describe('Mobile Login screen — Google sign-in flow (LS-6657)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthCallbacks.current = undefined;
    mockPathname = '/';
  });

  it('calls googleLogin when the Google button is pressed', async () => {
    await renderLogin();

    fireEvent.press(screen.getByTestId('login-button'));

    expect(mockGoogleLogin).toHaveBeenCalledTimes(1);
  });

  it('shows the loading state while a Google sign-in is in flight', async () => {
    await renderLogin();

    expect(screen.queryByTestId('login-loading')).toBeNull();

    fireEvent.press(screen.getByTestId('login-button'));

    // Pressing the button flips isGoogleLoading on, which the LoginPage uses to
    // show a spinner and disable the button.
    expect(screen.getByTestId('login-loading')).toBeTruthy();
  });

  it('displays an error message when sign-in fails', async () => {
    await renderLogin();

    fireEvent.press(screen.getByTestId('login-button'));
    expect(screen.getByTestId('login-loading')).toBeTruthy();

    await act(() => {
      mockAuthCallbacks.current?.onFailure?.('Authentication failed');
    });

    expect(screen.getByText('Authentication failed')).toBeTruthy();
    // A failure also clears the in-flight loading state.
    expect(screen.queryByTestId('login-loading')).toBeNull();
  });

  it('clears the error message when the user retries', async () => {
    await renderLogin();

    await act(() => {
      mockAuthCallbacks.current?.onFailure?.('Authentication failed');
    });
    expect(screen.getByTestId('login-error')).toBeTruthy();

    // Pressing the button again starts a fresh attempt and clears the banner.
    fireEvent.press(screen.getByTestId('login-button'));

    expect(screen.queryByTestId('login-error')).toBeNull();
    expect(mockGoogleLogin).toHaveBeenCalledTimes(1);
  });
});

// ── Biometric sign-in (LS-7571) ───────────────────────────────────────────────

type BiometricAuthMock = {
  checkBiometricState: jest.Mock;
  promptBiometric: jest.Mock;
  getStoredJwtIfValid: jest.Mock;
  storeJwtForBiometric: jest.Mock;
};

function getBiometricMock(): BiometricAuthMock {
  return jest.requireMock<BiometricAuthMock>('../common/auth/BiometricAuth');
}

/** Build a non-expired JWT with the given expiry offset (seconds from now). */
function makeMockJwt(expiresInSeconds = 3600): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      isAdmin: false,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    }),
  );
  return `${header}.${payload}.mock-sig`;
}

describe('Mobile Login screen — biometric sign-in (LS-7571)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthCallbacks.current = undefined;
    mockPathname = '/';
    // Default: no hardware — biometric button hidden and auto-prompt never fires.
    const bm = getBiometricMock();
    bm.checkBiometricState.mockResolvedValue({
      hasHardware: false,
      isEnrolled: false,
      hasStoredToken: false,
    });
    bm.promptBiometric.mockResolvedValue(false);
    bm.getStoredJwtIfValid.mockResolvedValue(null);
    bm.storeJwtForBiometric.mockResolvedValue(undefined);
  });

  it('does not show the biometric button when no hardware is available', async () => {
    await renderLogin();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('biometric-login-button')).toBeNull();
  });

  it('does not show the biometric button when hardware present but no stored token', async () => {
    getBiometricMock().checkBiometricState.mockResolvedValue({
      hasHardware: true,
      isEnrolled: true,
      hasStoredToken: false,
    });

    await renderLogin();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('biometric-login-button')).toBeNull();
  });

  it('shows the biometric button when hardware, enrolled, and valid token stored', async () => {
    getBiometricMock().checkBiometricState.mockResolvedValue({
      hasHardware: true,
      isEnrolled: true,
      hasStoredToken: true,
    });

    await renderLogin();

    await waitFor(() => {
      expect(screen.getByTestId('biometric-login-button')).toBeTruthy();
    });
  });

  it('auto-prompts biometric on cold start and completes login', async () => {
    const bm = getBiometricMock();
    const jwt = makeMockJwt();
    bm.checkBiometricState.mockResolvedValue({
      hasHardware: true,
      isEnrolled: true,
      hasStoredToken: true,
    });
    bm.promptBiometric.mockResolvedValue(true);
    bm.getStoredJwtIfValid.mockResolvedValue(jwt);

    const mockLoginWithToken = jest.fn().mockResolvedValue(undefined);
    jest
      .requireMock<{ useAuth: jest.Mock }>('@legacy-sports/shared-components')
      .useAuth.mockReturnValue({
        loginWithToken: mockLoginWithToken,
        isAuthenticated: false,
        token: null,
      });

    await renderLogin();

    await waitFor(() => {
      expect(bm.promptBiometric).toHaveBeenCalledWith();
      expect(mockLoginWithToken).toHaveBeenCalledWith(jwt);
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('falls back gracefully when biometric prompt is cancelled', async () => {
    const bm = getBiometricMock();
    bm.checkBiometricState.mockResolvedValue({
      hasHardware: true,
      isEnrolled: true,
      hasStoredToken: true,
    });
    bm.promptBiometric.mockResolvedValue(false);

    await renderLogin();

    await waitFor(() => {
      expect(bm.promptBiometric).toHaveBeenCalled();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows session-expired message when JWT expires between state check and prompt', async () => {
    const bm = getBiometricMock();
    bm.checkBiometricState.mockResolvedValue({
      hasHardware: true,
      isEnrolled: true,
      hasStoredToken: true,
    });
    bm.promptBiometric.mockResolvedValue(true);
    // Token was valid at checkBiometricState time but expired by getStoredJwtIfValid.
    bm.getStoredJwtIfValid.mockResolvedValue(null);

    await renderLogin();

    await waitFor(() => {
      expect(bm.promptBiometric).toHaveBeenCalled();
      expect(screen.getByTestId('login-error')).toBeTruthy();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
