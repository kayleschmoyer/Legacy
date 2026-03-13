#!/usr/bin/env tsx

/**
 * Manual Migration Runner
 *
 * This script manually runs a specific migration SQL
 */

import { config } from 'dotenv';
import { Pool } from 'pg';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import {
  extractSingleTypedResult,
  isDatabaseIntrospectionResult,
} from '../types/RawSqlTypes';

// Load .env from the project root
config({ path: resolve(__dirname, '../../../../.env') });

async function runMigration0006() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'postgres',
    ssl:
      process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_SELF_SIGNED !== 'true' }
        : false,
  });

  try {
    console.log('🔧 Manually running migration 0006...');

    // Read the migration file
    const migrationPath = resolve(
      __dirname,
      '../../migrations/0006_oval_mac_gargan.sql',
    );
    const migrationSql = readFileSync(migrationPath, 'utf-8');

    console.log('Migration SQL:');
    console.log(migrationSql);
    console.log('');

    console.log('🚀 Executing migration...');

    // Execute the migration
    const result = await pool.query(migrationSql);
    console.log('✅ Migration executed successfully');
    console.log('Result:', result);

    // Verify the changes
    console.log('🔍 Verifying enum was created...');
    const enumCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 
        FROM pg_type 
        WHERE typname = 'draft_status'
      ) as enum_exists;
    `);
    const enumExists = extractSingleTypedResult(
      enumCheck,
      isDatabaseIntrospectionResult,
    );
    console.log(`Enum exists: ${enumExists ? enumExists.enum_exists : false}`);

    console.log('🔍 Verifying column was added...');
    const columnCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'leagues' 
        AND column_name = 'draft_status'
      ) as column_exists;
    `);
    const columnExists = extractSingleTypedResult(
      columnCheck,
      isDatabaseIntrospectionResult,
    );
    console.log(
      `Column exists: ${columnExists ? columnExists.column_exists : false}`,
    );
  } catch (error) {
    console.error('❌ Error running migration:', error);
  } finally {
    await pool.end();
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  void runMigration0006();
}
