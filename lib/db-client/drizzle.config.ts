import { defineConfig } from '@drepkovsky/drizzle-migrations';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Load environment variables
import 'dotenv/config';

export default defineConfig({
  schema: [
    './src/drizzle/public/schema.ts',
    './src/drizzle/internal/schema.ts',
  ],
  out: './migrations',
  dialect: 'postgresql',
  // Use environment variables for drizzle-kit commands
  // The migration runner script handles AWS Secrets Manager for actual migrations
  dbCredentials: {
    host: process.env.DB_HOST_DIRECT || process.env.DB_HOST || 'localhost',
    port: 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'postgres',
    ssl: process.env.DB_SSL === 'true',
  },
  schemaFilter: ['public', 'app_internal'],

  // Enhanced configuration for rollback migrations
  migrations: {
    schema: 'drizzle', // Use drizzle schema for migration tracking (matches existing)
    table: '__drizzle_migrations',
  },

  // Define database client for migrations
  getMigrator: async () => {
    const host =
      process.env.DB_HOST_DIRECT || process.env.DB_HOST || 'localhost';
    const port = 5432;
    const user = process.env.DB_USER || 'postgres';
    const password = process.env.DB_PASSWORD || '';
    const database =
      process.env.DB_NAME || process.env.DB_DATABASE || 'postgres';
    const ssl = process.env.DB_SSL === 'true';

    const connectionString = `postgresql://${user}:${password}@${host}:${port}/${database}${ssl ? '?sslmode=require' : ''}`;

    const migrationClient = postgres(connectionString, {
      max: 1, // Use single connection for migrations
    });

    return Promise.resolve(drizzle(migrationClient));
  },
});
