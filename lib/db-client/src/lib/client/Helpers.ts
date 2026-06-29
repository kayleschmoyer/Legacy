import { LOGGER } from '@legacy-sports/logging';
import { sql } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils/node';
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
        LOGGER.error(
          `Failed to close connection ${key}`,
          err instanceof Error ? err : new Error(String(err)),
        );
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

// Postgres SQLSTATE codes that indicate a transient connection failure safe to
// retry. These arise from Aurora scaling events, mid-session connection recycling,
// or brief network blips. Because no write has been committed when these fire,
// retrying the full runWithClient cycle (new connection → health-check → callback)
// is safe. See LS-8001.
const TRANSIENT_PG_CODES = new Set([
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '57P01', // admin_shutdown  — Aurora replica restart / scale-down
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now — Aurora cold-resume
]);

const MAX_QUERY_RETRIES = 2;
const RETRY_DELAY_BASE_MS = 100;

// Walk err → err.cause → … and return the first transient SQLSTATE code found.
function extractTransientPgCode(err: unknown): string | undefined {
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === 'string' && TRANSIENT_PG_CODES.has(code)) return code;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Open a database connection, run `callback`, and close the connection.
 *
 * Retries up to MAX_QUERY_RETRIES times on transient Aurora connection errors
 * (SQLSTATE 08xxx / 57Pxx). These codes signal that the TCP connection was
 * severed *before* any write reached the server, so the server-side transaction
 * was never opened and a retry is unconditionally safe.
 *
 * **Idempotency contract:** because the callback may execute more than once,
 * callers must ensure it is idempotent (e.g. upserts rather than blind
 * INSERTs, or operations guarded by a unique constraint). A callback that
 * performs a non-idempotent write and encounters a transient error will see
 * that write retried.
 */
export async function runWithClient<T, TSchema extends Record<string, unknown>>(
  options: DbOptions,
  schema: TSchema,
  callback: (client: GenericDatabase<TSchema>) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_QUERY_RETRIES; attempt++) {
    const connection: BaseDbConnection<TSchema> = getDbConnection(
      options,
      schema,
    );

    let initializationFailed = false;
    let transientError = false;

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
      const pgCode = extractTransientPgCode(err);
      transientError = pgCode !== undefined;
      if (transientError && attempt < MAX_QUERY_RETRIES) {
        const delayMs = RETRY_DELAY_BASE_MS * (attempt + 1);
        LOGGER.warn(
          `Transient DB connection error (pgCode=${pgCode}), retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_QUERY_RETRIES})`,
          err instanceof Error ? err : new Error(String(err)),
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        // Falls through to finally for cleanup; loop continues with a fresh connection
      } else {
        throw err;
      }
    } finally {
      // Force-close (and evict from dev-mode cache) on any transient error so
      // the next iteration always starts with a fresh connection.
      if (!isDevelopment || initializationFailed || transientError) {
        try {
          LOGGER.debug('Disconnecting client');
          await connection.close();
          if (isDevelopment && transientError) {
            connectionCache.delete(getCacheKey(options));
          }
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
    // Reaches here only when: transientError=true AND attempt < MAX_QUERY_RETRIES
    // Next loop iteration fetches a fresh connection via getDbConnection
  }

  // Unreachable: every iteration either returns (success) or throws (non-transient
  // error, or last-attempt transient error). TypeScript cannot prove this statically.
  throw new Error(
    'runWithClient: retry loop exhausted without return or throw',
  );
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
