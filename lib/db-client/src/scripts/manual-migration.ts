#!/usr/bin/env tsx

/**
 * Manual Migration Runner
 * 
 * This script manually runs a specific migration SQL
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { Pool } from 'pg';
import { readFileSync } from 'fs';

// Load .env from the project root
config({ path: resolve(__dirname, '../../../../.env') });

async function runMigration0006() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔧 Manually running migration 0006...');
    
    // Read the migration file
    const migrationPath = resolve(__dirname, '../../migrations/0006_oval_mac_gargan.sql');
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
    console.log(`Enum exists: ${enumCheck.rows[0].enum_exists}`);
    
    console.log('🔍 Verifying column was added...');
    const columnCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'leagues' 
        AND column_name = 'draft_status'
      ) as column_exists;
    `);
    console.log(`Column exists: ${columnCheck.rows[0].column_exists}`);
    
  } catch (error) {
    console.error('❌ Error running migration:', error);
  } finally {
    await pool.end();
  }
}

runMigration0006();
