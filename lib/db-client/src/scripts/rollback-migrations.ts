#!/usr/bin/env tsx
/**
 * Rollback Migration Manager
 *
 * A proper migration manager that:
 * - Executes actual up/down functions from TypeScript migration files
 * - Tracks migration state in database
 * - Provides rollback capabilities
 * - Integrates with AWS credentials
 */

import { config } from 'dotenv';
// eslint-disable-next-line import/order -- resolve needed immediately for config
import { join, resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { LOGGER } from '@legacy-sports/logging';
import { readdirSync } from 'fs';
import { getDatabaseConfig } from '../config/database';

interface MigrationFile {
  filename: string;
  timestamp: string;
  name: string;
  fullPath: string;
}

type Command = 'up' | 'down' | 'status' | 'fresh' | 'refresh';

// Create migrations table if it doesn't exist
async function ensureMigrationsTable(db: ReturnType<typeof drizzle>) {
  await db.execute(`CREATE SCHEMA IF NOT EXISTS drizzle;`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash VARCHAR(255) NOT NULL UNIQUE,
      created_at BIGINT NOT NULL
    );
  `);
}

// Parse migration filename to extract timestamp and name
function parseMigrationFilename(filename: string): MigrationFile | null {
  const match = filename.match(/^(\d{8}_\d{6})_(.+)\.ts$/);
  if (!match) return null;

  return {
    filename,
    timestamp: match[1],
    name: match[2],
    fullPath: join(__dirname, '../../migrations', filename),
  };
}

// Get all migration files sorted by timestamp
function getMigrationFiles(): MigrationFile[] {
  const migrationsDir = join(__dirname, '../../migrations');

  try {
    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
      .map(parseMigrationFilename)
      .filter((migration): migration is MigrationFile => migration !== null)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return files;
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    LOGGER.error('Error reading migrations directory:', error);
    return [];
  }
}

// Get applied migrations from database
async function getAppliedMigrations(
  db: ReturnType<typeof drizzle>,
): Promise<string[]> {
  try {
    const result = await db.execute(`
      SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at ASC;
    `);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    return (result as any).map((row: any) => row.hash);
  } catch {
    return [];
  }
}

// Record migration as applied
async function recordMigration(db: ReturnType<typeof drizzle>, hash: string) {
  await db.execute(`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at) 
    VALUES ('${hash}', ${Date.now()})
    ON CONFLICT (hash) DO NOTHING;
  `);
}

// Remove migration record
async function unrecordMigration(db: ReturnType<typeof drizzle>, hash: string) {
  await db.execute(`
    DELETE FROM drizzle.__drizzle_migrations WHERE hash = '${hash}';
  `);
}

async function runRollbackCommand(
  command: Command,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options: string[] = [],
) {
  try {
    LOGGER.info(
      `🔧 Legacy Sports Rollback Migration (${command.toUpperCase()})`,
    );
    LOGGER.info('='.repeat(50));

    LOGGER.info('🔍 Resolving database credentials...');
    const dbConfig = await getDatabaseConfig();

    LOGGER.info(
      `📡 Connected to database: ${dbConfig.host}:${dbConfig.port || 5432}/${dbConfig.database}`,
    );

    // Create postgres connection string
    const connectionString = `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port || 5432}/${dbConfig.database}${dbConfig.ssl ? '?sslmode=require' : ''}`;

    // Create postgres client
    const migrationClient = postgres(connectionString, {
      max: 1, // Use single connection for migrations
    });

    // Create Drizzle instance
    const db = drizzle(migrationClient);

    // Ensure migration tracking table exists
    await ensureMigrationsTable(db);

    LOGGER.info(`🚀 Running ${command} command...`);

    switch (command) {
      case 'status':
        await checkMigrationStatus(db);
        break;

      case 'up':
        await runMigrationsUp(db, migrationClient);
        break;

      case 'down':
        await runMigrationDown(db, migrationClient);
        break;

      case 'fresh':
        await runFreshMigrations(db, migrationClient);
        break;

      case 'refresh':
        await runRefreshMigrations(db, migrationClient);
        break;

      default:
        throw new Error(`Unknown command: ${String(command)}`);
    }

    // Close connection
    await migrationClient.end();

    LOGGER.info(`✅ ${command.toUpperCase()} command completed successfully`);
  } catch (error) {
    LOGGER.error(`❌ ${command.toUpperCase()} command failed:`);
    if (error instanceof Error) {
      LOGGER.error(`Error message: ${error.message}`);
      LOGGER.error(`Stack trace: ${error.stack}`);
    } else {
      LOGGER.error('Unknown error type:', String(error));
    }
    process.exit(1);
  }
}

async function runMigrationsUp(
  db: ReturnType<typeof drizzle>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _sql: postgres.Sql,
) {
  const migrationFiles = getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations(db);

  LOGGER.info(`📁 Found ${migrationFiles.length} migration files`);
  LOGGER.info(`📊 ${appliedMigrations.length} migrations already applied`);

  let appliedCount = 0;

  for (const migration of migrationFiles) {
    if (!appliedMigrations.includes(migration.filename)) {
      LOGGER.info(`⬆️ Applying migration: ${migration.filename}`);

      try {
        // Dynamic import the migration module - convert to file URL for Windows
        const fileUrl = `file://${migration.fullPath.replace(/\\/g, '/')}`;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const migrationModule = await import(fileUrl);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (migrationModule.up && typeof migrationModule.up === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          await migrationModule.up({ db });
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          await recordMigration(db, migration.filename);
          appliedCount++;
          LOGGER.info(`✅ Applied: ${migration.filename}`);
        } else {
          LOGGER.error(`❌ No 'up' function found in ${migration.filename}`);
        }
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        LOGGER.error(`❌ Error applying ${migration.filename}:`, error);
        throw error;
      }
    } else {
      LOGGER.info(`⏭️ Already applied: ${migration.filename}`);
    }
  }

  if (appliedCount === 0) {
    LOGGER.info('📋 No new migrations to apply');
  } else {
    LOGGER.info(`✅ Applied ${appliedCount} new migrations`);
  }
}

