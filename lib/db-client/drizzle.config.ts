import type { Config } from 'drizzle-kit';

// Load environment variables
import 'dotenv/config';

export default {
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
} satisfies Config;
