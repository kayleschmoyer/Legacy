/**
 * Database Migration System
 *
 * A new, source-controlled migration system with AWS secrets integration.
 * Features:
 * - Descriptive migration names (no random strings)
 * - AWS Secrets Manager integration
 * - Separate public/internal schema support
 * - Migration state tracking
 * - Rollback capability
 * - Dry-run mode
 */

import { sql } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { type DbOptions, getDbOptions } from '@legacy-sports/utils';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import {
  runWithInternalClient,
  runWithPublicClient,
} from '../lib/client/Helpers';

/**
 * Migration file metadata
 */
export interface MigrationFile {
  id: number;
  name: string;
  filename: string;
  fullPath: string;
  sql: string;
  schema: 'public' | 'internal';
}

/**
 * Migration execution result
 */
export interface MigrationResult {
  migration: MigrationFile;
  success: boolean;
  error?: string;
  executionTime: number;
}

/**
 * Migration runner options
 */
export interface MigrationOptions {
  /** Use production AWS credentials */
  useProduction?: boolean;
  /** Dry run - don't execute, just validate */
  dryRun?: boolean;
  /** Verbose logging */
  verbose?: boolean;
  /** Target schema ('public', 'internal', or 'both') */
  schema?: 'public' | 'internal' | 'both';
  /** Stop on first error */
  stopOnError?: boolean;
}

/**
 * Migration state tracking
 */
interface MigrationState {
  id: number;
  name: string;
  schema: string;
  applied_at: Date;
  checksum: string;
}

/**
 * Database column information result
 */
interface ColumnInfo {
  column_name: string;
}

/**
 * Main migration runner class
 */
export class MigrationRunner {
  private dbOptions: DbOptions | null = null;
  public readonly options: Required<MigrationOptions>;

  constructor(options: MigrationOptions = {}) {
    this.options = {
      useProduction: options.useProduction ?? false,
      dryRun: options.dryRun ?? false,
      verbose: options.verbose ?? false,
      schema: options.schema ?? 'both',
      stopOnError: options.stopOnError ?? true,
    };
  }

  /**
   * Initialize database connection with AWS secrets
   */
  initialize(): void {
    if (this.options.verbose) {
      LOGGER.info(`🔐 Resolving database configuration...`);
    }

    this.dbOptions = getDbOptions();

    if (this.options.verbose) {
      LOGGER.info(
        `📡 Database options configured for ${this.options.useProduction ? 'production' : 'development'}`,
      );
    }
  }

  /**
   * Ensure migration tracking table exists
   */
  async ensureMigrationTable(): Promise<void> {
    if (!this.dbOptions) throw new Error('Database not initialized');

    const dbOptions = this.dbOptions;
    await runWithPublicClient(dbOptions, async (db) => {
      // Check if we need to migrate the old table structure
      const checkResult = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'migration_state' 
        AND table_schema = 'public'
      `);

      const columns = checkResult.rows.map(
        (row) => (row as unknown as ColumnInfo).column_name,
      );
      const hasCompositeKey = columns.length > 0;

      if (
        hasCompositeKey &&
        columns.includes('id') &&
        !columns.includes('schema')
      ) {
        // Old table structure exists, need to migrate
        if (this.options.verbose) {
          LOGGER.info('🔄 Migrating migration_state table to new schema...');
        }
        await db.execute(sql`DROP TABLE IF EXISTS migration_state`);
      }

      // Create migration tracking table with correct schema
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS migration_state (
          id INTEGER NOT NULL,
          schema VARCHAR(20) NOT NULL,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          checksum VARCHAR(64) NOT NULL,
          PRIMARY KEY (id, schema),
          UNIQUE (name, schema)
        );
      `);
    });

