/**
 * Coverage for the mobile Login screen (`login.tsx`) — the only mobile auth
 * surface. Three concerns share one set of mocks:
 *
 * - Deep-link preservation: a successful login returns the user to their
 *   deep-linked route, falling back to home from the bare /login route
 *   (LGN-037).
 * - Google sign-in wiring: button press invokes googleLogin, the loading state
 *   surfaces while in flight, errors are displayed, and the error clears on
 *   retry (LS-6657).
 * - Discord sign-in wiring: onDiscordSignIn is passed to LoginPage when
 *   discordClientId is configured, and omitted when it is not (LS-7766).
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
const mockDiscordLogin = jest.fn();
const mockAuthCallbacks: { current: AuthCallbacks | undefined } = {
  current: undefined,
};
jest.mock('../common/auth/AuthHooks', () => ({
  useAuthHandlers: (callbacks: AuthCallbacks) => {
    mockAuthCallbacks.current = callbacks;
    return {
      googleLogin: mockGoogleLogin,
      appleLogin: mockAppleLogin,
      discordLogin: mockDiscordLogin,
      logout: jest.fn(),
    };
  },
}));

// Apple is not the focus of this Android-only auth surface; resolve to false so
// the Apple button stays hidden and the useEffect settles to a stable state.
jest.mock('../common/auth/appleAuth', () => ({
  isAppleAuthAvailable: jest.fn().mockResolvedValue(false),
}));

// Control Discord availability by toggling discordClientId in the config mock.
const mockGetMobileOAuthConfig = jest.fn();
jest.mock('../common/auth/mobileOAuthConfig', () => ({
  getMobileOAuthConfig: (...args: unknown[]): unknown =>
    mockGetMobileOAuthConfig(...args),
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
      onDiscordSignIn,
      isGoogleLoading,
      isDiscordLoading,
      errorMessage,
    }: {
      onGoogleSignIn: () => void;
      onDiscordSignIn?: () => void;
      isGoogleLoading?: boolean;
      isDiscordLoading?: boolean;
      errorMessage?: string;
    }) =>
      ReactActual.createElement(
        ReactActual.Fragment,
        null,
        ReactActual.createElement(Pressable, {
          testID: 'login-button',
          disabled: isGoogleLoading,
          onPress: onGoogleSignIn,
        }),
        onDiscordSignIn
          ? ReactActual.createElement(Pressable, {
              testID: 'discord-login-button',
              disabled: isDiscordLoading,
              onPress: onDiscordSignIn,
            })
          : null,
        isGoogleLoading
          ? ReactActual.createElement(
              Text,
              { testID: 'login-loading' },
              'loading',
            )
          : null,
        isDiscordLoading
          ? ReactActual.createElement(
              Text,
              { testID: 'discord-login-loading' },
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

describe('Mobile Login screen — deep-link preservation (LGN-037)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthCallbacks.current = undefined;
    mockPathname = '/';
    // Discord unavailable by default in deep-link tests — keeps them focused.
    mockGetMobileOAuthConfig.mockReturnValue({
      oauthProxyUrl: 'https://oauth-proxy.example.com',
      googleClientId: 'test-google-client-id',
      discordClientId: undefined,
    });
  });

  it('returns to the deep-linked route on successful login', async () => {
    mockPathname = '/baseball/league/123';
    await renderLogin();

    expect(mockAuthCallbacks.current?.onSuccess).toBeDefined();
    await act(async () => {
      mockAuthCallbacks.current?.onSuccess?.();
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith('/baseball/league/123');
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

describe('Mobile Login screen — Google sign-in flow (LS-6657)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthCallbacks.current = undefined;
    mockPathname = '/';
    mockGetMobileOAuthConfig.mockReturnValue({
      oauthProxyUrl: 'https://oauth-proxy.example.com',
      googleClientId: 'test-google-client-id',
      discordClientId: undefined,
    });
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

describe('Mobile Login screen — Discord sign-in wiring (LS-7766)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthCallbacks.current = undefined;
    mockPathname = '/';
    // Default: Discord available (discordClientId present).
    mockGetMobileOAuthConfig.mockReturnValue({
      oauthProxyUrl: 'https://oauth-proxy.example.com',
      googleClientId: 'test-google-client-id',
      discordClientId: 'test-discord-client-id',
    });
  });

  it('renders the Discord button when discordClientId is configured', async () => {
    await renderLogin();

    expect(screen.getByTestId('discord-login-button')).toBeTruthy();
  });

  it('does not render the Discord button when discordClientId is absent', async () => {
    mockGetMobileOAuthConfig.mockReturnValue({
      oauthProxyUrl: 'https://oauth-proxy.example.com',
      googleClientId: 'test-google-client-id',
      discordClientId: undefined,
    });
    await renderLogin();

    expect(screen.queryByTestId('discord-login-button')).toBeNull();
  });

  it('calls discordLogin when the Discord button is pressed', async () => {
    await renderLogin();

    fireEvent.press(screen.getByTestId('discord-login-button'));

    expect(mockDiscordLogin).toHaveBeenCalledTimes(1);
    // Google is unaffected.
    expect(mockGoogleLogin).not.toHaveBeenCalled();
  });

  it('shows the Discord loading state while sign-in is in flight', async () => {
    await renderLogin();

    expect(screen.queryByTestId('discord-login-loading')).toBeNull();

    fireEvent.press(screen.getByTestId('discord-login-button'));

    expect(screen.getByTestId('discord-login-loading')).toBeTruthy();
  });

  it('displays an error message when Discord sign-in fails', async () => {
    await renderLogin();

    fireEvent.press(screen.getByTestId('discord-login-button'));

    await act(() => {
      mockAuthCallbacks.current?.onFailure?.(
        'Authentication failed. Please try again.',
      );
    });

    expect(
      screen.getByText('Authentication failed. Please try again.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('discord-login-loading')).toBeNull();
  });

  it('clears the Discord loading state on a silent cancel (onFailure with undefined) (LS-7766)', async () => {
    await renderLogin();

    fireEvent.press(screen.getByTestId('discord-login-button'));
    expect(screen.getByTestId('discord-login-loading')).toBeTruthy();

    // A user-dismissed browser fires onFailure(undefined) — no error banner.
    await act(() => {
      mockAuthCallbacks.current?.onFailure?.(undefined);
    });

    expect(screen.queryByTestId('discord-login-loading')).toBeNull();
    expect(screen.queryByTestId('login-error')).toBeNull();
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
    mockGetMobileOAuthConfig.mockReturnValue({
      oauthProxyUrl: 'https://oauth-proxy.example.com',
      googleClientId: 'test-google-client-id',
      discordClientId: undefined,
    });
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
