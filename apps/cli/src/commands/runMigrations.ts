import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'path';

export const runMigrationsCommandBuilder = (argv: Argv) =>
  argv.usage('run-migrations');

export async function runMigrations(): Promise<void> {
  LOGGER.debug('Running DB Migrations');

  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db) => {
    await migrate(db, {
      migrationsFolder: resolve(
        __dirname,
        '../../../../lib/db-client/src/drizzle/migrations'
      ),
    });
  });
}