    if (this.options.verbose) {
      LOGGER.info('✓ Migration tracking table ready');
    }
  }

  /**
   * Load migration files from directory
   */
  loadMigrations(schemaType: 'public' | 'internal'): MigrationFile[] {
    // Look for migrations in the source directory, not the compiled dist
    // This works both in development and when the package is published
    const sourceDir = resolve(__dirname, schemaType);
    const fallbackDir = resolve(
      __dirname,
      '..',
      '..',
      '..',
      'lib',
      'db-client',
      'src',
      'migrations',
      schemaType,
    );

    let migrationsDir = sourceDir;
    if (!existsSync(sourceDir) && existsSync(fallbackDir)) {
      migrationsDir = fallbackDir;
    }

    if (!existsSync(migrationsDir)) {
      if (this.options.verbose) {
        LOGGER.warn(`⚠️ No migrations directory found: ${migrationsDir}`);
        LOGGER.warn(`⚠️ Also checked: ${sourceDir}`);
      }
      return [];
    }

    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort(); // Natural sort ensures proper order

    return files.map((filename) => {
      // Extract ID from filename (001_create_players.sql -> 1)
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        throw new Error(
          `Invalid migration filename format: ${filename}. Expected: 001_description.sql`,
        );
      }

      const [, idStr, name] = match;
      const id = parseInt(idStr, 10);
      const fullPath = join(migrationsDir, filename);

      return {
        id,
        name,
        filename,
        fullPath,
        sql: readFileSync(fullPath, 'utf-8'),
        schema: schemaType,
      };
    });
  }

  /**
   * Get applied migrations from database
   */
  async getAppliedMigrations(): Promise<MigrationState[]> {
    if (!this.dbOptions) throw new Error('Database not initialized');

    const dbOptions = this.dbOptions;
    try {
      return await runWithPublicClient(dbOptions, async (db) => {
        const result = await db.execute(sql`
          SELECT id, name, schema, applied_at, checksum 
          FROM migration_state 
          ORDER BY id ASC
        `);
        return result.rows as unknown as MigrationState[];
      });
    } catch {
      // Table might not exist yet
      return [];
    }
  }

  /**
   * Calculate migration checksum
   */
  private calculateChecksum(migration: MigrationFile): string {
    return createHash('sha256').update(migration.sql).digest('hex');
  }

  /**
   * Execute a single migration
   */
  async executeMigration(migration: MigrationFile): Promise<MigrationResult> {
    if (!this.dbOptions) throw new Error('Database not initialized');

    const dbOptions = this.dbOptions;
    const startTime = Date.now();

    try {
      if (this.options.dryRun) {
        LOGGER.info(
          `🔍 DRY RUN: Would execute migration ${migration.id}: ${migration.name}`,
        );
        if (this.options.verbose) {
          LOGGER.info(`SQL Preview:\n${migration.sql.slice(0, 200)}...`);
        }
        return {
          migration,
          success: true,
          executionTime: Date.now() - startTime,
        };
      }

      // Execute migration using appropriate client based on schema
      if (migration.schema === 'public') {
        await runWithPublicClient(dbOptions, async (db) => {
          // Execute the migration SQL
          await db.execute(sql.raw(migration.sql));

          // Record in migration state
          const checksum = this.calculateChecksum(migration);
          await db.execute(sql`
            INSERT INTO migration_state (id, name, schema, checksum)
            VALUES (${migration.id}, ${migration.name}, ${migration.schema}, ${checksum})
            ON CONFLICT (name) DO NOTHING
          `);
        });
      } else {
        // For internal migrations, use the internal client
        await runWithInternalClient(dbOptions, async (db) => {
          // Execute the migration SQL
          await db.execute(sql.raw(migration.sql));
        });

        // Record the internal migration in the public migration_state table
        await runWithPublicClient(dbOptions, async (db) => {
          const checksum = this.calculateChecksum(migration);
          await db.execute(sql`
            INSERT INTO migration_state (id, name, schema, checksum)
            VALUES (${migration.id}, ${migration.name}, ${migration.schema}, ${checksum})
            ON CONFLICT (name) DO NOTHING
          `);
        });
      }

      const executionTime = Date.now() - startTime;
      LOGGER.info(
        `✅ Migration ${migration.id}: ${migration.name} (${executionTime}ms)`,
      );

      return {
        migration,
        success: true,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      LOGGER.error(`❌ Migration ${migration.id} failed: ${migration.name}`);
      LOGGER.error(`   Error: ${errorMessage}`);

      return {
        migration,
        success: false,
        error: errorMessage,
        executionTime,
      };
    }
  }

  /**
   * Run pending migrations
   */
  async runMigrations(): Promise<MigrationResult[]> {
    if (!this.dbOptions) {
      this.initialize();
    }

    await this.ensureMigrationTable();

    const results: MigrationResult[] = [];
    const appliedMigrations = await this.getAppliedMigrations();
    // Create a Set of applied migrations using both ID and schema (composite key)
    const appliedKeys = new Set(
      appliedMigrations.map((m) => `${m.id}:${m.schema}`),
    );

    // Determine which schemas to run
    const schemas: ('public' | 'internal')[] =
      this.options.schema === 'both'
        ? ['internal', 'public'] // Internal first, then public
        : [this.options.schema];

    for (const schema of schemas) {
      LOGGER.info(`🚀 Running ${schema} schema migrations...`);

      const migrations = this.loadMigrations(schema);
      // Check for pending migrations using the composite key (id:schema)
      const pendingMigrations = migrations.filter(
        (m) => !appliedKeys.has(`${m.id}:${m.schema}`),
      );

      if (pendingMigrations.length === 0) {
        LOGGER.info(`✅ No pending ${schema} migrations`);
        continue;
      }

      LOGGER.info(
        `📋 Found ${pendingMigrations.length} pending ${schema} migrations`,
      );

      for (const migration of pendingMigrations) {
        const result = await this.executeMigration(migration);
        results.push(result);

        if (!result.success && this.options.stopOnError) {
          LOGGER.error(
            `🛑 Stopping migration process due to error in ${migration.name}`,
          );
          break;
        }
      }
    }

    return results;
  }

  /**
   * Validate migration integrity
   */
  async validateMigrations(): Promise<boolean> {
    if (!this.dbOptions) {
      this.initialize();
    }

    const appliedMigrations = await this.getAppliedMigrations();
    let isValid = true;

    for (const schema of ['public', 'internal'] as const) {
      const currentMigrations = this.loadMigrations(schema);

      for (const applied of appliedMigrations.filter(
        (m) => m.schema === schema,
      )) {
        const current = currentMigrations.find((m) => m.id === applied.id);

        if (!current) {
          LOGGER.error(
            `❌ Applied migration ${applied.id} (${applied.name}) not found in current files`,
          );
          isValid = false;
          continue;
        }

        const currentChecksum = this.calculateChecksum(current);
        if (currentChecksum !== applied.checksum) {
          LOGGER.error(
            `❌ Migration ${applied.id} checksum mismatch - file has been modified after application`,
          );
          isValid = false;
        }
      }
    }

    if (isValid) {
      LOGGER.info('✅ All migration checksums valid');
    }

    return isValid;
  }

  /**
   * Close database connection
   */
  close(): void {
    // Note: The existing client helpers handle connection cleanup automatically
    // No explicit cleanup needed as connections are managed per operation
    this.dbOptions = null;
  }
}

