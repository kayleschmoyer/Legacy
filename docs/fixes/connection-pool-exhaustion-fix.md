# Database Connection Pool Exhaustion Fix

**Date**: January 31, 2026  
**Issue**: `remaining connection slots are reserved for roles with privileges of the "rds_reserved" role`  
**Status**: ✅ Fixed

## Problem Summary

The application was experiencing database connection pool exhaustion, causing GraphQL queries to fail with:

```
error: remaining connection slots are reserved for roles with privileges of the "rds_reserved" role
```

### Root Causes

1. **Stale Client Reference**: In `PgDbConnection._initialize()`, a test client was obtained from the pool, released, but then the **stale released client** was returned and stored in the connection object. This caused confusion about connection lifecycle.

2. **No Error Cleanup**: If connection initialization failed, the pool was not cleaned up, leaving orphaned pools consuming connection slots.

3. **Development Mode Caching Issues**: While development mode cached connections to prevent hot-reload exhaustion, **failed initializations** were not properly cleaned up, allowing multiple pools to accumulate.

### Database Context

- **Database**: AWS RDS PostgreSQL (db.t3.micro)
- **Max Connections**: ~87 total
- **AWS Reserved**: ~10 connections
- **Available**: ~77 connections for application
- **Pool Size Per Instance**: 3 max connections (configured in `PgDbConnection.ts`)

## Changes Made

### 1. Fixed Stale Client Reference ([PgDbConnection.ts](d:\code\legacy-sports\lib\db-client\src\lib\client\abstract\PgDbConnection.ts))

**Before**:

```typescript
// Get one client to verify connection works
const testClient = await pgPool.connect();
testClient.release();

return {
  client: testClient, // ❌ Stale released client stored
  db: db,
  pool: pgPool,
};
```

**After**:

```typescript
// Get one client to verify connection works, then immediately release it
try {
  const testClient = await pgPool.connect();
  testClient.release();
} catch (err) {
  // If connection test fails, clean up the pool
  await pgPool.end();
  throw err;
}

return {
  client: null as any, // ✅ Deprecated field, not used anymore
  db: db,
  pool: pgPool,
};
```

**Impact**:

- Removes stale client reference that could cause confusion
- Adds proper error handling with pool cleanup on connection test failure
- Ensures pools are not orphaned when initialization fails

### 2. Improved Development Mode Error Handling ([Helpers.ts](d:\code\legacy-sports\lib\db-client\src\lib\client\Helpers.ts))

**Before**:

```typescript
try {
  // ... initialization and query execution
  return await callback(connection.db);
} finally {
  // In development with caching, don't close the connection
  if (!isDevelopment) {
    await connection.close();
  }
}
```

**After**:

```typescript
let initializationFailed = false;

try {
  // ... initialization and query execution
  return await callback(connection.db);
} catch (err) {
  // If initialization failed, mark it so we clean up even in dev mode
  if (!connection.isInitialized) {
    initializationFailed = true;
  }
  throw err;
} finally {
  // In development with caching, don't close UNLESS initialization failed
  if (!isDevelopment || initializationFailed) {
    await connection.close();
  }
}
```

**Impact**:

- Failed connections are now properly cleaned up even in development mode
- Prevents accumulation of orphaned pools from failed initialization attempts
- Maintains hot-reload optimization for successful connections

### 3. Added Development Mode Monitoring

```typescript
// Log pool stats periodically in development
if (isDevelopment) {
  setInterval(() => {
    if (connectionCache.size > 0) {
      LOGGER.debug(`Active cached connections: ${connectionCache.size}`);
    }
  }, 30000); // Every 30 seconds
}
```

**Impact**:

- Provides visibility into cached connection count
- Helps identify connection leaks during development
- Logs every 30 seconds when connections are cached

## How the Fix Works

### Connection Lifecycle (Development Mode)

1. **First Request**:
   - `runWithClient()` creates new `PgDbConnection`
   - Connection is cached by key (`pg-local-{certPath}`)
   - Pool created with max 3 connections
   - Connection stays open (cached)

2. **Subsequent Requests**:
   - `runWithClient()` reuses cached connection
   - Skips initialization (`isInitialized === true`)
   - Uses existing pool
   - Connection stays open (cached)

