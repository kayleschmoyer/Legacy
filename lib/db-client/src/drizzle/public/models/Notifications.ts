import {
  pgTable,
  serial,
  integer,
  boolean,
  timestamp,
  text,
  varchar,
  jsonb,
  index,
  unique,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * User notification preferences
 */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    matchupStartedEnabled: boolean('matchup_started_enabled')
      .notNull()
      .default(true),
    matchupEndedEnabled: boolean('matchup_ended_enabled')
      .notNull()
      .default(true),
    matchupCloseGameEnabled: boolean('matchup_close_game_enabled')
      .notNull()
      .default(true),
    matchupReminderEnabled: boolean('matchup_reminder_enabled')
      .notNull()
      .default(true),
    pushEnabled: boolean('push_enabled').notNull().default(true),
    emailEnabled: boolean('email_enabled').notNull().default(false),
    closeGameThreshold: integer('close_game_threshold').notNull().default(50),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdUnique: unique('notification_preferences_user_id_unique').on(
      table.userId,
    ),
  }),
);

/**
 * Device tokens for push notifications
 */
export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    deviceToken: text('device_token').notNull(),
    platform: varchar('platform', { length: 10 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    deviceTokenUnique: unique('device_tokens_device_token_unique').on(
      table.deviceToken,
    ),
    userIdIdx: index('device_tokens_user_id_idx').on(table.userId),
  }),
);

/**
 * Notification history - record of all sent notifications
 */
export const notificationHistory = pgTable(
  'notification_history',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    notificationType: varchar('notification_type', { length: 50 }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data'),
    isRead: boolean('is_read').notNull().default(false),
    sentAt: timestamp('sent_at').notNull().defaultNow(),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('notification_history_user_id_idx').on(table.userId),
    isReadIdx: index('notification_history_is_read_idx').on(table.isRead),
    sentAtIdx: index('notification_history_sent_at_idx').on(table.sentAt),
  }),
);
