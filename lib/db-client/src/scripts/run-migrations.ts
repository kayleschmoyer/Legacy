#!/usr/bin/env tsx
/**
 * Migration Runner Script
 *
 * This script runs all pending database migrations using the migration runner.
 */

// Load environment variables first
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from workspace root (where sync-env updates it)
config({ path: resolve(__dirname, '../../../../.env') });

import {
  getMigrationStatus,
  runMigrations,
} from '../migrations/migration-runner';

interface MigrationOptions {
  dryRun?: boolean;
  verbose?: boolean;
  useProduction?: boolean;
  schema?: 'public' | 'internal' | 'both';
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);

  // Auto-detect if we should use production credentials based on environment
  const useLocalCreds = process.env.USE_LOCAL_CREDENTIALS === 'true';
  const hasAwsSecret = Boolean(
    process.env.DB_SECRET_NAME || process.env.DB_CREDS_PATH,
  );
  const autoUseProduction = !useLocalCreds && hasAwsSecret;

  const options: MigrationOptions = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    useProduction: args.includes('--production') || autoUseProduction,
    schema: 'both', // Default to both schemas
  };

  // Check for schema-specific flags
  if (args.includes('--public-only')) {
    options.schema = 'public';
  } else if (args.includes('--internal-only')) {
    options.schema = 'internal';
  }

  console.log('🔧 Legacy Sports Database Migration Runner');
  console.log('==========================================');
  console.log(`Schema: ${options.schema}`);
  console.log(`Dry Run: ${options.dryRun ? 'Yes' : 'No'}`);
  console.log(`Verbose: ${options.verbose ? 'Yes' : 'No'}`);
  console.log(
    `Environment: ${options.useProduction ? 'Production' : 'Development'}`,
  );
  console.log('');

  try {
    // Check migration status first
    console.log('🔍 Checking migration status...');
    const status = await getMigrationStatus(options);

    console.log('📊 Migration Status:');
    console.log(`  Applied: ${status.applied.length}`);
    console.log(`  Pending: ${status.pending.length}`);
    console.log(`  Total: ${status.total}`);
    console.log('');

    if (status.applied.length > 0) {
      console.log('✅ Applied migrations:');
      status.applied
        .sort((a, b) => a.id - b.id)
        .forEach((m) => {
          console.log(`  ✓ Migration ${m.id}: ${m.name} (${m.schema} schema)`);
        });
      console.log('');
    }

    if (status.pending.length === 0) {
      console.log('✅ All migrations are up to date!');
      return;
    }

    console.log('📝 Pending migrations:');
    status.pending
      .sort((a, b) => a.id - b.id)
      .forEach((m) => {
        console.log(`  • Migration ${m.id}: ${m.name} (${m.schema} schema)`);
      });
    console.log('');

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made');
      console.log(`Would apply ${status.pending.length} pending migrations.`);
      return;
    }

    // Run the migrations
    console.log('🚀 Running migrations...');
    const results = await runMigrations(options);

    // Report results
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log('');
    console.log('📊 Migration Results:');
    console.log(`  Successful: ${successful.length}`);
    console.log(`  Failed: ${failed.length}`);

    if (successful.length > 0) {
      console.log('');
      console.log('✅ Successful migrations:');
      successful.forEach((r) => {
        const time = r.executionTime.toFixed(2);
        console.log(
          `  ✓ Migration ${r.migration.id}: ${r.migration.name} (${time}ms)`,
        );
      });
    }

    if (failed.length > 0) {
      console.log('');
      console.log('❌ Failed migrations:');
      failed.forEach((r) => {
        console.log(`  ✗ Migration ${r.migration.id}: ${r.migration.name}`);
        console.log(`    Error: ${r.error}`);
      });
      process.exit(1);
    } else {
      console.log('');
      console.log('🎉 All migrations completed successfully!');
    }
  } catch (error) {
    console.error(
      '❌ Migration failed:',
      error instanceof Error ? error.message : error,
    );
    if (options.verbose && error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