async function runMigrationDown(
  db: ReturnType<typeof drizzle>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _sql: postgres.Sql,
) {
  const allFiles = getMigrationFiles();
  const applied = await getAppliedMigrations(db);

  if (applied.length === 0) {
    LOGGER.info('📋 No migrations to rollback');
    return;
  }

  // Find the last applied migration
  const lastApplied = applied[applied.length - 1];
  const migrationToRollback = allFiles.find((f) => f.filename === lastApplied);

  if (!migrationToRollback) {
    LOGGER.error(`❌ Could not find migration file for: ${lastApplied}`);
    return;
  }

  LOGGER.info(`⬇️ Rolling back migration: ${migrationToRollback.filename}`);

  try {
    // Dynamic import the migration module - convert to file URL for Windows
    const fileUrl = `file://${migrationToRollback.fullPath.replace(/\\/g, '/')}`;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const migrationModule = await import(fileUrl);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (migrationModule.down && typeof migrationModule.down === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await migrationModule.down({ db });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await unrecordMigration(db, migrationToRollback.filename);
      LOGGER.info(`✅ Rolled back: ${migrationToRollback.filename}`);
    } else {
      LOGGER.error(
        `❌ No 'down' function found in ${migrationToRollback.filename}`,
      );
    }
  } catch (error) {
    LOGGER.error(
      `❌ Error rolling back ${migrationToRollback.filename}:`,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      error,
    );
    throw error;
  }
}

async function runFreshMigrations(
  db: ReturnType<typeof drizzle>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _sql: postgres.Sql,
) {
  LOGGER.info('🧹 Rolling back all migrations...');

  const allFiles = getMigrationFiles();
  const applied = await getAppliedMigrations(db);

  // Roll back all migrations in reverse order
  const appliedFiles = applied
    .map((hash) => allFiles.find((f) => f.filename === hash))
    .filter(Boolean)
    .reverse();

  for (const migration of appliedFiles) {
    if (migration) {
      LOGGER.info(`⬇️ Rolling back: ${migration.filename}`);

      try {
        // Dynamic import the migration module - convert to file URL for Windows
        const fileUrl = `file://${migration.fullPath.replace(/\\/g, '/')}`;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const migrationModule = await import(fileUrl);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (migrationModule.down) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          await migrationModule.down({ db });
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          await unrecordMigration(db, migration.filename);
          LOGGER.info(`✅ Rolled back: ${migration.filename}`);
        }
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        LOGGER.error(`❌ Error rolling back ${migration.filename}:`, error);
        throw error;
      }
    }
  }

  LOGGER.info('✅ All migrations rolled back');
}

async function runRefreshMigrations(
  db: ReturnType<typeof drizzle>,
  sql: postgres.Sql,
) {
  LOGGER.info('🔄 Refreshing migrations (fresh + up)...');

  await runFreshMigrations(db, sql);
  await runMigrationsUp(db, sql);

  LOGGER.info('✅ Database refreshed successfully');
}

async function checkMigrationStatus(db: ReturnType<typeof drizzle>) {
  const migrationFiles = getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations(db);

  LOGGER.info(`📁 Total migrations available: ${migrationFiles.length}`);
  LOGGER.info(`📊 Applied migrations: ${appliedMigrations.length}`);
  LOGGER.info('');

  migrationFiles.forEach((migration) => {
    const isApplied = appliedMigrations.includes(migration.filename);
    const status = isApplied ? '✅ Applied' : '⏸️  Pending';
    LOGGER.info(`  ${status}: ${migration.filename}`);
  });

  if (appliedMigrations.length > 0) {
    LOGGER.info('');
    LOGGER.info('Recent applied migrations:');
    appliedMigrations.slice(-3).forEach((hash, index) => {
      LOGGER.info(`  ${appliedMigrations.length - 2 + index}: ${hash}`);
    });
  }
}

// Parse command line arguments
const command = process.argv[2] as Command;
const options = process.argv.slice(3);

if (
  !command ||
  !['up', 'down', 'status', 'fresh', 'refresh'].includes(command)
) {
  console.error('Usage: tsx rollback-migrations.ts <command>');
  console.error('Commands: up, down, status, fresh, refresh');
  process.exit(1);
}

// Run the command if this script is executed directly
if (require.main === module) {
  void runRollbackCommand(command, options);
}

export { runRollbackCommand };
