import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
// Mutable so each test can run as iOS or Android (LS-7652).
let mockPlatformOS = 'ios';
const mockSetNotificationChannelAsync = jest
  .fn<Promise<null>, unknown[]>()
  .mockResolvedValue(null);

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
}));

const mockAddPushTokenListener = jest.fn<
  { remove: jest.Mock },
  [cb: () => void]
>(() => ({
  remove: jest.fn(),
}));

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
  setNotificationChannelAsync: (...args: unknown[]) =>
    mockSetNotificationChannelAsync(...args),
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
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
  AppState: {
    addEventListener: (...args: [string, AppStateChangeHandler]) =>
      mockAppStateAddEventListener(...args),
  },
}));

jest.mock('../../../common/utilities/DeviceUtils', () => ({
  isPhysicalDevice: true,
}));

jest.mock('@legacy-sports/graphql', () => ({
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

beforeEach(async () => {
  // The LS-9541 registration fingerprint lives in AsyncStorage and survives
  // between tests in this file, which would make later registrations skip.
  await AsyncStorage.clear();

  jest.clearAllMocks();
  mockExtra = {};
  mockPlatformOS = 'ios';
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

  it('registers the token with platform android on Android', async () => {
    mockPlatformOS = 'android';
    mockExtra = { eas: { projectId: 'proj-9999' } };

    renderHook(() => usePushNotifications(1));

    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledWith({
        variables: {
          input: { deviceToken: 'expo-token', platform: 'android' },
        },
      }),
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('sets up the default notification channel on Android only', async () => {
    mockPlatformOS = 'android';
    mockExtra = { eas: { projectId: 'proj-9999' } };

    const android = renderHook(() => usePushNotifications(1));
    await waitFor(() => expect(mockRegisterDeviceToken).toHaveBeenCalled());
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledTimes(1);
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith(
      'default',
      expect.anything(),
    );
    android.unmount();

    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockPlatformOS = 'ios';

    renderHook(() => usePushNotifications(1));
    await waitFor(() => expect(mockRegisterDeviceToken).toHaveBeenCalled());
    expect(mockSetNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('registers separate tokens for ios then android with their own platform', async () => {
    mockExtra = { eas: { projectId: 'proj-9999' } };

    mockGetExpoPushTokenAsync.mockResolvedValueOnce({ data: 'token-A' });
    const ios = renderHook(() => usePushNotifications(1));
    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledWith({
        variables: { input: { deviceToken: 'token-A', platform: 'ios' } },
      }),
    );
    ios.unmount();

    await AsyncStorage.clear();
    mockPlatformOS = 'android';
    mockGetExpoPushTokenAsync.mockResolvedValueOnce({ data: 'token-B' });
    renderHook(() => usePushNotifications(1));
    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledWith({
        variables: { input: { deviceToken: 'token-B', platform: 'android' } },
      }),
    );
    expect(mockRegisterDeviceToken).toHaveBeenCalledTimes(2);
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

    let capturedListener: (() => void) | undefined;
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

describe('usePushNotifications — unchanged-token skip (LS-9541)', () => {
  beforeEach(() => {
    mockExtra = { eas: { projectId: 'proj-9999' } };
  });

  it('does not re-register an unchanged token when the app returns to foreground', async () => {
    renderHook(() => usePushNotifications(1));

    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledTimes(1),
    );

    void act(() => {
      appStateListeners.forEach((handler) => handler('active'));
    });

    // The token is fetched again, but the mutation is skipped because the
    // fingerprint still matches.
    await waitFor(() =>
      expect(mockGetExpoPushTokenAsync).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.stringContaining('unchanged since last registration'),
      ),
    );
    expect(mockRegisterDeviceToken).toHaveBeenCalledTimes(1);
  });

  it('registers a genuinely rotated token on foreground', async () => {
    renderHook(() => usePushNotifications(1));

    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledTimes(1),
    );

    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'expo-token-v2' });
    void act(() => {
      appStateListeners.forEach((handler) => handler('active'));
    });

    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledWith({
        variables: { input: { deviceToken: 'expo-token-v2', platform: 'ios' } },
      }),
    );

    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'expo-token' });
  });

  it('registers again when a different user signs in', async () => {
    const initialProps: { id: number | null } = { id: 1 };
    const { rerender } = renderHook(
      ({ id }: { id: number | null }) => usePushNotifications(id),
      { initialProps },
    );

    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledTimes(1),
    );

    rerender({ id: 2 });

    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledTimes(2),
    );
  });

  it('clears the fingerprint on sign-out so the next sign-in re-registers', async () => {
    const initialProps: { id: number | null } = { id: 1 };
    const { rerender } = renderHook(
      ({ id }: { id: number | null }) => usePushNotifications(id),
      { initialProps },
    );

    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledTimes(1),
    );

    rerender({ id: null });
    rerender({ id: 1 });

    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledTimes(2),
    );
  });
});
