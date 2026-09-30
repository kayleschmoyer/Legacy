import { LOGGER } from '@legacy-sports/logging';
import { invalidateSecretCache } from '@legacy-sports/aws-utils';
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

// Connection cache. Two environments reuse connections rather than opening one
// per call:
//
//  - development: prevents pool exhaustion during hot reload.
//  - AWS Lambda: an execution environment serves many invocations, and opening
//    a fresh pool for each one meant every request paid a Secrets Manager
//    credential resolve plus a TCP/TLS connect — 625 ms on the oauth-proxy hot
//    path (LS-9530). Reusing the module-scope connection is the standard Lambda
//    pattern; correctness across freeze/thaw rests on the `select 1 + 1` health
//    check below, which evicts and retries on a connection severed while the
//    container was frozen.
//
// Everywhere else (CLI, scripts, migrations, jest) keeps the original
// open-and-close behaviour, so no long-lived handle can keep a process alive.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic cache for any schema type
const connectionCache = new Map<string, BaseDbConnection<any>>();
const isDevelopment = process.env.NODE_ENV === 'development';
const isLambda = Boolean(
  process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT,
);

/** Whether this process should keep connections open between calls. */
function shouldReuseConnection(): boolean {
  return isDevelopment || isLambda;
}

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

// Stable per-schema ids for the cache key. The connection carries the drizzle
// `schema` that powers the relational query API (`db.query.<table>`), so a
// cache keyed on connection type alone would hand an internal-schema caller the
// public-schema connection that happened to be created first — leaving
// `db.query` without the requested tables. Only development ever reused
// connections before LS-9530, and it rarely touches both schemas in one
// process; Lambda does, so the schema has to be part of the key.
const schemaIds = new WeakMap<object, number>();
let nextSchemaId = 0;

function getSchemaId(schema: object): number {
  let id = schemaIds.get(schema);
  if (id === undefined) {
    id = nextSchemaId++;
    schemaIds.set(schema, id);
  }
  return id;
}

function getCacheKey(options: DbOptions, schema: object): string {
  const base =
    options.type === 'pg-local'
      ? `${options.type}-${options.dbCertPath}`
      : options.type;
  return `${base}#${getSchemaId(schema)}`;
}

export function getPublicDbConnection(
  options: DbOptions,
): BaseDbConnection<typeof PublicSchema> {
  return getDbConnection(options, PublicSchema);
}

