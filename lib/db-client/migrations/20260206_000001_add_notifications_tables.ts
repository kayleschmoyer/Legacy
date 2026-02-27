import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Add notifications tables for push notifications and user preferences
 */
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Creating notification_preferences table...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      matchup_started_enabled BOOLEAN NOT NULL DEFAULT true,
      matchup_ended_enabled BOOLEAN NOT NULL DEFAULT true,
      matchup_close_game_enabled BOOLEAN NOT NULL DEFAULT true,
      matchup_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
      push_enabled BOOLEAN NOT NULL DEFAULT true,
      email_enabled BOOLEAN NOT NULL DEFAULT false,
      close_game_threshold INTEGER NOT NULL DEFAULT 50,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    ALTER TABLE notification_preferences
      DROP CONSTRAINT IF EXISTS notification_preferences_user_id_unique
  `);
  await db.execute(`
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_user_id_unique UNIQUE (user_id)
  `);

  await db.execute(`
    ALTER TABLE notification_preferences
      DROP CONSTRAINT IF EXISTS notification_preferences_user_id_fkey
  `);
  await db.execute(`
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES app_internal.users(id) ON DELETE CASCADE
  `);

  console.log('🔄 Creating device_tokens table...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS device_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      device_token TEXT NOT NULL,
      platform VARCHAR(10) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    ALTER TABLE device_tokens
      DROP CONSTRAINT IF EXISTS device_tokens_device_token_unique
  `);
  await db.execute(`
    ALTER TABLE device_tokens
      ADD CONSTRAINT device_tokens_device_token_unique UNIQUE (device_token)
  `);

  await db.execute(`
    ALTER TABLE device_tokens
      DROP CONSTRAINT IF EXISTS device_tokens_user_id_fkey
  `);
  await db.execute(`
    ALTER TABLE device_tokens
      ADD CONSTRAINT device_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES app_internal.users(id) ON DELETE CASCADE
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS device_tokens_user_id_idx ON device_tokens(user_id)
  `);

  // Older installs have an 'enabled' column; the canonical Drizzle schema uses 'is_active'.
  // Rename if necessary so downstream indexes and ORM queries work correctly.
  try {
    await db.execute(
      `ALTER TABLE device_tokens RENAME COLUMN "enabled" TO is_active`,
    );
    console.log('🔄 Renamed device_tokens.enabled → is_active');
  } catch {
    // Already renamed or column doesn't exist — continue
  }

  console.log('🔄 Creating notification_history table...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS notification_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      notification_type VARCHAR(50) NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data JSONB,
      is_read BOOLEAN NOT NULL DEFAULT false,
      sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    ALTER TABLE notification_history
      DROP CONSTRAINT IF EXISTS notification_history_user_id_fkey
  `);
  await db.execute(`
    ALTER TABLE notification_history
      ADD CONSTRAINT notification_history_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES app_internal.users(id) ON DELETE CASCADE
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS notification_history_user_id_idx ON notification_history(user_id)
  `);

  // Older installs have a 'read' column; the canonical Drizzle schema uses 'is_read'.
  // Rename if necessary so the index and ORM queries work correctly.
  try {
    await db.execute(
      `ALTER TABLE notification_history RENAME COLUMN "read" TO is_read`,
    );
    console.log('🔄 Renamed notification_history.read → is_read');
  } catch {
    // Already renamed or column doesn't exist — continue
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS notification_history_is_read_idx ON notification_history(is_read)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS notification_history_sent_at_idx ON notification_history(sent_at)
  `);

  console.log('🔄 Creating triggers for updated_at columns...');

  await db.execute(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS '
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    ' LANGUAGE plpgsql
  `);

  await db.execute(`
    DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences
  `);
  await db.execute(`
    CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await db.execute(`
    DROP TRIGGER IF EXISTS update_device_tokens_updated_at ON device_tokens
  `);
  await db.execute(`
    CREATE TRIGGER update_device_tokens_updated_at
    BEFORE UPDATE ON device_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  await db.execute(`
    DROP TRIGGER IF EXISTS update_notification_history_updated_at ON notification_history
  `);
  await db.execute(`
    CREATE TRIGGER update_notification_history_updated_at
    BEFORE UPDATE ON notification_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  console.log('✅ Successfully created notifications tables');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Dropping notifications tables...');

  await db.execute(`
    DROP TRIGGER IF EXISTS update_notification_history_updated_at ON notification_history;
    DROP TRIGGER IF EXISTS update_device_tokens_updated_at ON device_tokens;
    DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
    DROP TABLE IF EXISTS notification_history;
    DROP TABLE IF EXISTS device_tokens;
    DROP TABLE IF EXISTS notification_preferences;
  `);

  console.log('✅ Successfully dropped notifications tables');
};
