import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Add the user_preferences table for server-side display preferences
 * (LS-7138 / PST-090). Persists the stats-format preference per user so it
 * survives clearing site data and syncs across devices, instead of living
 * only in the browser's localStorage blob.
 */
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Creating user_preferences table...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      stats_format VARCHAR(20) NOT NULL DEFAULT 'standard',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    ALTER TABLE user_preferences
      DROP CONSTRAINT IF EXISTS user_preferences_user_id_unique
  `);
  await db.execute(`
    ALTER TABLE user_preferences
      ADD CONSTRAINT user_preferences_user_id_unique UNIQUE (user_id)
  `);

  await db.execute(`
    ALTER TABLE user_preferences
      DROP CONSTRAINT IF EXISTS user_preferences_user_id_fkey
  `);
  await db.execute(`
    ALTER TABLE user_preferences
      ADD CONSTRAINT user_preferences_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES app_internal.users(id) ON DELETE CASCADE
  `);

  // Reuse the shared updated_at trigger function (created by the notifications
  // migration); recreate defensively so this migration is self-contained.
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
    DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences
  `);
  await db.execute(`
    CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  console.log('✅ Successfully created user_preferences table');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Dropping user_preferences table...');

  await db.execute(`
    DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
    DROP TABLE IF EXISTS user_preferences;
  `);

  console.log('✅ Successfully dropped user_preferences table');
};
