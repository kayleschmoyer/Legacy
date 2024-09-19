// This script is called from scripts/generate-cache
import './.startup';
import { LOGGER } from '@legacy-sports/logging';
import { PgDbConnection, PublicSchema } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { createPostGraphileSchema } from 'postgraphile';
import { resolve } from 'path';
import { options } from './postgraphileOptions';

async function main(): Promise<void> {
  LOGGER.debug('Making DB Cache');

  const opts = getDbOptions();

  const certPath = 'dbCertPath' in opts ? opts.dbCertPath : undefined;

  const db = new PgDbConnection(certPath, PublicSchema);
  await db.initialize();

  await createPostGraphileSchema(db.client, ['public'], {
    ...options,
    readCache: undefined,
    writeCache: resolve(__dirname, '../dist/postgraphile.cache'),
  });

  await db.close();
}

main().catch((e) => {
  LOGGER.error(e);
  process.exit(1);
});
