/**
 * Coverage for the mobile Login screen (`login.tsx`) — the only mobile auth
 * surface. Two concerns share one set of mocks:
 *
 * - Deep-link preservation: a successful login returns the user to their
 *   deep-linked route, falling back to home from the bare /login route
 *   (LGN-037).
 * - Google sign-in wiring: button press invokes googleLogin, the loading state
 *   surfaces while in flight, errors are displayed, and the error clears on
 *   retry (LS-6657).
 *
 * The native auth layer (`useAuthHandlers`) is exercised directly by
 * AuthHooks.spec.tsx and the LoginPage UI by shared-components/LoginPage.spec;
 * here both are mocked so these tests stay focused on the wrapper's wiring.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

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
    return { googleLogin: mockGoogleLogin, appleLogin: mockAppleLogin };
  },
}));

// Apple is not the focus of this Android-only auth surface; resolve to false so
// the Apple button stays hidden and the useEffect settles to a stable state.
jest.mock('../common/auth/appleAuth', () => ({
  isAppleAuthAvailable: jest.fn().mockResolvedValue(false),
}));

// tamagui's Theme/YStack are layout-only wrappers in login.tsx; render children
// directly to avoid pulling the native tamagui runtime into Jest.
jest.mock('tamagui', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    Theme: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement(View, null, children),
    YStack: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement(View, null, children),
  };
});

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
    }: {
      onGoogleSignIn: () => void;
      isGoogleLoading?: boolean;
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
      ),
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
