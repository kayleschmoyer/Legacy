// This script is called from scripts/generate-cache

import { Pool } from 'pg';
import { createPostGraphileSchema } from 'postgraphile';
import { options } from './postgraphileOptions';

const schemas = process.env.DATABASE_SCHEMAS
  ? process.env.DATABASE_SCHEMAS.split(',')
  : ['app_public'];

async function main() {
  const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  await createPostGraphileSchema(pgPool, schemas, {
    ...options,
    writeCache: `${__dirname}/../dist/postgraphile.cache`,
  });
  await pgPool.end();
}

main().then(null, (e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
