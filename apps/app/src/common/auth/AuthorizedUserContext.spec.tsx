import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Module under test (jest.mock calls are hoisted above this) ──────────────

import {
  AuthorizedUserContextProvider,
  useAuthorizedUserInfo,
} from './AuthorizedUserContext';

// ── Mock type helpers ───────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
  ActivityIndicator: React.ComponentType;
};

// ── Mocks ───────────────────────────────────────────────────────────────────

// Mock expo-router
jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual<RNComponents>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => (
      <RNText testID="redirect">{`Redirect:${href}`}</RNText>
    ),
  };
});

// Mock @legacy-sports/logging
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock @legacy-sports/shared-components
jest.mock('@legacy-sports/shared-components', () => {
  const { View, ActivityIndicator } =
    jest.requireActual<RNComponents>('react-native');
  return {
    UnifiedLoadingPanel: () => (
      <View testID="loading-panel">
        <ActivityIndicator />
      </View>
    ),
    OAuthProvider: { signIn: jest.fn(), signOut: jest.fn() },
    SecureStorageProvider: {
      getItem: jest.fn().mockResolvedValue(null),
      setItem: jest.fn().mockResolvedValue(undefined),
      removeItem: jest.fn().mockResolvedValue(undefined),
    },
  };
});

// Mock env utilities
jest.mock('@legacy-sports/env-utilities', () => ({
  getEnvVarRequired: jest
    .fn()
    .mockReturnValue('https://oauth-proxy.example.com'),
  getEnvVarOptional: jest.fn().mockReturnValue(undefined),
}));

// Mock useCurrentUserInfo from AuthHooks
const mockUseCurrentUserInfo = jest.fn();
jest.mock('./AuthHooks', () => ({
  useCurrentUserInfo: (...args: unknown[]): unknown =>
    mockUseCurrentUserInfo(...args),
}));

// ── Test consumer component ─────────────────────────────────────────────────

function TestConsumer() {
  const user = useAuthorizedUserInfo();
  return <Text testID="user-info">{`${user.username}:${user.id}`}</Text>;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AuthorizedUserContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AuthorizedUserContextProvider', () => {
    it('renders loading panel while user info is loading', () => {
      mockUseCurrentUserInfo.mockReturnValue({ loading: true, data: null });

      render(
        <AuthorizedUserContextProvider>
          <Text>Child content</Text>
        </AuthorizedUserContextProvider>,
      );

      expect(screen.getByTestId('loading-panel')).toBeTruthy();
      expect(screen.queryByText('Child content')).toBeNull();
    });

    it('redirects to root when user is not authenticated', () => {
      mockUseCurrentUserInfo.mockReturnValue({ loading: false, data: null });

      render(
        <AuthorizedUserContextProvider>
          <Text>Child content</Text>
        </AuthorizedUserContextProvider>,
      );

      expect(screen.getByTestId('redirect')).toBeTruthy();
      expect(screen.getByText('Redirect:/')).toBeTruthy();
      expect(screen.queryByText('Child content')).toBeNull();
    });

    it('renders children and provides user context when authenticated', () => {
      const mockUser = {
        id: 1,
        email: 'user@example.com',
        username: 'testuser',
        isAdmin: false,
        about: null,
      };
      mockUseCurrentUserInfo.mockReturnValue({
        loading: false,
        data: mockUser,
      });

      render(
        <AuthorizedUserContextProvider>
          <TestConsumer />
        </AuthorizedUserContextProvider>,
      );

      expect(screen.getByTestId('user-info')).toBeTruthy();
      expect(screen.getByText('testuser:1')).toBeTruthy();
    });

    it('provides admin user context correctly', () => {
      const adminUser = {
        id: 99,
        email: 'admin@example.com',
        username: 'adminuser',
        isAdmin: true,
        about: 'Admin account',
      };
      mockUseCurrentUserInfo.mockReturnValue({
        loading: false,
        data: adminUser,
      });

      render(
        <AuthorizedUserContextProvider>
          <TestConsumer />
        </AuthorizedUserContextProvider>,
      );

      expect(screen.getByText('adminuser:99')).toBeTruthy();
    });
  });

  describe('useAuthorizedUserInfo', () => {
    it('throws error when used outside provider', () => {
      // Suppress console.error for expected error — use globalThis to avoid no-console lint rule
      const globalConsole = globalThis['console'];
      const consoleSpy = jest
        .spyOn(globalConsole, 'error')
        .mockImplementation(jest.fn());

      expect(() => render(<TestConsumer />)).toThrow(
        'This component must be rendered inside an AuthorizedUserContextProvider',
      );

      consoleSpy.mockRestore();
    });

    it('returns user data when inside provider', () => {
      const mockUser = {
        id: 7,
        email: 'player@example.com',
        username: 'player7',
        isAdmin: false,
        about: 'A player',
      };
      mockUseCurrentUserInfo.mockReturnValue({
        loading: false,
        data: mockUser,
      });

      render(
        <AuthorizedUserContextProvider>
          <TestConsumer />
        </AuthorizedUserContextProvider>,
      );

      expect(screen.getByText('player7:7')).toBeTruthy();
    });
  });
});
