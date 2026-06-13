import { act, renderHook, waitFor } from '@testing-library/react-native';

import { usePushNotifications } from './usePushNotifications';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetExpoPushTokenAsync = jest
  .fn<Promise<{ data: string }>, [unknown?]>()
  .mockResolvedValue({ data: 'expo-token' });
const mockGetPermissionsAsync = jest
  .fn<Promise<{ status: string }>, []>()
  .mockResolvedValue({ status: 'granted' });
const mockRequestPermissionsAsync = jest
  .fn<Promise<{ status: string }>, []>()
  .mockResolvedValue({ status: 'granted' });
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
  getPermissionsAsync: () => mockGetPermissionsAsync(),
  requestPermissionsAsync: () => mockRequestPermissionsAsync(),
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

type AppStateChangeHandler = (state: string) => void;
let appStateListeners: AppStateChangeHandler[] = [];
const mockAppStateAddEventListener = jest.fn(
  (_event: string, handler: AppStateChangeHandler) => {
    appStateListeners.push(handler);
    return {
      remove: () => {
        appStateListeners = appStateListeners.filter((h) => h !== handler);
      },
    };
  },
);

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: (...args: [string, AppStateChangeHandler]) =>
      mockAppStateAddEventListener(...args),
  },
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
  appStateListeners = [];
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

  it('re-registers when app returns to foreground after permissions granted', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    mockExtra = { eas: { projectId: 'proj-9999' } };

    renderHook(() => usePushNotifications(1));

    // First run: permission denied, token should NOT be registered
    await waitFor(() => expect(mockGetPermissionsAsync).toHaveBeenCalled());
    expect(mockRegisterDeviceToken).not.toHaveBeenCalled();

    // User grants permission in system settings and returns to app
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    void act(() => {
      appStateListeners.forEach((handler) => handler('active'));
    });

    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledWith({
        variables: { input: { deviceToken: 'expo-token', platform: 'ios' } },
      }),
    );
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