function createConnection<TSchema extends Record<string, unknown>>(
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

export function getDbConnection<TSchema extends Record<string, unknown>>(
  options: DbOptions,
  schema: TSchema,
): BaseDbConnection<TSchema> {
  // Development and Lambda reuse a cached connection; see connectionCache.
  if (shouldReuseConnection()) {
    const cacheKey = getCacheKey(options, schema);
    let connection = connectionCache.get(cacheKey);

    if (!connection) {
      LOGGER.debug(`Creating new cached connection: ${cacheKey}`);
      connection = createConnection(options, schema);
      connectionCache.set(cacheKey, connection);
    } else {
      LOGGER.debug(`Reusing cached connection: ${cacheKey}`);
    }

    // Safe cast: the cache key includes the schema identity, so an entry is
    // only ever returned to a caller that asked for that same schema object.
    return connection as BaseDbConnection<TSchema>;
  }

  // Everywhere else: a fresh connection per call, closed when the call ends.
  return createConnection(options, schema);
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

// Socket-level failures that carry no SQLSTATE. A pooled connection reused
// across Lambda freeze/thaw can be severed while the container is suspended —
// by the RDS idle timeout, a NAT idle timeout, or a failover — and node-postgres
// surfaces that as a plain Error or a libuv errno rather than a Postgres code.
// The `select 1 + 1` health check in runWithClient is what trips these, before
// the caller's query runs, so they are safe to recover from by discarding the
// connection and reconnecting. See LS-9530.
const TRANSIENT_ERROR_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT']);
const TRANSIENT_ERROR_MESSAGES = [
  'Connection terminated unexpectedly',
  'Connection terminated',
  'Client has encountered a connection error and is not queryable',
  'server closed the connection unexpectedly',
  'read ECONNRESET',
];

// Postgres rejects the *credentials*, not the connection. Distinguished from
// the transient codes because recovery needs the cached secret dropped as well
// as the connection: it is what a credential rotation looks like from here when
// the rotated value is still inside the secret cache's TTL (LS-9530).
const AUTH_FAILURE_PG_CODES = new Set([
  '28P01', // invalid_password
  '28000', // invalid_authorization_specification
]);

const MAX_QUERY_RETRIES = 2;
const RETRY_DELAY_BASE_MS = 100;

/** Walk the err → err.cause chain, applying `predicate` to each link. */
function findInCauseChain<T>(
  err: unknown,
  predicate: (error: Error) => T | undefined,
): T | undefined {
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const hit = predicate(current);
    if (hit !== undefined) return hit;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return undefined;
}

// Walk err → err.cause → … and return the first transient SQLSTATE code found.
function extractTransientPgCode(err: unknown): string | undefined {
  return findInCauseChain(err, (error) => {
    const code = (error as Error & { code?: unknown }).code;
    return typeof code === 'string' && TRANSIENT_PG_CODES.has(code)
      ? code
      : undefined;
  });
}

/** True when the error is a severed/unusable socket rather than a query fault. */
function isTransientConnectionError(err: unknown): boolean {
  return (
    findInCauseChain(err, (error) => {
      const code = (error as Error & { code?: unknown }).code;
      if (typeof code === 'string' && TRANSIENT_ERROR_CODES.has(code)) {
        return true;
      }
      return TRANSIENT_ERROR_MESSAGES.some((message) =>
        error.message.includes(message),
      )
        ? true
        : undefined;
    }) ?? false
  );
}

// node-postgres's pool throws this plain Error (no SQLSTATE code) when
// `connectionTimeoutMillis` elapses waiting for a free client — i.e. the pool
// is exhausted by concurrent queries within a single request (e.g. several
// DataLoader batches resolving in parallel). Drizzle wraps it in a
// DrizzleQueryError with the original error preserved on `.cause`. See LS-8478.
//
// This can happen during runWithClient's own `select 1 + 1` health check —
// acquiring a client for the health check competes for the same pool as
// every other concurrent query — so runWithClient's retry loop below treats
// it as recoverable too, not just withPoolTimeoutRetry's post-connect
// query-level retries. See LS-10037 (items 253/259: the health check itself
// failing with this exact message under concurrent load).
const POOL_CONNECTION_TIMEOUT_MESSAGE =
  'timeout exceeded when trying to connect';

/** True when the pool's own connectionTimeoutMillis elapsed waiting for a client. */
function isPoolTimeoutError(err: unknown): boolean {
  return (
    findInCauseChain(err, (error) =>
      error.message === POOL_CONNECTION_TIMEOUT_MESSAGE ? true : undefined,
    ) ?? false
  );
}

/** True when Postgres rejected the credentials we connected with. */
function isAuthFailure(err: unknown): boolean {
  return (
    findInCauseChain(err, (error) => {
      const code = (error as Error & { code?: unknown }).code;
      return typeof code === 'string' && AUTH_FAILURE_PG_CODES.has(code)
        ? true
        : undefined;
    }) ?? false
  );
}

// LS-10196: in-flight users per connection, and connections awaiting close.
const inFlightUsers = new WeakMap<object, number>();
const discardedConnections = new WeakSet<object>();

/**
 * Open a database connection, run `callback`, and close the connection.
 *
 * Retries up to MAX_QUERY_RETRIES times on transient Aurora connection errors
 * (SQLSTATE 08xxx / 57Pxx), a severed socket (ECONNRESET etc., LS-9530), or
 * the pg pool's own connection-timeout message when a burst of concurrent
 * requests exhausts the pool while this call is still acquiring its client
 * for the `select 1 + 1` health check below (LS-10037). All three signal
 * that the TCP connection was severed or never established *before* any
 * write reached the server, so the server-side transaction was never opened
 * and a retry is unconditionally safe.
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
  const reuseConnection = shouldReuseConnection();

  for (let attempt = 0; attempt <= MAX_QUERY_RETRIES; attempt++) {
    const connection: BaseDbConnection<TSchema> = getDbConnection(
      options,
      schema,
    );

    let initializationFailed = false;
    let recoverableError = false;

    // LS-10196: a cached connection is shared by every concurrent runWithClient
    // call (and by their still-running queries). Track users so a call that
    // discards the connection cannot end the pool under its siblings.
    inFlightUsers.set(connection, (inFlightUsers.get(connection) ?? 0) + 1);

    try {
      // Only initialize if not already initialized (important for cached connections)
      if (!connection.isInitialized) {
        LOGGER.debug('Initializing connection');
        await connection.initialize();
      } else {
        LOGGER.debug('Using already initialized connection');
      }

      LOGGER.debug('authorizing...');

      // Health check. On a reused connection this is also what detects a socket
      // that died while the container was frozen, before the caller's query
      // runs — which is why recovery below is safe (LS-9530).
      await connection.db.execute(sql`select 1 + 1`);

      LOGGER.debug('initializing models');

      return await callback(connection.db);
    } catch (err) {
      // If initialization failed, mark it so we clean up even when reusing
      if (!connection.isInitialized) {
        initializationFailed = true;
      }
      const pgCode = extractTransientPgCode(err);
      const authFailure = isAuthFailure(err);
      recoverableError =
        pgCode !== undefined ||
        isTransientConnectionError(err) ||
        isPoolTimeoutError(err) ||
        authFailure;

      if (authFailure) {
        // Almost certainly a credential rotation that happened inside the
        // secret cache's TTL: drop the cached value so the reconnect below
        // resolves the rotated credentials instead of replaying the stale ones.
        // Scoped to the database secret — other cached secrets are unrelated to
        // a Postgres auth rejection and should keep their TTL.
        const dbSecretName =
          process.env.DB_SECRET_NAME ?? process.env.DB_CREDS_PATH;
        LOGGER.warn(
          'DB authentication failed — invalidating cached credentials and reconnecting',
          err instanceof Error ? err : new Error(String(err)),
        );
        invalidateSecretCache(dbSecretName);
      }

      if (recoverableError && attempt < MAX_QUERY_RETRIES) {
        const delayMs = RETRY_DELAY_BASE_MS * (attempt + 1);
        LOGGER.warn(
          `Recoverable DB connection error (pgCode=${pgCode ?? 'none'}), retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_QUERY_RETRIES})`,
          err instanceof Error ? err : new Error(String(err)),
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        // Falls through to finally for cleanup; loop continues with a fresh connection
      } else {
        throw err;
      }
    } finally {
      // Close (and evict from the cache) whenever the connection cannot be
      // trusted for the next call, so the following iteration — or the next
      // invocation — always starts from a fresh one.
      const remainingUsers = (inFlightUsers.get(connection) ?? 1) - 1;
      if (remainingUsers > 0) {
        inFlightUsers.set(connection, remainingUsers);
      } else {
        inFlightUsers.delete(connection);
      }

      if (!reuseConnection || initializationFailed || recoverableError) {
        if (reuseConnection) {
          // Evict now so new callers get a fresh connection, but only if the
          // slot still holds this connection (a sibling may have replaced it).
          const cacheKey = getCacheKey(options, schema);
          if (connectionCache.get(cacheKey) === connection) {
            connectionCache.delete(cacheKey);
          }
        }
        discardedConnections.add(connection);
      } else {
        LOGGER.debug('Keeping connection open for reuse');
      }

      // Close a discarded connection only once its last in-flight user is done;
      // ending the pool earlier fails siblings with "Cannot use a pool after
      // calling end on the pool".
      if (remainingUsers === 0 && discardedConnections.has(connection)) {
        discardedConnections.delete(connection);
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
    // Reaches here only when: recoverableError=true AND attempt < MAX_QUERY_RETRIES
    // Next loop iteration fetches a fresh connection via getDbConnection
  }

  // Unreachable: every iteration either returns (success) or throws (non-transient
  // error, or last-attempt transient error). TypeScript cannot prove this statically.
  throw new Error(
    'runWithClient: retry loop exhausted without return or throw',
  );
}

const MAX_POOL_TIMEOUT_RETRIES = 2;
const POOL_TIMEOUT_RETRY_DELAY_BASE_MS = 150;

// True for a burst-of-concurrent-load failure worth retrying: either the
// pool's own connectionTimeoutMillis message, or a severed-socket error
// (ECONNRESET etc. — see isTransientConnectionError/LS-9530) on a query that
// runs against an already-initialized, reused connection later in the same
// request. Those don't go through runWithClient's own retry loop again —
// that loop only wraps the initial connect + health check for a given
// runWithClient call — so a query fired directly against context.db (or
// inside a DataLoader batch sharing it) needs its own retry here. See
// LS-10058, where a burst of concurrent DataLoader batches produced
// "read ECONNRESET" rather than the pool-timeout message on the exact same
// call site the pool-timeout message hits under lighter contention.
function isRetryableConcurrencyError(err: unknown): boolean {
  return isPoolTimeoutError(err) || isTransientConnectionError(err);
}

/**
 * Run `queryFn`, retrying with backoff if it fails because of a transient
 * condition caused by a burst of concurrent queries sharing a small
 * per-request connection pool — either the pool's `connectionTimeoutMillis`
 * elapsing before a client became free, or the underlying socket being
 * severed under that same contention. A short delay gives in-flight queries
 * time to release their connection, after which a retry typically succeeds.
 *
 * Any other error (including real Postgres failures) is rethrown immediately.
 */
export async function withPoolTimeoutRetry<T>(
  queryFn: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_POOL_TIMEOUT_RETRIES; attempt++) {
    try {
      return await queryFn();
    } catch (err) {
      if (
        isRetryableConcurrencyError(err) &&
        attempt < MAX_POOL_TIMEOUT_RETRIES
      ) {
        const delayMs = POOL_TIMEOUT_RETRY_DELAY_BASE_MS * (attempt + 1);
        const reason = isPoolTimeoutError(err)
          ? 'pool exhausted'
          : 'severed connection under load';
        LOGGER.warn(
          `DB concurrency-related connection error (${reason}), retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_POOL_TIMEOUT_RETRIES})`,
          err instanceof Error ? err : new Error(String(err)),
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  // Unreachable: every iteration either returns or throws.
  throw new Error(
    'withPoolTimeoutRetry: retry loop exhausted without return or throw',
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