/**
 * Convenience function to run migrations
 */
export async function runMigrations(
  options: MigrationOptions = {},
): Promise<MigrationResult[]> {
  const runner = new MigrationRunner(options);

  try {
    const results = await runner.runMigrations();

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    if (failed === 0) {
      LOGGER.info(
        `🎉 Migration completed successfully: ${successful} migrations applied`,
      );
    } else {
      LOGGER.error(
        `⚠️ Migration completed with errors: ${successful} successful, ${failed} failed`,
      );
    }

    return results;
  } finally {
    runner.close();
  }
}

/**
 * Convenience function to validate migrations
 */
export async function validateMigrations(
  options: MigrationOptions = {},
): Promise<boolean> {
  const runner = new MigrationRunner(options);

  try {
    return await runner.validateMigrations();
  } finally {
    runner.close();
  }
}

/**
 * Get migration status information
 */
export async function getMigrationStatus(
  options: MigrationOptions = {},
): Promise<{
  applied: MigrationState[];
  pending: MigrationFile[];
  total: number;
}> {
  const runner = new MigrationRunner(options);

  try {
    runner.initialize();
    await runner.ensureMigrationTable();

    const appliedMigrations = await runner.getAppliedMigrations();
    // Create a Set of applied migrations using both ID and schema (composite key)
    const appliedKeys = new Set(
      appliedMigrations.map((m) => `${m.id}:${m.schema}`),
    );

    // Get all available migrations
    const schemas: ('public' | 'internal')[] =
      runner.options.schema === 'both'
        ? ['internal', 'public']
        : [runner.options.schema];

    const allMigrations: MigrationFile[] = [];
    for (const schema of schemas) {
      allMigrations.push(...runner.loadMigrations(schema));
    }

    // Check for pending migrations using the composite key (id:schema)
    const pendingMigrations = allMigrations.filter(
      (m) => !appliedKeys.has(`${m.id}:${m.schema}`),
    );

    return {
      applied: appliedMigrations,
      pending: pendingMigrations,
      total: allMigrations.length,
    };
  } finally {
    runner.close();
  }
}

/**
 * Rollback to a specific migration (dry-run only for safety)
 */
export async function rollbackToMigration(
  targetMigrationId: number,
  options: MigrationOptions = {},
): Promise<{
  migrationsToRollback: MigrationState[];
  dryRun: boolean;
}> {
  const runner = new MigrationRunner({ ...options, dryRun: true }); // Force dry-run for safety

  try {
    runner.initialize();
    const appliedMigrations = await runner.getAppliedMigrations();

    // Find migrations to rollback (applied after target)
    const migrationsToRollback = appliedMigrations.filter(
      (m) => m.id > targetMigrationId,
    );

    if (migrationsToRollback.length === 0) {
      LOGGER.info(
        `✅ No migrations to rollback. Current state is at or before migration ${targetMigrationId}`,
      );
    } else {
      LOGGER.warn(
        `⚠️ ROLLBACK PREVIEW: Would rollback ${migrationsToRollback.length} migrations:`,
      );
      migrationsToRollback
        .sort((a, b) => b.id - a.id) // Rollback in reverse order
        .forEach((m) => {
          LOGGER.warn(`   - Migration ${m.id}: ${m.name} (${m.schema} schema)`);
        });
      LOGGER.warn(
        '⚠️ Note: Actual rollback must be performed manually with appropriate down migrations',
      );
      LOGGER.warn(
        '⚠️ This system does not automatically generate rollback SQL for safety reasons',
      );
    }

    return {
      migrationsToRollback,
      dryRun: true,
    };
  } finally {
    runner.close();
  }
}
