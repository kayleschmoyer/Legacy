import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

import NotificationsScreen from './notifications';

// ── Configurable mock state ──────────────────────────────────────────────────
let capturedProps: Record<string, unknown> | null = null;
let mockReadKeychainValue: jest.Mock;

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => ({ id: 1, email: 'test@example.com' }),
}));

jest.mock('../../common/auth/AuthHooks', () => ({
  readKeychainValue: jest.fn(),
  Secret: { INTERNAL_JWT: 'INTERNAL_JWT' },
}));

jest.mock('@legacy-sports/app-config/native', () => ({
  config: { websocketUrl: 'wss://example.com' },
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn() },
}));

jest.mock('@legacy-sports/shared-components/notifications', () => ({
  NotificationsScreen: (props: Record<string, unknown>) => {
    capturedProps = props;
    const { View } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return <View testID="notifications-screen" />;
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  capturedProps = null;
  const authHooksMock: { readKeychainValue: jest.Mock } = jest.requireMock(
    '../../common/auth/AuthHooks',
  );
  mockReadKeychainValue = authHooksMock.readKeychainValue;
  mockReadKeychainValue.mockResolvedValue('mock-token');
});

describe('NotificationsScreen (native)', () => {
  it('renders without crashing', async () => {
    render(<NotificationsScreen />);
    await waitFor(() => expect(mockReadKeychainValue).toHaveBeenCalled());
  });

  it('passes userId to NotificationsScreenComponent', async () => {
    render(<NotificationsScreen />);
    expect(capturedProps?.userId).toBe(1);
    await waitFor(() => expect(mockReadKeychainValue).toHaveBeenCalled());
  });

  it('renders and fetches on mount before the keychain token resolves (no crash)', () => {
    mockReadKeychainValue.mockReturnValue(new Promise(() => undefined));
    render(<NotificationsScreen />);
    expect(capturedProps?.websocketToken).toBeUndefined();
    expect(capturedProps?.websocketUrl).toBe('wss://example.com');
  });

  it('forwards websocketUrl from config once rendered', async () => {
    render(<NotificationsScreen />);
    await waitFor(() => {
      expect(capturedProps?.websocketUrl).toBe('wss://example.com');
    });
  });

  it('forwards websocketToken from the keychain once the read resolves', async () => {
    render(<NotificationsScreen />);
    await waitFor(() => {
      expect(capturedProps?.websocketToken).toBe('mock-token');
    });
  });

  it('does not set a token when the keychain read resolves null (logged out)', async () => {
    mockReadKeychainValue.mockResolvedValue(null);
    render(<NotificationsScreen />);
    await waitFor(() => {
      expect(mockReadKeychainValue).toHaveBeenCalledWith('INTERNAL_JWT');
    });
    expect(capturedProps?.websocketToken).toBeUndefined();
  });
});
