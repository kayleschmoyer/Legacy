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
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { LOGGER } from '@legacy-sports/logging';
import { readdirSync } from 'fs';
import { getMigrationDatabaseConfig } from '../config/database';

interface MigrationFile {
  filename: string;
  timestamp: string;
  name: string;
  fullPath: string;
}

type Command = 'up' | 'down' | 'status' | 'fresh' | 'refresh';

/**
 * Context handed to a migration's `up`/`down` function. Migrations receive a
 * Drizzle instance (`db`) and, optionally, the raw `postgres` client (`sql`).
 * When a migration is applied transactionally, both point at the same
 * transaction so the migration body and the bookkeeping insert commit together.
 */
interface MigrationContext {
  db: ReturnType<typeof drizzle>;
  sql: postgres.Sql;
}

/**
 * Minimal shape of an imported migration module — just the `up` function we
 * need to apply it. Migration files export both `up` and `down`; callers that
 * only apply migrations need `up`.
 */
interface MigrationModule {
  up: (ctx: MigrationContext) => Promise<void>;
}

// Create migrations table if it doesn't exist
export async function ensureMigrationsTable(db: ReturnType<typeof drizzle>) {
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
    LOGGER.error(
      'Error reading migrations directory:',
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

// Get applied migrations from database
export async function getAppliedMigrations(
  db: ReturnType<typeof drizzle>,
): Promise<string[]> {
  try {
    const result = await db.execute(`
      SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at ASC;
    `);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- raw SQL result lacks typed rows
    return (result as any).map((row: any) => row.hash);
  } catch {
    return [];
  }
}

// Record migration as applied
export async function recordMigration(
  db: ReturnType<typeof drizzle>,
  hash: string,
) {
  // Parameterized to keep the hash out of the SQL string — this is a public
  // export reused by the hosted Lambda (LS-8119).
  await db.execute(sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${hash}, ${Date.now()})
    ON CONFLICT (hash) DO NOTHING;
  `);
}

/**
 * Apply a single migration module's `up()` and record its hash inside ONE
 * transaction. If `up()` throws (or the bookkeeping insert fails), the whole
 * transaction rolls back and the hash is NOT recorded — so a partially-applied
 * migration can never be marked as applied.
 *
 * Connection-agnostic by design: callers pass an already-opened `postgres`
 * client and an already-imported migration module. This lets a hosted Lambda
 * (LS-8119) evaluate a client-transpiled migration and apply it through the
 * exact same code path as the local runner.
 *
 * `hash` is the migration's tracking key — the runner keys on the migration
 * filename (e.g. "20260303_150000_add_ci_readonly_role.ts").
 */
export async function applyMigrationModule(
  sqlClient: postgres.Sql,
  hash: string,
  module: MigrationModule,
): Promise<void> {
  await sqlClient.begin(async (tx) => {
    // `tx` is a TransactionSql, which is NOT assignable to postgres.Sql — it
    // lacks the connection-management methods (CLOSE/END/PostgresError/...).
    // A direct `tx as postgres.Sql` fails to compile (TS2352: "neither type
    // sufficiently overlaps... convert to 'unknown' first"), so the `unknown`
    // hop is required. Migrations only run queries on it, never lifecycle
    // methods. The raw INSERT below still uses `tx` directly as a tagged
    // template.
    const txSql = tx as unknown as postgres.Sql;
    const txDb = drizzle(txSql);
    await module.up({ db: txDb, sql: txSql });
    await tx`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${Date.now()})
      ON CONFLICT (hash) DO NOTHING
    `;
  });
}

// Remove migration record
async function unrecordMigration(db: ReturnType<typeof drizzle>, hash: string) {
  // Parameterized to keep the hash out of the SQL string.
  await db.execute(sql`
    DELETE FROM drizzle.__drizzle_migrations WHERE hash = ${hash};
  `);
}

async function runRollbackCommand(command: Command, _options: string[] = []) {
  try {
    LOGGER.info(
      `🔧 Legacy Sports Rollback Migration (${command.toUpperCase()})`,
    );
    LOGGER.info('='.repeat(50));

    LOGGER.info('🔍 Resolving migration database credentials...');
    const dbConfig = await getMigrationDatabaseConfig();

    LOGGER.info(
      `📡 Connected to database: ${dbConfig.host}:${dbConfig.port || 5432}/${dbConfig.database}`,
    );

    // Use URL parsing to safely split host and port — handles IPv6 bracket
    // notation (e.g. "[::1]:5432") as well as plain "hostname:port" strings.
    let resolvedHost: string;
    let resolvedPort: number;
    try {
      const parsed = new URL(`postgresql://${dbConfig.host}`);
      resolvedHost = parsed.hostname;
      resolvedPort = parsed.port
        ? parseInt(parsed.port, 10)
        : (dbConfig.port ?? 5432);
    } catch {
      resolvedHost = dbConfig.host;
      resolvedPort = dbConfig.port ?? 5432;
    }

    // Create postgres connection string
    const connectionString = `postgresql://${dbConfig.user}:${encodeURIComponent(dbConfig.password)}@${resolvedHost}:${resolvedPort}/${dbConfig.database}`;

    // Create postgres client - disable prepared statements for DDL operations
    const sslSelfSigned = process.env['DB_SSL_SELF_SIGNED'] === 'true';
    const migrationClient = postgres(connectionString, {
      max: 1, // Use single connection for migrations
      prepare: false, // Disable prepared statements - they don't work with DDL that references user-defined functions
      ssl:
        dbConfig.ssl || (sslSelfSigned ? { rejectUnauthorized: false } : false),
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

export async function runMigrationsUp(
  db: ReturnType<typeof drizzle>,
  sqlClient: postgres.Sql,
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic import of untyped migration file
        const migrationModule = await import(fileUrl);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- checking for up() on untyped migration module
        if (migrationModule.up && typeof migrationModule.up === 'function') {
          // Apply up() and record the hash atomically — a migration that fails
          // partway through is never marked as applied.
          // Cast the untyped dynamic import to MigrationModule; the up() check
          // above guarantees the shape.
          await applyMigrationModule(
            sqlClient,
            migration.filename,
            migrationModule as MigrationModule,
          );
          appliedCount++;
          LOGGER.info(`✅ Applied: ${migration.filename}`);
        } else {
          LOGGER.error(`❌ No 'up' function found in ${migration.filename}`);
        }
      } catch (error) {
        LOGGER.error(
          `❌ Error applying ${migration.filename}:`,
          error instanceof Error ? error : new Error(String(error)),
        );
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic import of untyped migration file
    const migrationModule = await import(fileUrl);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- checking for down() on untyped migration module
    if (migrationModule.down && typeof migrationModule.down === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- calling untyped migration down()
      await migrationModule.down({ db, sql: _sql });

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
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

async function runFreshMigrations(
  db: ReturnType<typeof drizzle>,
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic import of untyped migration file
        const migrationModule = await import(fileUrl);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- checking for down() on untyped migration module
        if (migrationModule.down) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- calling untyped migration down()
          await migrationModule.down({ db });

          await unrecordMigration(db, migration.filename);
          LOGGER.info(`✅ Rolled back: ${migration.filename}`);
        }
      } catch (error) {
        LOGGER.error(
          `❌ Error rolling back ${migration.filename}:`,
          error instanceof Error ? error : new Error(String(error)),
        );
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

// Run the command if this script is executed directly. Argument parsing lives
// inside the guard so importing this module (e.g. for unit tests or the hosted
// Lambda) never triggers process.exit.
if (require.main === module) {
  const command = process.argv[2] as Command;
  const options = process.argv.slice(3);

  if (
    !command ||
    !['up', 'down', 'status', 'fresh', 'refresh'].includes(command)
  ) {
    LOGGER.error('Usage: tsx rollback-migrations.ts <command>');
    LOGGER.error('Commands: up, down, status, fresh, refresh');
    process.exit(1);
  }

  void runRollbackCommand(command, options);
}

export { runRollbackCommand };
