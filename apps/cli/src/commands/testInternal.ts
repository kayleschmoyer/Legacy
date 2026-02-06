import { LOGGER } from '@legacy-sports/logging';
import { runWithInternalClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { sql } from 'drizzle-orm';

export async function testInternal(): Promise<void> {
  LOGGER.info('🧪 Testing internal schema state after nuclear reset');

  const opts = getDbOptions();

  try {
    await runWithInternalClient(opts, async (db) => {
      LOGGER.info('Checking app_internal.users table...');
      try {
        const result = await db.execute(
          sql`SELECT COUNT(*) as count FROM app_internal.users`,
        );
        const rows = Array.isArray(result) ? result : [result];
        const firstRow =
          rows.length > 0 && rows[0] ? (rows[0] as unknown) : null;
        const countRow = firstRow as { count?: number } | null;
        const count = countRow?.count ?? 0;
        LOGGER.info(`✅ Users table exists and has ${count} rows`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        LOGGER.error(`❌ Users table does NOT exist: ${errorMessage}`);
      }

      LOGGER.info('Checking internal migration tracking...');
      try {
        const migrations = await db.execute(
          sql`SELECT hash, created_at FROM app_internal.__drizzle_migrations ORDER BY created_at`,
        );
        const migrationRows = Array.isArray(migrations)
          ? migrations
          : [migrations];
        LOGGER.info(
          `✅ Internal migration tracking table exists with ${migrationRows.length} entries`,
        );
        interface MigrationRow {
          hash?: string;
          created_at?: string | number | Date;
        }

        for (const migrationUnknown of migrationRows) {
          const migration = migrationUnknown as MigrationRow;
          if (migration && migration.hash) {
            const createdAtDate = new Date(Number(migration.created_at));
            const createdAtStr = createdAtDate.toISOString();
            LOGGER.info(`  - ${migration.hash} at ${createdAtStr}`);
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        LOGGER.error(
          `❌ Internal migration tracking table does NOT exist: ${errorMessage}`,
        );
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    LOGGER.error(`❌ Connection error: ${errorMessage}`);
  }
}
