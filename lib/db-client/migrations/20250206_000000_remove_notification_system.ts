/**
 * Migration: Remove notification system
 * Created: 2025-02-06
 *
 * Removes the SNS-based push notification system that was never activated:
 * - notification_history table
 * - notification_preferences table
 * - Related indexes and foreign key constraints
 *
 * This system has been replaced with WebSocket-based real-time notifications.
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Drop indexes first
  await db.execute(`DROP INDEX IF EXISTS notification_history_sent_at_idx;`);
  await db.execute(`DROP INDEX IF EXISTS notification_history_read_idx;`);
  await db.execute(`DROP INDEX IF EXISTS notification_history_league_idx;`);
  await db.execute(`DROP INDEX IF EXISTS notification_history_matchup_idx;`);
  await db.execute(`DROP INDEX IF EXISTS notification_history_user_idx;`);

  // Drop tables (foreign key constraints will be dropped automatically)
  await db.execute(`DROP TABLE IF EXISTS notification_history;`);
  await db.execute(`DROP TABLE IF EXISTS notification_preferences;`);
  await db.execute(`DROP TABLE IF EXISTS device_tokens;`);

  // Drop enums
  await db.execute(`DROP TYPE IF EXISTS notification_channel;`);
  await db.execute(`DROP TYPE IF EXISTS notification_type;`);
};

/**
 * Rollback: recreate the notification tables
 * This recreates the tables as they were defined in 20251108_030000_add_notification_system.ts
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Recreate notification type enum
  await db.execute(`
    CREATE TYPE notification_type AS ENUM (
      'matchup_started',
      'matchup_ended',
      'matchup_close_game',
      'matchup_reminder'
    );
  `);

  // Recreate notification channel enum
  await db.execute(`
    CREATE TYPE notification_channel AS ENUM (
      'push',
      'email',
      'in_app'
    );
  `);

  // Recreate notification_preferences table
  await db.execute(`
    CREATE TABLE notification_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      matchup_started_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      matchup_ended_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      close_game_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      close_game_threshold INTEGER NOT NULL DEFAULT 10,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT notification_preferences_user_uk UNIQUE (user_id)
    );
  `);

  // Recreate device_tokens table
  await db.execute(`
    CREATE TABLE device_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_token TEXT NOT NULL,
      platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
      endpoint_arn TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT device_tokens_token_uk UNIQUE (device_token)
    );
  `);

  // Recreate notification_history table
  await db.execute(`
    CREATE TABLE notification_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notification_type notification_type NOT NULL,
      channel notification_channel NOT NULL,
      matchup_id INTEGER REFERENCES matchups(id) ON DELETE SET NULL,
      league_id INTEGER REFERENCES leagues(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      metadata JSONB,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
      read_at TIMESTAMP
    );
  `);

  // Recreate indexes
  await db.execute(`
    CREATE INDEX notification_history_user_idx ON notification_history(user_id);
  `);
  await db.execute(`
    CREATE INDEX notification_history_matchup_idx ON notification_history(matchup_id);
  `);
  await db.execute(`
    CREATE INDEX notification_history_league_idx ON notification_history(league_id);
  `);
  await db.execute(`
    CREATE INDEX notification_history_read_idx ON notification_history(read);
  `);
  await db.execute(`
    CREATE INDEX notification_history_sent_at_idx ON notification_history(sent_at DESC);
  `);
  await db.execute(`
    CREATE INDEX device_tokens_user_idx ON device_tokens(user_id);
  `);
};
