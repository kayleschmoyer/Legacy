import { renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ANDROID_NOTIFICATION_CHANNELS } from '@legacy-sports/utils';
import { usePushNotifications } from './usePushNotifications';

// ── Mocks ─────────────────────────────────────────────────────────────────────
//
// Covers the emulator-equivalent registration flow (AC1): the OS permission
// prompt is granted/denied, and — on Android — the notification channel is
// created before a token is registered. Success is asserted at the hook level
// (the token-registration mutation firing, and the Android channel call),
// which the ticket permits in lieu of a full on-device emulator run.
// Platform.OS is mocked to 'android' so the channel-setup branch executes.

const mockGetPermissionsAsync = jest
  .fn<Promise<{ status: string }>, []>()
  .mockResolvedValue({ status: 'granted' });
const mockRequestPermissionsAsync = jest
  .fn<Promise<{ status: string }>, []>()
  .mockResolvedValue({ status: 'granted' });
const mockSetNotificationChannelAsync = jest
  .fn<Promise<null>, [string, unknown]>()
  .mockResolvedValue(null);
const mockGetExpoPushTokenAsync = jest
  .fn<Promise<{ data: string }>, [unknown?]>()
  .mockResolvedValue({ data: 'expo-token' });
const mockRegisterDeviceToken = jest.fn().mockResolvedValue({});
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  getPermissionsAsync: () => mockGetPermissionsAsync(),
  requestPermissionsAsync: () => mockRequestPermissionsAsync(),
  setNotificationChannelAsync: (channel: string, config: unknown) =>
    mockSetNotificationChannelAsync(channel, config),
  getExpoPushTokenAsync: (options?: unknown) =>
    mockGetExpoPushTokenAsync(options),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
}));

jest.mock('expo-modules-core', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'proj-android' } } } },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
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
  mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
});

describe('usePushNotifications — permission prompt', () => {
  it('prompts for permission when not already granted, then registers the token after the user grants it', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });

    renderHook(() => usePushNotifications(1));

    await waitFor(() => expect(mockRequestPermissionsAsync).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockRegisterDeviceToken).toHaveBeenCalledWith({
        variables: {
          input: { deviceToken: 'expo-token', platform: 'android' },
        },
      }),
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('does not prompt again when permission is already granted, and still registers', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });

    renderHook(() => usePushNotifications(1));

    await waitFor(() => expect(mockRegisterDeviceToken).toHaveBeenCalled());
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not register the token when the user denies the permission prompt', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });

    renderHook(() => usePushNotifications(1));

    await waitFor(() => expect(mockRequestPermissionsAsync).toHaveBeenCalled());
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockRegisterDeviceToken).not.toHaveBeenCalled();
  });
});

describe('usePushNotifications — Android channel setup', () => {
  it('registers one Android channel per shared definition before registering the token', async () => {
    renderHook(() => usePushNotifications(1));

    await waitFor(() =>
      expect(mockSetNotificationChannelAsync).toHaveBeenCalledTimes(
        ANDROID_NOTIFICATION_CHANNELS.length,
      ),
    );
    for (const channel of ANDROID_NOTIFICATION_CHANNELS) {
      expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith(
        channel.id,
        expect.objectContaining({ name: channel.name }),
      );
    }
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ name: 'General', importance: 5 }),
    );
    await waitFor(() => expect(mockRegisterDeviceToken).toHaveBeenCalled());
  });
});
