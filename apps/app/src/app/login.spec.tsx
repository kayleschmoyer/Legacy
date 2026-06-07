/**
 * LGN-037 — the mobile login screen returns the user to their deep-linked
 * route after a successful login instead of hard-redirecting to home.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import Login from './login';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
let mockPathname = '/';

// Capture the callbacks login.tsx wires into useAuthHandlers so the test can
// drive the success path without exercising the real OAuth flow.
let capturedOnSuccess: (() => void) | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: (...args: unknown[]): void => {
      mockReplace(...args);
    },
  }),
  usePathname: () => mockPathname,
}));

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

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    LoginPage: () => ReactActual.createElement(View, { testID: 'login-card' }),
  };
});

jest.mock('../common/auth/AuthHooks', () => ({
  useAuthHandlers: (callbacks: { onSuccess?: () => void }) => {
    capturedOnSuccess = callbacks.onSuccess;
    return { googleLogin: jest.fn(), appleLogin: jest.fn() };
  },
}));

jest.mock('../common/auth/appleAuth', () => ({
  isAppleAuthAvailable: () => Promise.resolve(false),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Mobile Login screen — deep-link preservation (LGN-037)', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    capturedOnSuccess = undefined;
    mockPathname = '/';
  });

  it('returns to the deep-linked route on successful login', async () => {
    mockPathname = '/baseball/league/123';
    render(<Login />);

    expect(capturedOnSuccess).toBeDefined();
    await act(async () => {
      capturedOnSuccess?.();
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith('/baseball/league/123');
  });

  it('falls back to home when login was reached at the /login route', async () => {
    mockPathname = '/login';
    render(<Login />);

    await act(async () => {
      capturedOnSuccess?.();
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
