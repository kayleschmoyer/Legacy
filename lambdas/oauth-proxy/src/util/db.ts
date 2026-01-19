import { InternalDb, runWithInternalClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';

export interface DbCredentials {
  dbUser: string;
  dbPassword: string;
  dbHost: string;
}

/**
 * Execute database operations with automatic connection management.
 * Replaces the previous memoizeOne pattern for consistent architecture.
 *
 * @param callback - Function that receives the database client
 * @returns Result of the callback function
 */
export async function withDbClient<T>(
  callback: (db: InternalDb) => Promise<T>,
): Promise<T> {
  return await runWithInternalClient(getDbOptions(), callback);
}
