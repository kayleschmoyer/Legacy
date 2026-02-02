import { LOGGER } from '@legacy-sports/logging';
import { sql } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils';
import { PgDbConnection } from './abstract/PgDbConnection';
import { BaseDbConnection, GenericDatabase } from './abstract/BaseDbClient';
import { PublicDb } from './PublicDbClient';
import { InternalDb } from './InternalDbClient';
import * as PublicSchema from '../../drizzle/public/schema';
import * as InternalSchema from '../../drizzle/internal/schema';

// Export GenericDatabase type for external use
export type { GenericDatabase } from './abstract/BaseDbClient';

// Connection cache for development mode to prevent exhaustion during hot reload
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic cache for any schema type
const connectionCache = new Map<string, BaseDbConnection<any>>();
const isDevelopment = process.env.NODE_ENV === 'development';

// Log pool stats periodically in development
if (isDevelopment) {
  setInterval(() => {
    if (connectionCache.size > 0) {
      LOGGER.debug(`Active cached connections: ${connectionCache.size}`);
    }
  }, 30000); // Every 30 seconds
}

// Cleanup handler for graceful shutdown in dev mode
if (isDevelopment) {
  const cleanup = async () => {
    LOGGER.info('Closing cached database connections...');
    for (const [key, connection] of connectionCache.entries()) {
      try {
        await connection.close();
        connectionCache.delete(key);
      } catch (err) {
        LOGGER.error(`Failed to close connection ${key}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  // Wrap async cleanup in void to satisfy @typescript-eslint/no-misused-promises
  process.on('SIGTERM', () => void cleanup());
  process.on('SIGINT', () => void cleanup());
}

function getCacheKey(options: DbOptions): string {
  if (options.type === 'pg-local') {
    return `${options.type}-${options.dbCertPath}`;
  }
  return options.type;
}

export function getPublicDbConnection(
  options: DbOptions,
): BaseDbConnection<typeof PublicSchema> {
  return getDbConnection(options, PublicSchema);
}

export function getDbConnection<TSchema extends Record<string, unknown>>(
  options: DbOptions,
  schema: TSchema,
): BaseDbConnection<TSchema> {
  // In development, use cached connection to prevent exhaustion
  if (isDevelopment) {
    const cacheKey = getCacheKey(options);
    let connection = connectionCache.get(cacheKey);

    if (!connection) {
      LOGGER.debug(`Creating new cached connection: ${cacheKey}`);
      switch (options.type) {
        case 'pg-local':
          connection = new PgDbConnection(options.dbCertPath, schema);
          break;
        case 'pg-remote':
          connection = new PgDbConnection(undefined, schema);
          break;
        default:
          throw new Error('Invalid connection type');
      }
      connectionCache.set(cacheKey, connection);
    } else {
      LOGGER.debug(`Reusing cached connection: ${cacheKey}`);
    }

    // Safe cast: we know the connection uses the same schema type
    return connection as BaseDbConnection<TSchema>;
  }

  // In Lambda, create new connection each time (will use module-level singleton)
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

  let initializationFailed = false;

  try {
    // Only initialize if not already initialized (important for cached connections)
    if (!connection.isInitialized) {
      LOGGER.debug('Initializing connection');
      await connection.initialize();
    } else {
      LOGGER.debug('Using already initialized connection');
    }

    LOGGER.debug('authorizing...');

    await connection.db.execute(sql`select 1 + 1`);

    LOGGER.debug('initializing models');

    return await callback(connection.db);
  } catch (err) {
    // If initialization failed, mark it so we clean up even in dev mode
    if (!connection.isInitialized) {
      initializationFailed = true;
    }
    throw err;
  } finally {
    // In development with caching, don't close the connection UNLESS initialization failed
    if (!isDevelopment || initializationFailed) {
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
    } else {
      LOGGER.debug('Keeping connection open (dev mode)');
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