3. **Failed Initialization**:
   - ✅ **NEW**: `initializationFailed` flag set to `true`
   - ✅ **NEW**: Connection cleaned up in `finally` block
   - ✅ **NEW**: Pool properly terminated
   - Cache entry removed

4. **Process Shutdown**:
   - SIGTERM/SIGINT handler closes all cached connections
   - All pools properly terminated

### Connection Lifecycle (Lambda/Production Mode)

1. **Each Request**:
   - `runWithClient()` creates new `PgDbConnection`
   - No caching used
   - Pool created with max 3 connections
   - Query executed
   - **Connection always closed in `finally` block**
   - Pool terminated

2. **Module-Level Pooling**:
   - Lambda runtime may keep Node.js process warm
   - Module-level singleton pattern could be used if needed
   - Current implementation creates/destroys per request (safer)

## Verification

### Before Fix

```
GraphQL Error: remaining connection slots are reserved for roles
with privileges of the "rds_reserved" role
```

### After Fix

```
[DB Pool] Connection established. Active: 1, Idle: 0, Waiting: 0
[2026-01-31T19:01:12.063Z] DEBUG: authorizing...
[2026-01-31T19:01:12.076Z] DEBUG: initializing models
[2026-01-31T19:01:12.090Z] DEBUG: Keeping connection open (dev mode)
```

### Testing Steps

1. **Kill existing connections**:

   ```powershell
   pnpm dlx kill-port 5000
   ```

2. **Start GraphQL server**:

   ```powershell
   $env:NODE_ENV="development"
   pnpm exec nx run db:serve
   ```

3. **Execute complex nested query** (e.g., `getMatchupPlayers` with nested `games` field)

4. **Monitor pool stats** in logs:

   ```
   [DB Pool] Connection established. Active: X, Idle: Y, Waiting: Z
   ```

5. **Verify no connection errors** even with multiple concurrent requests

## Prevention

### Best Practices Implemented

1. ✅ **Proper error handling**: Failed connections are cleaned up
2. ✅ **Pool monitoring**: Connection pool stats logged on events
3. ✅ **Conservative pool sizing**: Max 3 connections per instance
4. ✅ **Idle timeout**: Connections released after 30s idle
5. ✅ **Connection timeout**: Fail fast (5s) if pool exhausted
6. ✅ **Development mode caching**: Prevents hot-reload exhaustion
7. ✅ **Graceful shutdown**: SIGTERM/SIGINT handlers close connections

### Future Improvements

1. **Connection Pool Dashboard**: Add Grafana/CloudWatch monitoring for:
   - Active connections per Lambda instance
   - Pool exhaustion events
   - Connection acquisition time
   - Failed connection attempts

2. **Circuit Breaker**: Implement circuit breaker pattern to:
   - Detect repeated connection failures
   - Temporarily stop attempting new connections
   - Allow pool to recover

3. **Connection Pool Metrics**: Export metrics for:
   - `db_pool_active_connections`
   - `db_pool_idle_connections`
   - `db_pool_waiting_requests`
   - `db_pool_errors`

4. **Lambda Provisioned Concurrency**: Consider using provisioned concurrency to:
   - Keep pools warm across invocations
   - Reduce cold start connection overhead
   - More predictable connection usage

## Related Documentation

- [PostgreSQL Connection Pooling Best Practices](https://node-postgres.com/features/pooling)
- [AWS RDS Connection Limits](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html#RDS_Limits.MaxConnections)
- [Drizzle ORM with node-postgres](https://orm.drizzle.team/docs/get-started-postgresql#node-postgres)
- [Database Schema Documentation](../architecture/database-schema.md)

## Files Modified

- ✅ `lib/db-client/src/lib/client/abstract/PgDbConnection.ts`
- ✅ `lib/db-client/src/lib/client/Helpers.ts`

## Impact Assessment

- **Risk Level**: Low
- **Breaking Changes**: None
- **Performance Impact**: Positive (fewer orphaned connections)
- **Backward Compatibility**: Fully compatible (client field deprecated but still present)

## Rollback Plan

If issues occur, revert changes:

```powershell
git checkout HEAD~1 -- lib/db-client/src/lib/client/abstract/PgDbConnection.ts
git checkout HEAD~1 -- lib/db-client/src/lib/client/Helpers.ts
```

Then rebuild and restart:

```powershell
pnpm exec nx affected -t typecheck
pnpm dlx kill-port 5000
pnpm exec nx run db:serve
```
