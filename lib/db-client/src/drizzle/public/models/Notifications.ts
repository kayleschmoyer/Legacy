import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { matchups } from './Matchups';
import { leagues } from './Leagues';
import { usersInAppInternal } from '../../internal/schema';

// Enums
export const notificationType = pgEnum('notification_type', [
  'matchup_started',
  'matchup_ended',
  'matchup_close_game',
  'matchup_reminder',
]);

export const notificationChannel = pgEnum('notification_channel', [
  'in_app',
  'push',
  'email',
]);

// Notification Preferences Table
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id').notNull(),
    matchupStartedEnabled: boolean('matchup_started_enabled')
      .default(true)
      .notNull(),
    matchupEndedEnabled: boolean('matchup_ended_enabled')
      .default(true)
      .notNull(),
    matchupCloseGameEnabled: boolean('matchup_close_game_enabled')
      .default(true)
      .notNull(),
    matchupReminderEnabled: boolean('matchup_reminder_enabled')
      .default(true)
      .notNull(),
    pushEnabled: boolean('push_enabled').default(true).notNull(),
    emailEnabled: boolean('email_enabled').default(false).notNull(),
    closeGameThreshold: numeric('close_game_threshold', {
      precision: 10,
      scale: 2,
    }).default('5.0'),
    createdAt: timestamp('created_at', { mode: 'string' })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => {
    return {
      notificationPreferencesUserUk: unique(
        'notification_preferences_user_uk',
      ).on(table.userId),
      notificationPreferencesUserFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [usersInAppInternal.id],
        name: 'notification_preferences_user_fk',
      })
        .onDelete('cascade')
        .onUpdate('cascade'),
    };
  },
);

// Device Tokens Table
export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id').notNull(),
    deviceToken: text('device_token').notNull(),
    platform: varchar('platform', { length: 20 }).notNull(),
    endpointArn: text('endpoint_arn'),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => {
    return {
      deviceTokensTokenUk: unique('device_tokens_token_uk').on(
        table.deviceToken,
      ),
      deviceTokensUserIdx: index('device_tokens_user_idx').on(table.userId),
      deviceTokensEnabledIdx: index('device_tokens_enabled_idx').on(
        table.enabled,
      ),
      deviceTokensUserFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [usersInAppInternal.id],
        name: 'device_tokens_user_fk',
      })
        .onDelete('cascade')
        .onUpdate('cascade'),
    };
  },
);

// Notification History Table
export const notificationHistory = pgTable(
  'notification_history',
  {
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id').notNull(),
    notificationType: notificationType('notification_type').notNull(),
    channel: notificationChannel('channel').notNull(),
    matchupId: integer('matchup_id'),
    leagueId: integer('league_id'),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    metadata: jsonb('metadata'),
    read: boolean('read').default(false).notNull(),
    sentAt: timestamp('sent_at', { mode: 'string' })
      .default(sql`now()`)
      .notNull(),
    readAt: timestamp('read_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => {
    return {
      notificationHistoryUserIdx: index('notification_history_user_idx').on(
        table.userId,
      ),
      notificationHistoryMatchupIdx: index(
        'notification_history_matchup_idx',
      ).on(table.matchupId),
      notificationHistoryLeagueIdx: index('notification_history_league_idx').on(
        table.leagueId,
      ),
      notificationHistoryReadIdx: index('notification_history_read_idx').on(
        table.read,
      ),
      notificationHistorySentAtIdx: index(
        'notification_history_sent_at_idx',
      ).on(table.sentAt),
      notificationHistoryUserFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [usersInAppInternal.id],
        name: 'notification_history_user_fk',
      })
        .onDelete('cascade')
        .onUpdate('cascade'),
      notificationHistoryMatchupFk: foreignKey({
        columns: [table.matchupId],
        foreignColumns: [matchups.id],
        name: 'notification_history_matchup_fk',
      })
        .onDelete('set null')
        .onUpdate('cascade'),
      notificationHistoryLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'notification_history_league_fk',
      })
        .onDelete('set null')
        .onUpdate('cascade'),
    };
  },
);
