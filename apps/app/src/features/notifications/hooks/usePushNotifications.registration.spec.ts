import { renderHook, waitFor } from '@testing-library/react-native';

import { usePushNotifications } from './usePushNotifications';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetExpoPushTokenAsync = jest
  .fn<Promise<{ data: string }>, [unknown?]>()
  .mockResolvedValue({ data: 'expo-token' });
const mockRegisterDeviceToken = jest.fn().mockResolvedValue({});
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

// Mutable so each test can configure whether a projectId is present.
let mockExtra: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
}));

const mockAddPushTokenListener = jest.fn(() => ({ remove: jest.fn() }));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  addPushTokenListener: (cb: () => void) => mockAddPushTokenListener(cb),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  getExpoPushTokenAsync: (options?: unknown) =>
    mockGetExpoPushTokenAsync(options),
  AndroidImportance: { MAX: 5 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
}));

jest.mock('expo-modules-core', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
}));

jest.mock('expo-constants', () => ({
  // __esModule: true keeps babel's _interopRequireDefault from double-wrapping
  // the default export (so Constants.expoConfig resolves), matching
  // apps/app/__mocks__/expo-constants.js.
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('../../../common/utilities/DeviceUtils', () => ({
  isPhysicalDevice: true,
}));

jest.mock('../../../api/db/graphql.generated', () => ({
  useRegisterDeviceTokenMutation: () => [mockRegisterDeviceToken],
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: (...args: unknown[]) => {
      mockLoggerInfo(...args);
    },
    warn: jest.fn(),
    error: (...args: unknown[]) => {
      mockLoggerError(...args);
    },
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockExtra = {};
});

describe('usePushNotifications — token registration', () => {
  it('passes the configured EAS projectId to getExpoPushTokenAsync and registers the token', async () => {
    mockExtra = { eas: { projectId: 'proj-9999' } };

    renderHook(() => usePushNotifications(1));

    await waitFor(() => expect(mockGetExpoPushTokenAsync).toHaveBeenCalled());
    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'proj-9999',
    });

    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledWith({
        variables: { input: { deviceToken: 'expo-token', platform: 'ios' } },
      }),
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('skips registration without error when no EAS projectId is configured', async () => {
    mockExtra = {};

    renderHook(() => usePushNotifications(1));

    await waitFor(() => expect(mockLoggerInfo).toHaveBeenCalled());
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockRegisterDeviceToken).not.toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('does not register when userId is null', () => {
    mockExtra = { eas: { projectId: 'proj-9999' } };

    renderHook(() => usePushNotifications(null));

    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockRegisterDeviceToken).not.toHaveBeenCalled();
  });
});

describe('usePushNotifications — token rotation', () => {
  it('re-registers when the OS rolls a new device push token', async () => {
    mockExtra = { eas: { projectId: 'proj-abc' } };

    let capturedListener: (() => void) | null = null;
    mockAddPushTokenListener.mockImplementation((cb: () => void) => {
      capturedListener = cb;
      return { remove: jest.fn() };
    });

    renderHook(() => usePushNotifications(1));

    // Wait for initial registration
    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledTimes(1),
    );

    // Simulate OS token rotation
    capturedListener?.();

    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledTimes(2),
    );
  });

  it('subscribes addPushTokenListener on mount and unsubscribes on unmount', () => {
    mockExtra = {};
    const mockRemove = jest.fn();
    mockAddPushTokenListener.mockReturnValue({ remove: mockRemove });

    const { unmount } = renderHook(() => usePushNotifications(1));

    expect(mockAddPushTokenListener).toHaveBeenCalled();

    unmount();

    expect(mockRemove).toHaveBeenCalled();
  });
});
