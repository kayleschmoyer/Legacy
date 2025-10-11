#!/usr/bin/env tsx

/**
 * Database Schema Verification
 * 
 * This script checks the current database schema to verify column existence
 */

import { config } from 'dotenv';
import { Pool } from 'pg';
import { resolve } from 'path';

// Load .env from the project root
config({ path: resolve(__dirname, '../../../../.env') });

async function verifyDraftStatusColumn() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
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
    
    console.log(`Draft status enum exists: ${(enumResult.rows[0] as any).enum_exists}`);
    
    if ((enumResult.rows[0] as any).enum_exists) {
      // Get enum values
      const enumValues = await pool.query(`
        SELECT enumlabel 
        FROM pg_enum 
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'draft_status'
        ORDER BY enumsortorder;
      `);
      
      console.log('Enum values:', enumValues.rows.map((r: any) => r.enumlabel));
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
    
    console.log(`Draft status column exists: ${(columnResult.rows[0] as any).column_exists}`);
    
    if ((columnResult.rows[0] as any).column_exists) {
      // Get column details
      const columnDetails = await pool.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'leagues' 
        AND column_name = 'draft_status';
      `);
      
      console.log('Column details:', columnDetails.rows[0]);
    }
    
    // Check migration history
    console.log('🔍 Checking migration history...');
    const migrationResult = await pool.query(`
      SELECT * FROM drizzle.__drizzle_migrations 
      ORDER BY created_at;
    `);
    
    console.log('Applied migrations:');
    migrationResult.rows.forEach((row: any) => {
      console.log(`- ${row.hash} (${new Date(row.created_at).toISOString()})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

void verifyDraftStatusColumn();
