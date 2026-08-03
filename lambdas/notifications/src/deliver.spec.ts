import type { NotificationEvent } from './types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetUserNotificationPreferences = jest.fn();
const mockGetUserDeviceTokens = jest.fn();
const mockLogNotificationHistory = jest.fn();
const mockDisableDeviceToken = jest.fn();
const mockNotifyNotificationReceived = jest.fn();

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

jest.mock('@legacy-sports/aws-utils', () => ({
  createNotificationService: jest.fn(() => ({
    notifyNotificationReceived: mockNotifyNotificationReceived,
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

const mockWebPushSendNotification = jest.fn();
const mockWebPushSetVapidDetails = jest.fn();

jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: mockWebPushSetVapidDetails,
    sendNotification: mockWebPushSendNotification,
    WebPushError: class WebPushError extends Error {
      constructor(
        message: string,
        public statusCode: number,
      ) {
        super(message);
      }
    },
  },
}));

// ── VAPID env control ────────────────────────────────────────────────────────
//
// deliver.ts reads VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT from
// process.env at module load, so the spec must own those vars and re-import
// the module per configuration (LS-8999) — otherwise a host .env that defines
// VAPID keys flips the web-token branch and the suite's outcome depends on
// the environment it runs in.

const VAPID_ENV_KEYS = [
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
] as const;
const savedVapidEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of VAPID_ENV_KEYS) {
    savedVapidEnv[key] = process.env[key];
  }
});

afterAll(() => {
  for (const key of VAPID_ENV_KEYS) {
    const saved = savedVapidEnv[key];
    if (saved === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved;
    }
  }
});

let deliverNotification: (typeof import('./deliver'))['deliverNotification'];

async function loadDeliverModule(vapid?: {
  publicKey: string;
  privateKey: string;
}): Promise<void> {
  jest.resetModules();
  for (const key of VAPID_ENV_KEYS) {
    delete process.env[key];
  }
  if (vapid) {
    process.env['VAPID_PUBLIC_KEY'] = vapid.publicKey;
    process.env['VAPID_PRIVATE_KEY'] = vapid.privateKey;
  }
  ({ deliverNotification } = await import('./deliver'));
}

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
  beforeEach(async () => {
    jest.clearAllMocks();
    mockIsExpoPushToken.mockReturnValue(true);
    mockSendPushNotificationsAsync.mockResolvedValue([]);
    mockLogNotificationHistory.mockResolvedValue(42);
    mockNotifyNotificationReceived.mockResolvedValue(undefined);
    // Default: VAPID unset, regardless of the host .env
    await loadDeliverModule();
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

  describe('WebSocket notification-received push', () => {
    it('pushes notification-received after logging history (no tokens path)', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockGetUserDeviceTokens.mockResolvedValue([]);

      await deliverNotification(makeEvent());

      expect(mockLogNotificationHistory).toHaveBeenCalledTimes(1);
      expect(mockNotifyNotificationReceived).toHaveBeenCalledWith(1, {
        historyId: 42,
        notificationType: 'matchup_started',
      });
    });

    it('pushes notification-received after a successful push delivery', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockGetUserDeviceTokens.mockResolvedValue([makeDeviceToken()]);
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

      await deliverNotification(makeEvent());

      expect(mockNotifyNotificationReceived).toHaveBeenCalledWith(1, {
        historyId: 42,
        notificationType: 'matchup_started',
      });
    });

    it('does not throw when the WebSocket push fails (non-fatal)', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockGetUserDeviceTokens.mockResolvedValue([]);
      mockNotifyNotificationReceived.mockRejectedValue(
        new Error('connection table missing'),
      );

      await expect(deliverNotification(makeEvent())).resolves.toMatchObject({
        userId: 1,
        historyId: 42,
      });
    });

    it('skips the push when pushEnabled is false (no history logged)', async () => {
      mockGetUserNotificationPreferences.mockResolvedValue({
        pushEnabled: false,
      });

      await deliverNotification(makeEvent());

      expect(mockLogNotificationHistory).not.toHaveBeenCalled();
      expect(mockNotifyNotificationReceived).not.toHaveBeenCalled();
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

  describe('web push tokens (VAPID)', () => {
    const webSubscription = JSON.stringify({
      endpoint: 'https://push.example.com/subscription/abc',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    });

    it('skips web tokens (attempted 0) when VAPID keys are not configured', async () => {
      // beforeEach loaded the module with VAPID env unset
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockGetUserDeviceTokens.mockResolvedValue([
        makeDeviceToken({ deviceToken: webSubscription, platform: 'web' }),
      ]);

      const result = await deliverNotification(makeEvent());

      expect(result.tokensAttempted).toBe(0);
      expect(result.tokensSent).toBe(0);
      expect(mockWebPushSendNotification).not.toHaveBeenCalled();
      expect(result.historyId).toBe(42);
    });

    it('attempts and sends web tokens when VAPID keys are configured', async () => {
      await loadDeliverModule({
        publicKey: 'test-public-key',
        privateKey: 'test-private-key',
      });
      mockWebPushSendNotification.mockResolvedValue(undefined);
      mockGetUserNotificationPreferences.mockResolvedValue(null);
      mockGetUserDeviceTokens.mockResolvedValue([
        makeDeviceToken({ deviceToken: webSubscription, platform: 'web' }),
      ]);

      const result = await deliverNotification(makeEvent());

      expect(result.tokensAttempted).toBe(1);
      expect(result.tokensSent).toBe(1);
      expect(result.tokensFailed).toBe(0);
      expect(mockWebPushSetVapidDetails).toHaveBeenCalledWith(
        'mailto:push@legacysports.app',
        'test-public-key',
        'test-private-key',
      );
      expect(mockWebPushSendNotification).toHaveBeenCalledWith(
        JSON.parse(webSubscription),
        expect.any(String),
      );
    });
  });
});
