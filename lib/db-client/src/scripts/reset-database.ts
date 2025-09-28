#!/usr/bin/env tsx
/**
 * Database Reset Script
 *
 * Drops all existing tables and schemas to start fresh with Drizzle migrations.
 * This is useful when transitioning from a custom migration system to Drizzle.
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { LOGGER } from '@legacy-sports/logging';
import { resolve } from 'path';
import { getDatabaseConfig } from '../config/database';

// Load .env from the project root (two levels up from this script)
config({ path: resolve(__dirname, '../../../..', '.env') });

async function resetDatabase() {
  try {
    LOGGER.info('🔄 Legacy Sports Database Reset');
    LOGGER.info('==============================');
    LOGGER.warn('⚠️ WARNING: This will DROP ALL tables and data!');

    LOGGER.info('🔍 Resolving database credentials...');

    // Get database configuration
    const dbConfig = await getDatabaseConfig();

    LOGGER.info(
      `📡 Connected to database: ${dbConfig.host}:${dbConfig.port || 5432}/${dbConfig.database}`,
    );

    // Create postgres pool
    const pool = new Pool({
      database: dbConfig.database,
      host: dbConfig.host,
      password: dbConfig.password,
      port: 5432,
      user: dbConfig.user,
      ssl: dbConfig.ssl,
      max: 1, // Use single connection
    });

    // Create Drizzle instance
    const db = drizzle(pool);

    LOGGER.info('🗑️ Dropping all existing tables...');

    // Drop all tables in public schema
    await db.execute(sql`
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO PUBLIC;
    `);

    // Drop app_internal schema if it exists
    await db.execute(sql`
      DROP SCHEMA IF EXISTS app_internal CASCADE;
    `);

    LOGGER.info('✅ Database reset completed successfully');
    LOGGER.info('📋 All tables and schemas have been dropped');
    LOGGER.info('🚀 Ready for fresh migrations');

    // Close connection
    await pool.end();
  } catch (error) {
    LOGGER.error('❌ Database reset failed:');
    if (error instanceof Error) {
      LOGGER.error(`Error message: ${error.message}`);
      LOGGER.error(`Stack trace: ${error.stack}`);
    } else {
      LOGGER.error('Unknown error type:', String(error));
    }
    process.exit(1);
  }
}

// Run reset if this script is executed directly
if (require.main === module) {
  void resetDatabase();
}

export { resetDatabase };
