import { LOGGER } from '@legacy-sports/logging';

export function handleRunMigrations(): void {
  LOGGER.error('❌ This command has been deprecated.');
  LOGGER.info('');
  LOGGER.info('Please use one of the following instead:');
  LOGGER.info('  • make db-migrate           (recommended)');
  LOGGER.info('  • pnpm run db:migrate       (from root)');
  LOGGER.info('  • pnpm run db:up            (from lib/db-client)');
  LOGGER.info('');
  LOGGER.info(
    'These commands use the TypeScript migration runner with proper role separation.',
  );
  process.exit(1);
}
