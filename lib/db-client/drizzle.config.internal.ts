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
      ca: readFileSync(resolve(__dirname, '../../certs/us-east-1-bundle.pem')),
    },
    user: getEnvVarRequired(EnvironmentVariable.DB_USER),
  },
  dialect: 'postgresql',
  migrations: {
    prefix: 'supabase',
  },
  out: './src/drizzle/internal',
  schema: 'src/drizzle/internal/schema.ts',
  schemaFilter: ['app_internal'],
});
