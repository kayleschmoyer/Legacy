import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { runWithInternalClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { sql } from 'drizzle-orm';

interface CountResult {
  count: number;
}

export const fixUsersTableCommandBuilder = (argv: Argv) =>
  argv.usage('fix-users-table');

export async function fixUsersTable(): Promise<void> {
  LOGGER.info('🔧 Creating missing app_internal.users table');

  const opts = getDbOptions();

  try {
    await runWithInternalClient(opts, async (db) => {
      LOGGER.info('Creating access_level enum type...');
      await db.execute(sql`
        DO $$ BEGIN
          CREATE TYPE "app_internal"."access_level" AS ENUM('none', 'admin');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      LOGGER.info('✅ Enum type created/verified');

      LOGGER.info('Creating users table...');
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "app_internal"."users" (
          "id" serial PRIMARY KEY NOT NULL,
          "username" varchar(50),
          "email" varchar(100) NOT NULL,
          "password_hash" char(128),
          "access_level" "app_internal"."access_level" DEFAULT 'none',
          CONSTRAINT "users_username_uk" UNIQUE("username"),
          CONSTRAINT "users_email_uk" UNIQUE("email")
        );
      `);
      LOGGER.info('✅ Users table created');

      LOGGER.info('Creating indexes...');
      await db.execute(
        sql`CREATE INDEX IF NOT EXISTS "users__index" ON "app_internal"."users" USING btree ("username");`,
      );
      await db.execute(
        sql`CREATE INDEX IF NOT EXISTS "users_email_index" ON "app_internal"."users" USING btree ("email");`,
      );
      LOGGER.info('✅ Indexes created');

      // Verify it exists
      const result = await db.execute(
        sql`SELECT COUNT(*) as count FROM app_internal.users;`,
      );
      const rows = Array.isArray(result) ? result : [result];
      const count =
        rows.length > 0 && rows[0] ? (rows[0] as CountResult).count : 0;
      LOGGER.info(
        `✅ Verification successful - users table exists with ${count} rows`,
      );
    });

    LOGGER.info('🎉 Users table setup completed successfully!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    LOGGER.error(`❌ Failed to create users table: ${errorMessage}`);
    throw error;
  }
}
