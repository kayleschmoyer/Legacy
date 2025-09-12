import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { resolve } from 'path';
import { getDatabaseConfig } from './src/config/database';

// Load environment variables from the workspace root
config({ path: resolve(__dirname, '../../.env') });

const dbConfig = getDatabaseConfig();

export default defineConfig({
  dbCredentials: dbConfig,
  dialect: 'postgresql',
  migrations: {
    prefix: 'supabase',
  },
  out: './src/drizzle/migrations/public',
  schema: 'src/drizzle/public/schema.ts',
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});
