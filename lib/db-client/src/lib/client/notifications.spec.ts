import type { PublicDb } from './PublicDbClient';
import {
  createNotificationHistory,
  getUserNotificationPreferences,
  registerDeviceToken,
} from './notifications';

// Mock PublicDb
const mockDb = {
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
} as unknown as PublicDb;

describe('Notification Client Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserNotificationPreferences', () => {
    it('should return existing preferences', async () => {
      const mockPreferences = {
        id: 1,
        userId: 123,
        matchupStartedEnabled: true,
        matchupEndedEnabled: true,
        matchupCloseGameEnabled: true,
        matchupReminderEnabled: true,
        pushEnabled: true,
        emailEnabled: false,
        closeGameThreshold: '5.0',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };

      // Mock the database call
      (mockDb.select as ReturnType<typeof jest.fn>).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockPreferences]),
          }),
        }),
      });

      const result = await getUserNotificationPreferences(mockDb, 123);
      expect(result).toEqual(mockPreferences);
    });
  });

  describe('registerDeviceToken', () => {
    it('should register a new device token', async () => {
      const mockToken = {
        id: 1,
        userId: 123,
        deviceToken: 'test-token-123',
        platform: 'ios',
        endpointArn: 'arn:aws:sns:us-east-1:123456789012:endpoint/test',
        enabled: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };

      (mockDb.select as ReturnType<typeof jest.fn>).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      (mockDb.insert as ReturnType<typeof jest.fn>).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockToken]),
        }),
      });

      const result = await registerDeviceToken(mockDb, {
        userId: 123,
        deviceToken: 'test-token-123',
        platform: 'ios',
        endpointArn: 'arn:aws:sns:us-east-1:123456789012:endpoint/test',
      });

      expect(result).toEqual(mockToken);
    });
  });

  describe('createNotificationHistory', () => {
    it('should create a notification history record', async () => {
      const mockNotification = {
        id: 1,
        userId: 123,
        notificationType: 'matchup_started' as const,
        channel: 'push' as const,
        matchupId: 456,
        leagueId: 789,
        title: 'Matchup Started',
        message: 'Your matchup has begun!',
        metadata: null,
        read: false,
        sentAt: '2025-01-01T00:00:00Z',
        readAt: null,
        createdAt: '2025-01-01T00:00:00Z',
      };

      (mockDb.insert as ReturnType<typeof jest.fn>).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockNotification]),
        }),
      });

      const result = await createNotificationHistory(mockDb, {
        userId: 123,
        notificationType: 'matchup_started',
        channel: 'push',
        matchupId: 456,
        leagueId: 789,
        title: 'Matchup Started',
        message: 'Your matchup has begun!',
      });

      expect(result).toEqual(mockNotification);
    });
  });
});
