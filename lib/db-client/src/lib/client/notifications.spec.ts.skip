import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicDb } from './PublicDbClient';
import {
  createNotificationHistory,
  getUserNotificationPreferences,
  registerDeviceToken,
} from './notifications';

// Mock PublicDb
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
} as unknown as PublicDb;

describe('Notification Client Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockPreferences]),
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

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockToken]),
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

      (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockNotification]),
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
