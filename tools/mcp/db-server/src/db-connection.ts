import { config } from 'dotenv';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { getRepoRoot } from './run-command.js';

// Load .env from the repo root
config({ path: resolve(getRepoRoot(), '.env') });

let sqlInstance: postgres.Sql | null = null;

/** Get a lazily-initialized postgres connection using DATABASE_URL from .env. */
export function getSql(): postgres.Sql {
  if (sqlInstance) return sqlInstance;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Ensure .env exists in the repo root with a valid DATABASE_URL.',
    );
  }

  sqlInstance = postgres(url, { max: 3 });
  return sqlInstance;
}

/** Close the database connection pool. */
export async function closeSql(): Promise<void> {
  if (sqlInstance) {
    await sqlInstance.end();
    sqlInstance = null;
  }
}
