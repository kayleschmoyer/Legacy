import type { NotificationEvent } from './types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetUserNotificationPreferences = jest.fn();
const mockGetUserDeviceTokens = jest.fn();
const mockLogNotificationHistory = jest.fn();
const mockDisableDeviceToken = jest.fn();

jest.mock('@legacy-sports/db-client', () => ({
  createDatabaseService: jest.fn(() => ({
    notifications: {
      getUserNotificationPreferences: mockGetUserNotificationPreferences,
      getUserDeviceTokens: mockGetUserDeviceTokens,
      logNotificationHistory: mockLogNotificationHistory,
      disableDeviceToken: mockDisableDeviceToken,
    },
  })),
}));

const mockSendPushNotificationsAsync = jest.fn();
const mockIsExpoPushToken = jest.fn();

jest.mock('expo-server-sdk', () => {
  const MockExpo = jest.fn().mockImplementation(() => ({
    chunkPushNotifications: jest.fn((msgs: unknown[]) =>
      msgs.length === 0 ? [] : [msgs],
    ),
    sendPushNotificationsAsync: mockSendPushNotificationsAsync,
  }));
  (MockExpo as unknown as Record<string, unknown>).isExpoPushToken = (
    token: string,
  ): boolean => mockIsExpoPushToken(token) as boolean;
  return { Expo: MockExpo };
});

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({
    host: 'localhost',
    port: 5432,
    user: 'test',
    password: 'test',
    database: 'test',
  })),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { deliverNotification } from './deliver';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(
  overrides: Partial<NotificationEvent> = {},
): NotificationEvent {
  return {
    userId: 1,
    notificationType: 'matchup_started',
    title: 'Matchup Started',
    body: 'Your matchup has started!',
    data: { leagueId: 100 },
    ...overrides,
  };
}

function makeDeviceToken(
  overrides: Partial<{
    id: number;
    userId: number;
    deviceToken: string;
    platform: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: 1,
    userId: 1,
    deviceToken: 'ExponentPushToken[abc123]',
    platform: 'ios',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('deliverNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsExpoPushToken.mockReturnValue(true);
    mockSendPushNotificationsAsync.mockResolvedValue([]);
    mockLogNotificationHistory.mockResolvedValue(42);
  });

  describe('preference enforcement', () => {
    it('skips delivery when pushEnabled is false', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue({
        pushEnabled: false,
      });

      const result = await deliverNotification(makeEvent());

      expect(result.tokensAttempted).toBe(0);
      expect(result.tokensSent).toBe(0);
      expect(result.historyId).toBeNull();
      expect(mockGetUserDeviceTokens).not.toHaveBeenCalled();
    });

    it('proceeds when pushEnabled is true', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue({
        pushEnabled: true,
      });
      mockGetUserDeviceTokens.mockResolvedValue([makeDeviceToken()]);
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      const result = await deliverNotification(makeEvent());

      expect(result.tokensAttempted).toBe(1);
      expect(result.tokensSent).toBe(1);
    });

    it('proceeds when no preferences exist (null)', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockGetUserDeviceTokens.mockResolvedValue([makeDeviceToken()]);
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      const result = await deliverNotification(makeEvent());

      expect(result.tokensSent).toBe(1);
    });
  });

  describe('no active tokens', () => {
    it('logs to history even with no device tokens', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockGetUserDeviceTokens.mockResolvedValue([]);

      const result = await deliverNotification(makeEvent());

      expect(result.tokensAttempted).toBe(0);
      expect(result.historyId).toBe(42);
      expect(mockLogNotificationHistory).toHaveBeenCalledWith(
        1,
        'matchup_started',
        'Matchup Started',
        'Your matchup has started!',
        { leagueId: 100 },
      );
    });

    it('filters out inactive tokens', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockGetUserDeviceTokens.mockResolvedValue([
        makeDeviceToken({ isActive: false }),
      ]);

      const result = await deliverNotification(makeEvent());

      expect(result.tokensAttempted).toBe(0);
      expect(result.historyId).toBe(42);
    });
  });

  describe('successful delivery', () => {
    it('sends push notification and logs to history', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockGetUserDeviceTokens.mockResolvedValue([makeDeviceToken()]);
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      const result = await deliverNotification(makeEvent());

      expect(result).toEqual({
        userId: 1,
        tokensAttempted: 1,
        tokensSent: 1,
        tokensFailed: 0,
        historyId: 42,
      });
      expect(mockSendPushNotificationsAsync).toHaveBeenCalledWith([
        expect.objectContaining({
          to: 'ExponentPushToken[abc123]',
          title: 'Matchup Started',
          body: 'Your matchup has started!',
          sound: 'default',
        }),
      ]);
    });

    it('handles multiple tokens', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockGetUserDeviceTokens.mockResolvedValue([
        makeDeviceToken({ id: 1, deviceToken: 'ExponentPushToken[aaa]' }),
        makeDeviceToken({ id: 2, deviceToken: 'ExponentPushToken[bbb]' }),
      ]);
      mockSendPushNotificationsAsync.mockResolvedValue([
        { status: 'ok' },
        { status: 'ok' },
      ]);

      const result = await deliverNotification(makeEvent());

      expect(result.tokensAttempted).toBe(2);
      expect(result.tokensSent).toBe(2);
      expect(result.tokensFailed).toBe(0);
    });
  });

  describe('token invalidation', () => {
    it('deactivates DeviceNotRegistered tokens', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockGetUserDeviceTokens.mockResolvedValue([
        makeDeviceToken({ deviceToken: 'ExponentPushToken[stale]' }),
      ]);
      mockSendPushNotificationsAsync.mockResolvedValue([
        {
          status: 'error',
          message: 'Device not registered',
          details: { error: 'DeviceNotRegistered' },
        },
      ]);

      const result = await deliverNotification(makeEvent());

      expect(result.tokensFailed).toBe(1);
      expect(mockDisableDeviceToken).toHaveBeenCalledWith(
        1,
        'ExponentPushToken[stale]',
      );
    });

    it('does not deactivate for other errors', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockGetUserDeviceTokens.mockResolvedValue([makeDeviceToken()]);
      mockSendPushNotificationsAsync.mockResolvedValue([
        {
          status: 'error',
          message: 'Rate limit exceeded',
          details: { error: 'MessageRateExceeded' },
        },
      ]);

      await deliverNotification(makeEvent());

      expect(mockDisableDeviceToken).not.toHaveBeenCalled();
    });
  });

  describe('non-Expo tokens', () => {
    it('skips tokens that are not valid Expo push tokens', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockIsExpoPushToken.mockReturnValue(false);
      mockGetUserDeviceTokens.mockResolvedValue([
        makeDeviceToken({ deviceToken: 'not-an-expo-token', platform: 'web' }),
      ]);

      const result = await deliverNotification(makeEvent());

      expect(result.tokensAttempted).toBe(0);
      // No valid Expo tokens, so chunkPushNotifications returns [] and
      // sendPushNotificationsAsync is never called
      expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled();
      expect(result.historyId).toBe(42);
    });
  });
});
