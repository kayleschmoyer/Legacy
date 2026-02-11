import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Add notifications tables for push notifications and user preferences
 */
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Creating notification_preferences table...');

  await db.execute(`
    CREATE TABLE notification_preferences (
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
    );
    
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_user_id_unique UNIQUE (user_id);
    
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES app_internal.users(id) ON DELETE CASCADE;
  `);

  console.log('🔄 Creating device_tokens table...');

  await db.execute(`
    CREATE TABLE device_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      device_token TEXT NOT NULL,
      platform VARCHAR(10) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    
    ALTER TABLE device_tokens
      ADD CONSTRAINT device_tokens_device_token_unique UNIQUE (device_token);
    
    ALTER TABLE device_tokens
      ADD CONSTRAINT device_tokens_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES app_internal.users(id) ON DELETE CASCADE;
    
    CREATE INDEX device_tokens_user_id_idx ON device_tokens(user_id);
  `);

  console.log('🔄 Creating notification_history table...');

  await db.execute(`
    CREATE TABLE notification_history (
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
    );
    
    ALTER TABLE notification_history
      ADD CONSTRAINT notification_history_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES app_internal.users(id) ON DELETE CASCADE;
    
    CREATE INDEX notification_history_user_id_idx ON notification_history(user_id);
    CREATE INDEX notification_history_is_read_idx ON notification_history(is_read);
    CREATE INDEX notification_history_sent_at_idx ON notification_history(sent_at);
  `);

  console.log('🔄 Creating triggers for updated_at columns...');

  await db.execute(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await db.execute(`
    CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  await db.execute(`
    CREATE TRIGGER update_device_tokens_updated_at
    BEFORE UPDATE ON device_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  await db.execute(`
    CREATE TRIGGER update_notification_history_updated_at
    BEFORE UPDATE ON notification_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
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
