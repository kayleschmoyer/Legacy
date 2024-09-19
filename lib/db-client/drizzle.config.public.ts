import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { defineConfig } from 'drizzle-kit';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EnvironmentVariable } from './src/EnvironmentVariable';

export default defineConfig({
  dbCredentials: {
    database: 'postgres',
    host: getEnvVarRequired(EnvironmentVariable.DB_HOST),
    password: getEnvVarRequired(EnvironmentVariable.DB_PASSWORD),
    ssl: {
      ca: readFileSync(
        resolve(__dirname, getEnvVarRequired(EnvironmentVariable.DB_CERT_PATH))
      ),
    },
    user: getEnvVarRequired(EnvironmentVariable.DB_USER),
  },
  dialect: 'postgresql',
  migrations: {
    prefix: 'supabase',
  },
  out: './src/drizzle/migrations',
  schema: 'src/drizzle/public/schema.ts',
  schemaFilter: ['public'],
});
