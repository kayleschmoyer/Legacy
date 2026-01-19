import { and, desc, eq, sql } from 'drizzle-orm';
import { PublicDb } from './PublicDbClient';
import * as Schema from '../../drizzle/public/schema';

/**
 * Notification preference settings for a user
 */
export interface NotificationPreference {
  id: number;
  userId: number;
  matchupStartedEnabled: boolean;
  matchupEndedEnabled: boolean;
  matchupCloseGameEnabled: boolean;
  matchupReminderEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  closeGameThreshold: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating or updating notification preferences
 */
export interface NotificationPreferenceInput {
  matchupStartedEnabled?: boolean;
  matchupEndedEnabled?: boolean;
  matchupCloseGameEnabled?: boolean;
  matchupReminderEnabled?: boolean;
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  closeGameThreshold?: number;
}

/**
 * Device token for push notifications
 */
export interface DeviceToken {
  id: number;
  userId: number;
  deviceToken: string;
  platform: string;
  endpointArn: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for registering a device token
 */
export interface DeviceTokenInput {
  userId: number;
  deviceToken: string;
  platform: 'ios' | 'android' | 'expo';
  endpointArn?: string;
}

/**
 * Notification history record
 */
export interface NotificationHistoryRecord {
  id: number;
  userId: number;
  notificationType: 'matchup_started' | 'matchup_ended' | 'matchup_close_game' | 'matchup_reminder';
  channel: 'in_app' | 'push' | 'email';
  matchupId: number | null;
  leagueId: number | null;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  read: boolean;
  sentAt: string;
  readAt: string | null;
  createdAt: string;
}

/**
 * Input for creating a notification history record
 */
export interface CreateNotificationInput {
  userId: number;
  notificationType: 'matchup_started' | 'matchup_ended' | 'matchup_close_game' | 'matchup_reminder';
  channel: 'in_app' | 'push' | 'email';
  matchupId?: number;
  leagueId?: number;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Get or create notification preferences for a user
 */
export async function getUserNotificationPreferences(
  db: PublicDb,
  userId: number,
): Promise<NotificationPreference> {
  const existing = await db
    .select()
    .from(Schema.notificationPreferences)
    .where(eq(Schema.notificationPreferences.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0] as NotificationPreference;
  }

  // Create default preferences
  const created = await db
    .insert(Schema.notificationPreferences)
    .values({
      userId,
      matchupStartedEnabled: true,
      matchupEndedEnabled: true,
      matchupCloseGameEnabled: true,
      matchupReminderEnabled: true,
      pushEnabled: true,
      emailEnabled: false,
      closeGameThreshold: '5.0',
    })
    .returning();

  return created[0] as NotificationPreference;
}

/**
 * Update notification preferences for a user
 */
export async function updateNotificationPreferences(
  db: PublicDb,
  userId: number,
  input: NotificationPreferenceInput,
): Promise<NotificationPreference> {
  // Ensure preferences exist
  await getUserNotificationPreferences(db, userId);

  const updateData: Record<string, unknown> = {
    ...input,
    updatedAt: sql`now()`,
  };

  if (input.closeGameThreshold !== undefined) {
    updateData.closeGameThreshold = input.closeGameThreshold.toString();
  }

  const updated = await db
    .update(Schema.notificationPreferences)
    .set(updateData)
    .where(eq(Schema.notificationPreferences.userId, userId))
    .returning();

  return updated[0] as NotificationPreference;
}

/**
 * Register or update a device token for push notifications
 */
export async function registerDeviceToken(
  db: PublicDb,
  input: DeviceTokenInput,
): Promise<DeviceToken> {
  // Check if token already exists
  const existing = await db
    .select()
    .from(Schema.deviceTokens)
    .where(eq(Schema.deviceTokens.deviceToken, input.deviceToken))
    .limit(1);

  if (existing.length > 0) {
    // Update existing token
    const updated = await db
      .update(Schema.deviceTokens)
      .set({
        userId: input.userId,
        platform: input.platform,
        endpointArn: input.endpointArn || null,
        enabled: true,
        updatedAt: sql`now()`,
      })
      .where(eq(Schema.deviceTokens.deviceToken, input.deviceToken))
      .returning();

    return updated[0] as DeviceToken;
  }

  // Insert new token
  const created = await db
    .insert(Schema.deviceTokens)
    .values({
      userId: input.userId,
      deviceToken: input.deviceToken,
      platform: input.platform,
      endpointArn: input.endpointArn || null,
      enabled: true,
    })
    .returning();

  return created[0] as DeviceToken;
}

/**
 * Get all active device tokens for a user
 */
export async function getUserDeviceTokens(
  db: PublicDb,
  userId: number,
): Promise<DeviceToken[]> {
  return await db
    .select()
    .from(Schema.deviceTokens)
    .where(
      and(
        eq(Schema.deviceTokens.userId, userId),
        eq(Schema.deviceTokens.enabled, true)
      )
    );
}

/**
 * Disable a device token
 */
export async function disableDeviceToken(
  db: PublicDb,
  deviceToken: string,
): Promise<void> {
  await db
    .update(Schema.deviceTokens)
    .set({
      enabled: false,
      updatedAt: sql`now()`,
    })
    .where(eq(Schema.deviceTokens.deviceToken, deviceToken));
}

/**
 * Create a notification history record
 */
export async function createNotificationHistory(
  db: PublicDb,
  input: CreateNotificationInput,
): Promise<NotificationHistoryRecord> {
  const created = await db
    .insert(Schema.notificationHistory)
    .values({
      userId: input.userId,
      notificationType: input.notificationType,
      channel: input.channel,
      matchupId: input.matchupId || null,
      leagueId: input.leagueId || null,
      title: input.title,
      message: input.message,
      metadata: input.metadata || null,
      read: false,
    })
    .returning();

  return created[0] as NotificationHistoryRecord;
}

/**
 * Get notification history for a user
 */
export async function getUserNotificationHistory(
  db: PublicDb,
  userId: number,
  limit = 50,
): Promise<NotificationHistoryRecord[]> {
  const results = await db
    .select()
    .from(Schema.notificationHistory)
    .where(eq(Schema.notificationHistory.userId, userId))
    .orderBy(desc(Schema.notificationHistory.sentAt))
    .limit(limit);

  return results as NotificationHistoryRecord[];
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadNotificationCount(
  db: PublicDb,
  userId: number,
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(Schema.notificationHistory)
    .where(
      and(
        eq(Schema.notificationHistory.userId, userId),
        eq(Schema.notificationHistory.read, false)
      )
    );

  return result[0]?.count || 0;
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(
  db: PublicDb,
  notificationId: number,
): Promise<void> {
  await db
    .update(Schema.notificationHistory)
    .set({
      read: true,
      readAt: sql`now()`,
    })
    .where(eq(Schema.notificationHistory.id, notificationId));
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(
  db: PublicDb,
  userId: number,
): Promise<void> {
  await db
    .update(Schema.notificationHistory)
    .set({
      read: true,
      readAt: sql`now()`,
    })
    .where(
      and(
        eq(Schema.notificationHistory.userId, userId),
        eq(Schema.notificationHistory.read, false)
      )
    );
}

/**
 * Get notification history for a specific matchup
 */
export async function getMatchupNotificationHistory(
  db: PublicDb,
  matchupId: number,
): Promise<NotificationHistoryRecord[]> {
  const results = await db
    .select()
    .from(Schema.notificationHistory)
    .where(eq(Schema.notificationHistory.matchupId, matchupId))
    .orderBy(desc(Schema.notificationHistory.sentAt));

  return results as NotificationHistoryRecord[];
}

/**
 * Delete old notification history (older than specified days)
 */
export async function deleteOldNotificationHistory(
  db: PublicDb,
  daysToKeep = 90,
): Promise<number> {
  const result = await db
    .delete(Schema.notificationHistory)
    .where(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- SQL template for date comparison requires any type
      sql`${Schema.notificationHistory.sentAt} < now() - interval '${sql.raw(daysToKeep.toString())} days'` as any
    )
    .returning({ id: Schema.notificationHistory.id });

  return result.length;
}
