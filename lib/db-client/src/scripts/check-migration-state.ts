#!/usr/bin/env tsx
/**
 * Check Migration State Table
 *
 * This script queries the migration_state table to see what migrations are actually applied.
 */

// Load environment variables from workspace root
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';

import { getDbOptions } from '@legacy-sports/utils';

import { resolve } from 'path';
import { runWithPublicClient } from '../lib/client/Helpers';

config({ path: resolve(__dirname, '../../../../.env') });

// Interface for migration state row
interface MigrationStateRow {
  id: number;
  schema: string;
  name: string;
  applied_at: Date;
  checksum: string;
}

// Interface for summary count
interface MigrationSummary {
  [schema: string]: number;
}

// Type guard to safely check if a row matches the expected structure
function isMigrationStateRow(row: unknown): row is MigrationStateRow {
  return (
    typeof row === 'object' &&
    row !== null &&
    'id' in row &&
    'schema' in row &&
    'name' in row &&
    'applied_at' in row &&
    'checksum' in row
  );
}

async function main() {
  console.log('🔍 Checking migration_state table...\n');

  const dbOptions = getDbOptions();

  await runWithPublicClient(dbOptions, async (db) => {
    // Get all migrations from the tracking table
    const result = await db.execute(sql`
      SELECT id, schema, name, applied_at, checksum 
      FROM migration_state 
      ORDER BY schema, id
    `);

    console.log('📊 Applied Migrations in Database:');
    console.log(
      'ID | Schema   | Name                              | Applied At',
    );
    console.log(
      '---|----------|-----------------------------------|---------------------------',
    );

    if (result.rows.length === 0) {
      console.log(
        '   | (no migrations applied yet)       |                   |',
      );
    } else {
      result.rows.forEach((row) => {
        // Safely type the row with proper validation
        if (isMigrationStateRow(row)) {
          const id = String(row.id).padStart(2, ' ');
          const schema = String(row.schema).padEnd(8, ' ');
          const name = String(row.name).padEnd(33, ' ');
          const appliedAt = new Date(row.applied_at).toISOString().slice(0, 19);
          console.log(`${id} | ${schema} | ${name} | ${appliedAt}`);
        } else {
          console.log('   | Invalid row data format |                   |');
        }
      });
    }

    console.log('\n📈 Summary:');
    const bySchema = result.rows.reduce((acc: MigrationSummary, row) => {
      if (isMigrationStateRow(row)) {
        acc[row.schema] = (acc[row.schema] || 0) + 1;
      }
      return acc;
    }, {} as MigrationSummary);

    Object.entries(bySchema).forEach(([schema, count]) => {
      console.log(`  ${schema}: ${Number(count)} migrations`);
    });
    console.log(`  Total: ${result.rows.length} migrations`);
  });
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
