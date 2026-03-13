#!/usr/bin/env tsx

/**
 * Database Schema Verification
 *
 * This script checks the current database schema to verify column existence
 */

import { config } from 'dotenv';
import { Pool } from 'pg';
import { resolve } from 'path';
import {
  extractSingleTypedResult,
  extractTypedResults,
  isDatabaseIntrospectionResult,
  isEnumValueResult,
  MigrationHistoryResult,
} from '../types/RawSqlTypes';

// Interface for column details
interface ColumnDetailsResult {
  column_name: string;
  data_type: string;
  column_default: string | null;
  is_nullable: string;
}

// Type guard for ColumnDetailsResult
function isColumnDetailsResult(obj: unknown): obj is ColumnDetailsResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'column_name' in obj &&
    'data_type' in obj &&
    'column_default' in obj &&
    'is_nullable' in obj &&
    typeof (obj as ColumnDetailsResult).column_name === 'string' &&
    typeof (obj as ColumnDetailsResult).data_type === 'string' &&
    (typeof (obj as ColumnDetailsResult).column_default === 'string' ||
      (obj as ColumnDetailsResult).column_default === null) &&
    typeof (obj as ColumnDetailsResult).is_nullable === 'string'
  );
}

// Type guard for MigrationHistoryResult
function isMigrationHistoryResult(obj: unknown): obj is MigrationHistoryResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'hash' in obj &&
    'created_at' in obj &&
    typeof (obj as MigrationHistoryResult).hash === 'string' &&
    (obj as MigrationHistoryResult).created_at instanceof Date
  );
}

// Load .env from the project root
config({ path: resolve(__dirname, '../../../../.env') });

async function verifyDraftStatusColumn() {
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
    console.log('🔍 Checking for draft_status enum...');

    // Check if draft_status enum exists
    const enumResult = await pool.query(`
      SELECT EXISTS (
        SELECT 1 
        FROM pg_type 
        WHERE typname = 'draft_status'
      ) as enum_exists;
    `);

    const enumExists = extractSingleTypedResult(
      enumResult,
      isDatabaseIntrospectionResult,
    );

    console.log(
      `Draft status enum exists: ${enumExists ? enumExists.enum_exists : false}`,
    );

    if (enumExists && enumExists.enum_exists) {
      // Get enum values
      const enumValues = await pool.query(`
        SELECT enumlabel 
        FROM pg_enum 
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'draft_status'
        ORDER BY enumsortorder;
      `);

      const enumValuesTyped = extractTypedResults(
        enumValues,
        isEnumValueResult,
      );
      console.log(
        'Enum values:',
        enumValuesTyped.map((r) => r.enumlabel),
      );
    }

    console.log('🔍 Checking for draft_status column in leagues table...');

    // Check if draft_status column exists in leagues table
    const columnResult = await pool.query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'leagues' 
        AND column_name = 'draft_status'
      ) as column_exists;
    `);

    const columnExists = extractSingleTypedResult(
      columnResult,
      isDatabaseIntrospectionResult,
    );

    console.log(
      `Draft status column exists: ${columnExists ? columnExists.column_exists : false}`,
    );

    if (columnExists && columnExists.column_exists) {
      // Get column details
      const columnDetails = await pool.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'leagues' 
        AND column_name = 'draft_status';
      `);

      const columnDetail = extractSingleTypedResult(
        columnDetails,
        isColumnDetailsResult,
      );
      console.log('Column details:', columnDetail);
    }

    // Check migration history
    console.log('🔍 Checking migration history...');
    const migrationResult = await pool.query(`
      SELECT * FROM drizzle.__drizzle_migrations 
      ORDER BY created_at;
    `);

    const migrations = extractTypedResults(
      migrationResult,
      isMigrationHistoryResult,
    );

    console.log('Applied migrations:');
    migrations.forEach((row) => {
      console.log(`- ${row.hash} (${row.created_at.toISOString()})`);
    });
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  void verifyDraftStatusColumn();
}
