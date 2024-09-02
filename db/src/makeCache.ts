// This script is called from scripts/generate-cache
import {readFileSync} from 'fs'
import { Pool } from 'pg';
import { createPostGraphileSchema } from 'postgraphile';
import { options } from './postgraphileOptions';
import { config } from 'dotenv';
import {
  getEnvVarOptional,
  getEnvVarRequired,
} from '@legacy-sports/env-utilities';
import { EnvironmentVariable } from './Environment';

config();

const schemas = process.env.DATABASE_SCHEMAS
  ? process.env.DATABASE_SCHEMAS.split(',')
  : ['app_public'];

const certLocation = getEnvVarOptional(EnvironmentVariable.DB_CERT_LOCATION);

async function main() {
  const pgPool = new Pool({
    host: getEnvVarRequired(EnvironmentVariable.DB_HOST),
    password: getEnvVarRequired(EnvironmentVariable.DB_PASSWORD),
    user: getEnvVarRequired(EnvironmentVariable.DB_USER),
    ssl:
      certLocation === undefined
        ? undefined
        : {
            ca: readFileSync(certLocation).toString(),
          },
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
