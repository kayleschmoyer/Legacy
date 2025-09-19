import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { resolve } from 'path';
import { getDatabaseConfigSync } from './src/config/database';

// Load environment variables from the workspace root
config({ path: resolve(__dirname, '../../.env') });

const dbConfig = getDatabaseConfigSync();

export default defineConfig({
  dbCredentials: dbConfig,
  dialect: 'postgresql',
  migrations: {
    prefix: 'supabase',
  },
  out: './src/drizzle/migrations/internal',
  schema: 'src/drizzle/internal/schema.ts',
  schemaFilter: ['app_internal'],
  verbose: true,
  strict: true,
});
