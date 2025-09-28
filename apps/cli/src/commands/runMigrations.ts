import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import {
  runMigrations as executeRunMigrations,
  getMigrationStatus,
  validateMigrations,
} from '@legacy-sports/db-client';

import { ArgsType } from './ArgsType';

export const runMigrationsCommandBuilder = (argv: Argv) =>
  argv
    .usage('runMigrations')
    .option('production', {
      type: 'boolean',
      default: false,
      description: 'Use production AWS credentials',
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      description: 'Show what migrations would run without executing them',
    })
    .option('verbose', {
      type: 'boolean',
      default: false,
      description: 'Show detailed migration output',
    })
    .option('schema', {
      type: 'string',
      default: 'both',
      choices: ['public', 'internal', 'both'],
      description: 'Which schema to migrate',
    })
    .option('validate', {
      type: 'boolean',
      default: false,
      description: 'Validate migration integrity without running',
    })
    .option('status', {
      type: 'boolean',
      default: false,
      description: 'Show migration status without running',
    });

type HandleRunMigrationsArgs = ArgsType<
  ReturnType<typeof runMigrationsCommandBuilder>
>;

export async function handleRunMigrations(
  args: HandleRunMigrationsArgs,
): Promise<void> {
  try {
    if (args.status) {
      LOGGER.info('📊 Checking migration status...');
      const status = await getMigrationStatus({
        useProduction: args.production,
        verbose: args.verbose,
        schema: args.schema as 'public' | 'internal' | 'both',
      });

      LOGGER.info(`📋 Migration Status Summary:`);
      LOGGER.info(`   Applied: ${status.applied.length} migrations`);
      LOGGER.info(`   Pending: ${status.pending.length} migrations`);
      LOGGER.info(`   Total Available: ${status.total} migrations`);

      if (status.applied.length > 0) {
        LOGGER.info(`\n✅ Applied Migrations:`);
        status.applied.forEach((m) => {
          const appliedAtStr =
            m.applied_at instanceof Date
              ? m.applied_at.toISOString()
              : String(m.applied_at);
          LOGGER.info(
            `   ${m.id.toString().padStart(3, '0')}: ${m.name} (${m.schema}) - ${appliedAtStr}`,
          );
        });
      }

      if (status.pending.length > 0) {
        LOGGER.info(`\n⏳ Pending Migrations:`);
        status.pending.forEach((m) => {
          LOGGER.info(
            `   ${m.id.toString().padStart(3, '0')}: ${m.name} (${m.schema})`,
          );
        });
      } else {
        LOGGER.info(`\n🎉 Database is up to date!`);
      }
    } else if (args.validate) {
      LOGGER.info('🔍 Validating migration integrity...');
      const isValid = await validateMigrations({
        useProduction: args.production,
        verbose: args.verbose,
      });

      if (isValid) {
        LOGGER.info('✅ All migrations are valid');
        process.exit(0);
      } else {
        LOGGER.error('❌ Migration validation failed');
        process.exit(1);
      }
    } else {
      LOGGER.info('🚀 Starting database migrations...');

      if (args.production) {
        LOGGER.info('🔐 Using production AWS credentials');
      } else {
        LOGGER.info('🛠️ Using local development credentials');
      }

      const results = await executeRunMigrations({
        useProduction: args.production,
        dryRun: args['dry-run'],
        verbose: args.verbose,
        schema: args.schema as 'public' | 'internal' | 'both',
        stopOnError: true,
      });

      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      if (failed === 0) {
        LOGGER.info(
          `🎉 Migration completed successfully: ${successful} migrations applied`,
        );
        if (args['dry-run']) {
          LOGGER.info(
            'Note: This was a dry run - no changes were actually made',
          );
        }
      } else {
        LOGGER.error(
          `⚠️ Migration completed with errors: ${successful} successful, ${failed} failed`,
        );
        process.exit(1);
      }
    }
  } catch (error) {
    LOGGER.error(
      '❌ Migration system error:',
      error instanceof Error ? error.message : String(error),
    );
    if (args.verbose && error instanceof Error && error.stack) {
      LOGGER.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}
