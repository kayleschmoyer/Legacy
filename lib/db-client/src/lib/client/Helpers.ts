import { LOGGER } from '@legacy-sports/logging';
import { sql } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils';
import { PgDbConnection } from './abstract/PgDbConnection';
import { BaseDbConnection, GenericDatabase } from './abstract/BaseDbClient';
import { PublicDb } from './PublicDbClient';
import { InternalDb } from './InternalDbClient';
import * as PublicSchema from '../../drizzle/public/schema';
import * as InternalSchema from '../../drizzle/internal/schema';

export function getPublicDbConnection(
  options: DbOptions,
): BaseDbConnection<typeof PublicSchema> {
  return getDbConnection(options, PublicSchema);
}

export function getDbConnection<TSchema extends Record<string, unknown>>(
  options: DbOptions,
  schema: TSchema,
): BaseDbConnection<TSchema> {
  switch (options.type) {
    case 'pg-local':
      return new PgDbConnection(options.dbCertPath, schema);
    case 'pg-remote':
      return new PgDbConnection(undefined, schema);
    default:
      throw new Error('Invalid connection type');
  }
}

export async function runWithClient<T, TSchema extends Record<string, unknown>>(
  options: DbOptions,
  schema: TSchema,
  callback: (client: GenericDatabase<TSchema>) => Promise<T>,
): Promise<T> {
  const connection: BaseDbConnection<TSchema> = getDbConnection(
    options,
    schema,
  );

  try {
    LOGGER.debug('Initializing');
    await connection.initialize();

    LOGGER.debug('authorizing...');

    await connection.db.execute(sql`select 1 + 1`);

    LOGGER.debug('initializing models');

    return await callback(connection.db);
  } finally {
    try {
      LOGGER.debug('Disconnecting client');
      await connection.close();
      LOGGER.debug('Client disconnected');
    } catch (err) {
      LOGGER.debug('Could not disconnect client');
      if (err instanceof Error) {
        LOGGER.debug(err.message);
      }
    }
  }
}

export function runWithPublicClient<T>(
  options: DbOptions,
  callback: (client: PublicDb) => Promise<T>,
): Promise<T> {
  return runWithClient(options, PublicSchema, callback);
}

export function runWithInternalClient<T>(
  options: DbOptions,
  callback: (client: InternalDb) => Promise<T>,
): Promise<T> {
  return runWithClient(options, InternalSchema, callback);
}
