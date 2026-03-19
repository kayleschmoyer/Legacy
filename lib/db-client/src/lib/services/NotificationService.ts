import { and, desc, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils/node';
import { runWithPublicClient } from '../client/Helpers';
import { PublicSchema } from '../client/PublicDbClient';

export interface NotificationPreference {
  id: number;
  userId: number;
  matchupStartedEnabled: boolean;
  matchupEndedEnabled: boolean;
  matchupCloseGameEnabled: boolean;
  matchupReminderEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  closeGameThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceToken {
  id: number;
  userId: number;
  deviceToken: string;
  platform: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationHistoryItem {
  id: number;
  userId: number;
  notificationType: string;
  title: string;
  body: string;
  data: unknown;
  isRead: boolean;
  sentAt: Date;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationPreferenceUpdate {
  matchupStartedEnabled?: boolean;
  matchupEndedEnabled?: boolean;
  matchupCloseGameEnabled?: boolean;
  matchupReminderEnabled?: boolean;
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  closeGameThreshold?: number;
}

/**
 * Notification service functions for database operations
 */
export class NotificationService {
  constructor(private options: DbOptions) {}

  /**
   * Get user notification preferences
   */
  async getUserNotificationPreferences(
    userId: number,
  ): Promise<NotificationPreference | null> {
    return runWithPublicClient(this.options, async (db) => {
      const result = await db
        .select()
        .from(PublicSchema.notificationPreferences)
        .where(eq(PublicSchema.notificationPreferences.userId, userId))
        .limit(1);

      if (result.length === 0) return null;

      const pref = result[0];
      return {
        id: Number(pref.id),
        userId: Number(pref.userId),
        matchupStartedEnabled: pref.matchupStartedEnabled,
        matchupEndedEnabled: pref.matchupEndedEnabled,
        matchupCloseGameEnabled: pref.matchupCloseGameEnabled,
        matchupReminderEnabled: pref.matchupReminderEnabled,
        pushEnabled: pref.pushEnabled,
        emailEnabled: pref.emailEnabled,
        closeGameThreshold: pref.closeGameThreshold,
        createdAt: pref.createdAt,
        updatedAt: pref.updatedAt,
      };
    });
  }

  /**
   * Update or create notification preferences for a user
   */
  async updateNotificationPreferences(
    userId: number,
    updates: NotificationPreferenceUpdate,
  ): Promise<NotificationPreference> {
    return runWithPublicClient(this.options, async (db) => {
      // Try to update existing preferences
      const existing = await db
        .select()
        .from(PublicSchema.notificationPreferences)
        .where(eq(PublicSchema.notificationPreferences.userId, userId))
        .limit(1);

      let result;
      if (existing.length > 0) {
        // Update existing
        [result] = await db
          .update(PublicSchema.notificationPreferences)
          .set({
            ...updates,
            updatedAt: new Date(),
          })
          .where(eq(PublicSchema.notificationPreferences.userId, userId))
          .returning();
      } else {
        // Insert new
        [result] = await db
          .insert(PublicSchema.notificationPreferences)
          .values({
            userId,
            ...updates,
          })
          .returning();
      }

      return {
        id: Number(result.id),
        userId: Number(result.userId),
        matchupStartedEnabled: result.matchupStartedEnabled,
        matchupEndedEnabled: result.matchupEndedEnabled,
        matchupCloseGameEnabled: result.matchupCloseGameEnabled,
        matchupReminderEnabled: result.matchupReminderEnabled,
        pushEnabled: result.pushEnabled,
        emailEnabled: result.emailEnabled,
        closeGameThreshold: result.closeGameThreshold,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      };
    });
  }

  /**
   * Get notification history for a user
   */
  async getNotificationHistory(
    userId: number,
    limit = 50,
    offset = 0,
  ): Promise<NotificationHistoryItem[]> {
    return runWithPublicClient(this.options, async (db) => {
      const results = await db
        .select()
        .from(PublicSchema.notificationHistory)
        .where(eq(PublicSchema.notificationHistory.userId, userId))
        .orderBy(desc(PublicSchema.notificationHistory.sentAt))
        .limit(limit)
        .offset(offset);

      return results.map((item) => ({
        id: Number(item.id),
        userId: Number(item.userId),
        notificationType: item.notificationType,
        title: item.title,
        body: item.body,
        data: item.data,
        isRead: item.isRead,
        sentAt: item.sentAt,
        readAt: item.readAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    });
  }

  /**
   * Get count of unread notifications
   */
  async getUnreadNotificationCount(userId: number): Promise<number> {
    return runWithPublicClient(this.options, async (db) => {
      const results = await db
        .select({ count: sql<number>`count(*)` })
        .from(PublicSchema.notificationHistory)
        .where(
          and(
            eq(PublicSchema.notificationHistory.userId, userId),
            eq(PublicSchema.notificationHistory.isRead, false),
          ),
        );

      const countValue = results[0]?.count;
      return typeof countValue === 'number'
        ? countValue
        : Number.parseInt(String(countValue ?? 0), 10);
    });
  }

  /**
   * Get user device tokens
   */
  async getUserDeviceTokens(userId: number): Promise<DeviceToken[]> {
    return runWithPublicClient(this.options, async (db) => {
      const results = await db
        .select()
        .from(PublicSchema.deviceTokens)
        .where(eq(PublicSchema.deviceTokens.userId, userId));

      return results.map((token) => ({
        id: Number(token.id),
        userId: Number(token.userId),
        deviceToken: token.deviceToken,
        platform: token.platform,
        isActive: token.isActive,
        createdAt: token.createdAt,
        updatedAt: token.updatedAt,
      }));
    });
  }

  /**
   * Register a new device token
   */
  async registerDeviceToken(
    userId: number,
    deviceToken: string,
    platform: string,
  ): Promise<DeviceToken> {
    return runWithPublicClient(this.options, async (db) => {
      // Check if token already exists
      const existing = await db
        .select()
        .from(PublicSchema.deviceTokens)
        .where(eq(PublicSchema.deviceTokens.deviceToken, deviceToken))
        .limit(1);

      let result;
      if (existing.length > 0) {
        // Reactivate existing token
        [result] = await db
          .update(PublicSchema.deviceTokens)
          .set({
            userId,
            platform,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(PublicSchema.deviceTokens.deviceToken, deviceToken))
          .returning();
      } else {
        // Insert new token
        [result] = await db
          .insert(PublicSchema.deviceTokens)
          .values({
            userId,
            deviceToken,
            platform,
            isActive: true,
          })
          .returning();
      }

      return {
        id: Number(result.id),
        userId: Number(result.userId),
        deviceToken: result.deviceToken,
        platform: result.platform,
        isActive: result.isActive,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      };
    });
  }

  /**
   * Insert a notification_history record.
   * Returns the new row's id, or null if the insert fails non-fatally.
   */
  async logNotificationHistory(
    userId: number,
    notificationType: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<number | null> {
    return runWithPublicClient(this.options, async (db) => {
      const [result] = await db
        .insert(PublicSchema.notificationHistory)
        .values({
          userId,
          notificationType,
          title,
          body,
          data: data ?? null,
        })
        .returning({ id: PublicSchema.notificationHistory.id });

      return result ? Number(result.id) : null;
    });
  }

  /**
   * Disable a device token
   */
  async disableDeviceToken(userId: number, deviceToken: string): Promise<void> {
    await runWithPublicClient(this.options, async (db) => {
      await db
        .update(PublicSchema.deviceTokens)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(PublicSchema.deviceTokens.userId, userId),
            eq(PublicSchema.deviceTokens.deviceToken, deviceToken),
          ),
        );
    });
  }

  /**
   * Mark a notification as read
   */
  async markNotificationAsRead(
    userId: number,
    notificationId: number,
  ): Promise<void> {
    await runWithPublicClient(this.options, async (db) => {
      await db
        .update(PublicSchema.notificationHistory)
        .set({
          isRead: true,
          readAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(PublicSchema.notificationHistory.userId, userId),
            eq(PublicSchema.notificationHistory.id, notificationId),
          ),
        );
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllNotificationsAsRead(userId: number): Promise<void> {
    await runWithPublicClient(this.options, async (db) => {
      await db
        .update(PublicSchema.notificationHistory)
        .set({
          isRead: true,
          readAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(PublicSchema.notificationHistory.userId, userId),
            eq(PublicSchema.notificationHistory.isRead, false),
          ),
        );
    });
  }
}

/**
 * Factory function to create a notification service
 */
export function createNotificationService(
  options: DbOptions,
): NotificationService {
  return new NotificationService(options);
}
