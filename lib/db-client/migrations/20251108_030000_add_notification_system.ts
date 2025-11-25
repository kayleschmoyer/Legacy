/**
 * Migration: Add notification system
 * Created: 2025-11-08
 * Ticket: LS-25
 *
 * Adds comprehensive notification system:
 * - Notification type and channel enums
 * - User notification preferences table
 * - Device tokens table for push notifications (SNS)
 * - Notification history table
 * - Foreign key constraints and indexes
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Create notification type enum
  await db.execute(`
    CREATE TYPE notification_type AS ENUM (
      'matchup_started',
      'matchup_ended',
      'matchup_close_game',
      'matchup_reminder'
    );
  `);

  // Create notification channel enum
  await db.execute(`
    CREATE TYPE notification_channel AS ENUM (
      'in_app',
      'push',
      'email'
    );
  `);

  // Create notification preferences table
  await db.execute(`
    CREATE TABLE notification_preferences (
      id serial PRIMARY KEY NOT NULL,
      user_id integer NOT NULL,
      matchup_started_enabled boolean DEFAULT true NOT NULL,
      matchup_ended_enabled boolean DEFAULT true NOT NULL,
      matchup_close_game_enabled boolean DEFAULT true NOT NULL,
      matchup_reminder_enabled boolean DEFAULT true NOT NULL,
      push_enabled boolean DEFAULT true NOT NULL,
      email_enabled boolean DEFAULT false NOT NULL,
      close_game_threshold numeric(10, 2) DEFAULT 5.0,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL,
      CONSTRAINT notification_preferences_user_uk UNIQUE(user_id)
    );
  `);

  // Create device tokens table for push notifications
  await db.execute(`
    CREATE TABLE device_tokens (
      id serial PRIMARY KEY NOT NULL,
      user_id integer NOT NULL,
      device_token text NOT NULL,
      platform varchar(20) NOT NULL,
      endpoint_arn text,
      enabled boolean DEFAULT true NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL,
      CONSTRAINT device_tokens_token_uk UNIQUE(device_token)
    );
  `);

  // Create notification history table
  await db.execute(`
    CREATE TABLE notification_history (
      id serial PRIMARY KEY NOT NULL,
      user_id integer NOT NULL,
      notification_type notification_type NOT NULL,
      channel notification_channel NOT NULL,
      matchup_id integer,
      league_id integer,
      title varchar(255) NOT NULL,
      message text NOT NULL,
      metadata jsonb,
      read boolean DEFAULT false NOT NULL,
      sent_at timestamp DEFAULT now() NOT NULL,
      read_at timestamp,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);

  // Add foreign key constraints
  await db.execute(`
    ALTER TABLE notification_preferences 
      ADD CONSTRAINT notification_preferences_user_fk 
        FOREIGN KEY (user_id) 
        REFERENCES app_internal.users(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE device_tokens 
      ADD CONSTRAINT device_tokens_user_fk 
        FOREIGN KEY (user_id) 
        REFERENCES app_internal.users(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE notification_history 
      ADD CONSTRAINT notification_history_user_fk 
        FOREIGN KEY (user_id) 
        REFERENCES app_internal.users(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE notification_history 
      ADD CONSTRAINT notification_history_matchup_fk 
        FOREIGN KEY (matchup_id) 
        REFERENCES matchups(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE;
  `);

  await db.execute(`
    ALTER TABLE notification_history 
      ADD CONSTRAINT notification_history_league_fk 
        FOREIGN KEY (league_id) 
        REFERENCES leagues(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE;
  `);

  // Create indexes for better query performance
  await db.execute(
    `CREATE INDEX notification_history_user_idx ON notification_history(user_id);`,
  );
  await db.execute(
    `CREATE INDEX notification_history_matchup_idx ON notification_history(matchup_id);`,
  );
  await db.execute(
    `CREATE INDEX notification_history_league_idx ON notification_history(league_id);`,
  );
  await db.execute(
    `CREATE INDEX notification_history_read_idx ON notification_history(read);`,
  );
  await db.execute(
    `CREATE INDEX notification_history_sent_at_idx ON notification_history(sent_at DESC);`,
  );
  await db.execute(
    `CREATE INDEX device_tokens_user_idx ON device_tokens(user_id);`,
  );
  await db.execute(
    `CREATE INDEX device_tokens_enabled_idx ON device_tokens(enabled);`,
  );

  // Add comments for documentation
  await db.execute(`
    COMMENT ON TABLE notification_preferences IS 'User notification preferences and settings';
    COMMENT ON TABLE device_tokens IS 'Mobile device tokens for push notifications via SNS';
    COMMENT ON TABLE notification_history IS 'History of all notifications sent to users';
    COMMENT ON COLUMN notification_preferences.close_game_threshold IS 'Score difference threshold for close game notifications';
    COMMENT ON COLUMN device_tokens.endpoint_arn IS 'AWS SNS platform endpoint ARN for push notifications';
    COMMENT ON COLUMN device_tokens.platform IS 'Device platform (ios, android, expo)';
    COMMENT ON COLUMN notification_history.metadata IS 'Additional notification metadata in JSON format';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Drop indexes
  await db.execute(`DROP INDEX IF EXISTS device_tokens_enabled_idx;`);
  await db.execute(`DROP INDEX IF EXISTS device_tokens_user_idx;`);
  await db.execute(`DROP INDEX IF EXISTS notification_history_sent_at_idx;`);
  await db.execute(`DROP INDEX IF EXISTS notification_history_read_idx;`);
  await db.execute(`DROP INDEX IF EXISTS notification_history_league_idx;`);
  await db.execute(`DROP INDEX IF EXISTS notification_history_matchup_idx;`);
  await db.execute(`DROP INDEX IF EXISTS notification_history_user_idx;`);

  // Drop tables (which will cascade drop constraints)
  await db.execute(`DROP TABLE IF EXISTS notification_history;`);
  await db.execute(`DROP TABLE IF EXISTS device_tokens;`);
  await db.execute(`DROP TABLE IF EXISTS notification_preferences;`);

  // Drop enums
  await db.execute(`DROP TYPE IF EXISTS notification_channel;`);
  await db.execute(`DROP TYPE IF EXISTS notification_type;`);
};
