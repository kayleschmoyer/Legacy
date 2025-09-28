import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import {
  runWithInternalClient,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { sql } from 'drizzle-orm';

interface ExistsResult {
  exists: boolean;
}

interface TableInfo {
  table_name: string;
}

interface MigrationInfo {
  hash: string;
  created_at: Date;
}

export const inspectDatabaseCommandBuilder = (argv: Argv) =>
  argv.usage('inspect-database');

export async function inspectDatabase(): Promise<void> {
  LOGGER.info('🔍 Inspecting Database State');

  const opts = getDbOptions();

  try {
    // Check public schema
    LOGGER.info('📋 Checking Public Schema...');
    await runWithPublicClient(opts, async (db) => {
      // Check if migration tracking table exists
      const migrationTableResult = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '__drizzle_migrations'
        );
      `);

      LOGGER.info(
        `Migration tracking table exists: ${Boolean(migrationTableResult.rows[0]?.exists)}`,
      );

      // List all public tables
      const tablesResult = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `);

      LOGGER.info('Public schema tables:');
      tablesResult.rows.forEach((row) => {
        const tableInfo = row as unknown as TableInfo;
        LOGGER.info(`  - ${tableInfo.table_name}`);
      });

      // If migration table exists, check migration state
      if (migrationTableResult.rows[0]?.exists) {
        const migrationsResult = await db.execute(sql`
          SELECT * FROM public.__drizzle_migrations 
          ORDER BY created_at DESC;
        `);

        LOGGER.info('Applied migrations:');
        migrationsResult.rows.forEach((row: unknown) => {
          const migration = row as MigrationInfo;
          const createdAtStr =
            migration.created_at instanceof Date
              ? migration.created_at.toISOString()
              : String(migration.created_at);
          LOGGER.info(`  - ${migration.hash}: ${createdAtStr}`);
        });
      }
    });

    // Check internal schema
    LOGGER.info('📋 Checking Internal Schema...');
    await runWithInternalClient(opts, async (db) => {
      // List all app_internal tables
      const tablesResult = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'app_internal'
        ORDER BY table_name;
      `);

      LOGGER.info('Internal schema tables:');
      tablesResult.rows.forEach((row: unknown) => {
        const table = row as TableInfo;
        LOGGER.info(`  - ${table.table_name}`);
      });

      // Check migration tracking
      const migrationTableResult = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'app_internal' 
          AND table_name = '__drizzle_migrations'
        );
      `);

      const existsRowUnknown = migrationTableResult.rows[0] as unknown;
      const existsRow = existsRowUnknown as ExistsResult | undefined;
      const exists = existsRow?.exists ?? false;
      LOGGER.info(`Internal migration tracking table exists: ${exists}`);
    });

    LOGGER.info('✅ Database inspection completed');
  } catch (error) {
    LOGGER.error(
      '❌ Database inspection failed:',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
