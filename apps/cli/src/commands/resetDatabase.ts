import { LOGGER } from '@legacy-sports/logging';
import { resetDatabase } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';

interface ResetDatabaseArgs {
  confirm?: boolean;
}

export async function handleResetDatabase(
  args: ResetDatabaseArgs,
): Promise<void> {
  if (!args.confirm) {
    LOGGER.error('❌ Database reset requires confirmation flag: --confirm');
    LOGGER.warn('⚠️  This operation will DROP ALL tables and data!');
    LOGGER.info('💡 Usage: pnpm exec nx run cli:reset-database --confirm');
    process.exit(1);
  }

  try {
    LOGGER.info('🔄 Resetting Legacy Sports Database...');
    LOGGER.warn('⚠️  WARNING: This will DROP ALL tables and data!');

    getDbOptions(); // Validate DB options are available
    LOGGER.info('🎯 Target: Development database');

    // Call the reset function from db-client
    await resetDatabase();

    LOGGER.info('✅ Database reset completed successfully');
    LOGGER.info('🚀 Ready for fresh migrations');
  } catch (error) {
    LOGGER.error('❌ Database reset failed:');
    if (error instanceof Error) {
      LOGGER.error(`Error message: ${error.message}`);
      LOGGER.error(`Stack trace: ${error.stack}`);
    } else {
      LOGGER.error('Unknown error type:', String(error));
    }
    process.exit(1);
  }
}
