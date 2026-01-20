#!/usr/bin/env tsx
/**
 * Drizzle Migration Wrapper
 *
 * A simple wrapper around Drizzle's migration utilities that:
 * - Loads AWS credentials properly
 * - Uses environment configuration
 * - Runs unified migrations for both schemas (public and app_internal)
 * - Handles cross-schema dependencies in correct order
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { LOGGER } from '@legacy-sports/logging';
import { existsSync } from 'fs';
import { join } from 'path';
import { getDatabaseConfig } from '../config/database';

// Load environment variables from root .env file (already done above)

async function runMigrations() {
  try {
    LOGGER.info('🔧 Legacy Sports Database Migration (Drizzle)');
    LOGGER.info('===========================================');

    LOGGER.info('🔍 Resolving database credentials...');

    // Get database configuration
    const dbConfig = await getDatabaseConfig();

    LOGGER.info(
      `� Connected to database: ${dbConfig.host}:${dbConfig.port || 5432}/${dbConfig.database}`,
    );

    // Create postgres pool
    const pool = new Pool({
      database: dbConfig.database,
      host: dbConfig.host,
      password: dbConfig.password,
      port: 5432,
      user: dbConfig.user,
      ssl: dbConfig.ssl,
      max: 1, // Use single connection for migrations
    });

    // Create Drizzle instance
    const db = drizzle(pool);

    LOGGER.info('🚀 Running unified migrations...');

    // Run all migrations from the unified migrations folder
    const migrationsPath = join(process.cwd(), 'migrations');
    LOGGER.info(`� Migrations path: ${migrationsPath}`);

    if (existsSync(migrationsPath)) {
      LOGGER.info(
        '📋 Applying all migrations (both public and internal schemas)...',
      );
      await migrate(db, { migrationsFolder: migrationsPath });
      LOGGER.info('✅ All migrations applied successfully');
    } else {
      LOGGER.error(`❌ Migrations folder not found: ${migrationsPath}`);
      throw new Error(`Migration folder does not exist: ${migrationsPath}`);
    }

    LOGGER.info('✅ All migrations completed successfully');

    // Close connection
    await pool.end();
  } catch (error: unknown) {
    LOGGER.error('❌ Migration failed:');
    if (error instanceof Error) {
      LOGGER.error(`Error message: ${error.message}`);
      LOGGER.error(`Stack trace: ${error.stack ?? 'No stack trace available'}`);
    } else {
      LOGGER.error('Unknown error type');
      LOGGER.error(JSON.stringify(error, null, 2));
    }
    process.exit(1);
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  void runMigrations();
}

export { runMigrations };
