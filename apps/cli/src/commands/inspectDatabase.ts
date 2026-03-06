import { LOGGER } from '@legacy-sports/logging';
import {
  runWithInternalClient,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
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

export async function inspectDatabase(): Promise<void> {
  LOGGER.info('🔍 Inspecting Database State');

  const opts = getDbOptions();

  try {
    // Check public schema
    LOGGER.info('📋 Checking Public Schema...');
    await runWithPublicClient(opts, async (db) => {
      // Check if migration tracking tables exist in various schemas
      const publicMigrationResult = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '__drizzle_migrations'
        );
      `);

      const drizzleSchemaMigrationResult = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'drizzle' 
          AND table_name = '__drizzle_migrations'
        );
      `);

      LOGGER.info(
        `Public migration tracking table exists: ${Boolean(publicMigrationResult.rows[0]?.exists)}`,
      );
      LOGGER.info(
        `Drizzle schema migration tracking table exists: ${Boolean(drizzleSchemaMigrationResult.rows[0]?.exists)}`,
      );

      // List all public tables
      const tablesResult = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `);

      // List all public views
      const viewsResult = await db.execute(sql`
        SELECT table_name as view_name
        FROM information_schema.views 
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `);

      LOGGER.info('Public schema tables:');
      tablesResult.rows.forEach((row) => {
        const tableInfo = row as unknown as TableInfo;
        LOGGER.info(`  - ${tableInfo.table_name}`);
      });

      LOGGER.info('Public schema views:');
      viewsResult.rows.forEach((row) => {
        const viewInfo = row as unknown as { view_name: string };
        LOGGER.info(`  - ${viewInfo.view_name}`);
      });

      // Check if the is_major_league function exists
      const functionResult = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.routines 
          WHERE routine_schema = 'public' 
          AND routine_name = 'is_major_league'
        );
      `);

      LOGGER.info(
        `is_major_league function exists: ${Boolean(functionResult.rows[0]?.exists)}`,
      );

      // Check migration state in whichever schema has the tracking table
      if (publicMigrationResult.rows[0]?.exists) {
        const migrationsResult = await db.execute(sql`
          SELECT * FROM public.__drizzle_migrations 
          ORDER BY created_at DESC;
        `);

        LOGGER.info('Applied migrations (public schema):');
        migrationsResult.rows.forEach((row: unknown) => {
          const migration = row as MigrationInfo;
          const createdAtStr =
            migration.created_at instanceof Date
              ? migration.created_at.toISOString()
              : String(migration.created_at);
          LOGGER.info(`  - ${migration.hash}: ${createdAtStr}`);
        });
      }

      if (drizzleSchemaMigrationResult.rows[0]?.exists) {
        const drizzleMigrationsResult = await db.execute(sql`
          SELECT * FROM drizzle.__drizzle_migrations 
          ORDER BY created_at DESC;
        `);

        LOGGER.info('Applied migrations (drizzle schema):');
        drizzleMigrationsResult.rows.forEach((row: unknown) => {
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
