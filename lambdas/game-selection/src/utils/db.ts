import { PublicDb, runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';

/**
 * Execute database operations with automatic connection management.
 * Replaces the previous memoizeOne pattern for consistent architecture.
 *
 * @param callback - Function that receives the database client
 * @returns Result of the callback function
 */
export async function withDb<T>(
  callback: (db: PublicDb) => Promise<T>,
): Promise<T> {
  return await runWithPublicClient(getDbOptions(), callback);
}
