import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { runMigrations as executeDrizzleMigrations } from '@legacy-sports/db-client';

import { ArgsType } from './ArgsType';

export const runMigrationsCommandBuilder = (argv: Argv) =>
  argv.usage('runMigrations').option('production', {
    type: 'boolean',
    default: false,
    description: 'Use production AWS credentials',
  });

type HandleRunMigrationsArgs = ArgsType<
  ReturnType<typeof runMigrationsCommandBuilder>
>;

export async function handleRunMigrations(
  args: HandleRunMigrationsArgs,
): Promise<void> {
  try {
    LOGGER.info('🔧 Running Drizzle Database Migrations...');

    if (args.production) {
      LOGGER.info('🔐 Using production AWS credentials');
    } else {
      LOGGER.info('🛠️ Using local development credentials');
    }

    // Run Drizzle migrations (no return value, just executes)
    await executeDrizzleMigrations();

    LOGGER.info('✅ Migration completed successfully');
  } catch (error) {
    LOGGER.error('❌ Migration failed:');
    if (error instanceof Error) {
      LOGGER.error(`Error message: ${error.message}`);
      LOGGER.error(`Stack trace: ${error.stack}`);
    } else {
      LOGGER.error('Unknown error type:', String(error));
    }
    process.exit(1);
  }
}
