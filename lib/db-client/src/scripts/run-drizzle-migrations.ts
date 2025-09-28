#!/usr/bin/env tsx
/**
 * Drizzle Migration Wrapper
 *
 * A simple wrapper around Drizzle's migration utilities that:
 * - Loads AWS credentials properly
 * - Uses environment configuration
 * - Runs internal schema migrations BEFORE public schema migrations
 * - Supports both schemas (public and app_internal)
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { LOGGER } from '@legacy-sports/logging';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { getDatabaseConfig } from '../config/database';

// Load .env from the project root (two levels up from this script)
config({ path: resolve(__dirname, '../../../..', '.env') });

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

    LOGGER.info('🚀 Running migrations in order...');

    // 1. Run internal schema migrations first (authentication, permissions)
    const internalMigrationsPath = join(
      process.cwd(),
      'migrations',
      'internal',
    );
    if (existsSync(internalMigrationsPath)) {
      LOGGER.info('📋 Running internal schema migrations (app_internal)...');
      await migrate(db, { migrationsFolder: internalMigrationsPath });
      LOGGER.info('✅ Internal schema migrations completed');
    } else {
      LOGGER.info('ℹ️ No internal schema migrations found');
    }

    // 2. Run public schema migrations second (depends on internal schema)
    const publicMigrationsPath = join(process.cwd(), 'migrations', 'public');
    if (existsSync(publicMigrationsPath)) {
      LOGGER.info('📋 Running public schema migrations...');
      await migrate(db, { migrationsFolder: publicMigrationsPath });
      LOGGER.info('✅ Public schema migrations completed');
    } else {
      LOGGER.info('ℹ️ No public schema migrations found');
    }

    // 3. If no separate folders exist, run all migrations from main folder
    const mainMigrationsPath = join(process.cwd(), 'migrations');
    if (
      !existsSync(internalMigrationsPath) &&
      !existsSync(publicMigrationsPath) &&
      existsSync(mainMigrationsPath)
    ) {
      LOGGER.info('📋 Running all migrations from main folder...');
      await migrate(db, { migrationsFolder: mainMigrationsPath });
    }

    LOGGER.info('✅ All migrations completed successfully');

    // Close connection
    await pool.end();
  } catch (error) {
    LOGGER.error('❌ Migration failed:');
    if (error instanceof Error) {
      LOGGER.error(`Error message: ${error.message}`);
      LOGGER.error(`Stack trace: ${error.stack}`);
    } else {
      LOGGER.error('Unknown error type:', String(error));
    }
    process.exit(1);
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  void runMigrations();
}

export { runMigrations };
