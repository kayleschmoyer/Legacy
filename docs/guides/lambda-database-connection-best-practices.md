# AWS Lambda Database Connection Management - Best Practices

## Current Implementation Analysis

### What We Have Now ✅

- Connection pooling with `node-postgres` Pool
- Module-level caching in dev mode (via `Helpers.ts`)
- `callbackWaitsForEmptyEventLoop = false` in Lambda handler
- Pool configuration: max=2, min=0, idleTimeout=10s

### Issues Identified ⚠️

1. **No connection reuse across Lambda invocations** - Pool created inside function scope
2. **Architecture mismatch** - Connection pooling designed for long-running servers, not serverless
3. **Missed opportunity** - Not leveraging Lambda's frozen execution context for connection reuse

## Industry Best Practices for Lambda + PostgreSQL

### 1. **Module-Level Connection Singleton (Critical)**

**Problem**: Current implementation creates new connection pools on every Lambda invocation.

**Solution**: Initialize database connection **outside the handler** (module level) to survive across invocations.

#### Lambda Execution Context Lifecycle

```
Cold Start:  Module load → Handler execution
Warm Start:  (Reuse frozen state) → Handler execution
```

**Frozen state** (module-level variables) persists across warm invocations.

#### Implementation Pattern

```typescript
// ❌ WRONG: Current pattern (creates new connection every invocation)
export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const result = await runWithPublicClient(getDbOptions(), async (db) => {
    // Creates new Pool() every time!
    return await db.query.users.findMany();
  });

  return result;
};

// ✅ CORRECT: Module-level singleton pattern
import { Pool } from 'pg';

// Initialize OUTSIDE handler - survives across invocations
let dbPool: Pool | null = null;

function getOrCreatePool(): Pool {
  if (!dbPool) {
    console.log('[Lambda] Creating new database pool (cold start)');
    dbPool = new Pool({
      host: process.env.DB_HOST,
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: 1, // Lambda: single connection, not a pool
      idleTimeoutMillis: 60000, // Keep alive longer (frozen state)
    });
  } else {
    console.log('[Lambda] Reusing existing pool (warm start)');
  }

  return dbPool;
}

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const pool = getOrCreatePool(); // Reuses connection on warm starts!
  const db = drizzle(pool, { schema });

  const result = await db.query.users.findMany();

  // ⚠️ DO NOT close pool - keeps connection alive for next invocation
  return result;
};
```

### 2. **Optimal Pool Configuration for Lambda**

**Key Principle**: Lambda handles concurrency, not connection pooling.

```typescript
const poolConfig = {
  // Lambda best practice: 1 connection per instance
  max: 1, // NOT 2-10 like traditional servers
  min: 0, // Never keep idle connections

  // Lambda-specific timeouts
  idleTimeoutMillis: 60000, // Longer (frozen state preserves connection)
  connectionTimeoutMillis: 5000, // Fail fast

  // Don't use these Lambda anti-patterns:
  // ❌ allowExitOnIdle: true  // Defeats frozen state benefits
  // ❌ max: 2-10               // Lambda doesn't need pooling
};
```

#### Why max=1?

| Environment            | Concurrency Model                       | Pool Size  |
| ---------------------- | --------------------------------------- | ---------- |
| **Traditional Server** | Thread pool handles concurrent requests | max: 10-50 |
| **AWS Lambda**         | AWS scales instances for concurrency    | max: 1     |

Each Lambda instance handles **one request at a time**. AWS creates more instances for concurrent requests.

### 3. **AWS RDS Proxy (Production Recommendation)**

For production with many Lambda instances:

#### Without RDS Proxy

```
Lambda 1 (max:1) ─┐
Lambda 2 (max:1) ─┼─→ PostgreSQL (87 connections max)
Lambda 3 (max:1) ─┘
...
Lambda 87 (FAILS: connection exhaustion!)
```

#### With RDS Proxy ✅

```
Lambda 1─┐
Lambda 2─┼─→ RDS Proxy ─→ PostgreSQL
Lambda 3─┘   (handles pooling)
...
Lambda 1000+ (works!)
```

**Benefits**:

- Connection pooling managed by AWS
- Automatic failover and retry
- IAM authentication support
- Reduced Lambda cold start time

**Terraform Example**:

```hcl
resource "aws_db_proxy" "this" {
  name                   = "legacy-sports-proxy"
  engine_family          = "POSTGRESQL"
  auth {
    iam_auth = "REQUIRED"
  }

  role_arn               = aws_iam_role.proxy.arn
  vpc_subnet_ids         = aws_subnet.private[*].id
  require_tls            = true

  tags = {
    Environment = "production"
  }
}
```

### 4. **Unified Dev/Production Pattern**

Challenge: Different requirements for dev (long-running server) vs Lambda (ephemeral).

#### Recommended Architecture

```typescript
// lib/db-client/src/lib/client/ConnectionManager.ts

import { Pool, PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

// Module-level cache (survives across Lambda invocations)
let globalPool: Pool | null = null;

function isLambdaEnvironment(): boolean {
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.AWS_EXECUTION_ENV
  );
}

function getPoolConfig(): PoolConfig {
  const isLambda = isLambdaEnvironment();

  return {
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: 5432,

    // Environment-specific configuration
    max: isLambda ? 1 : 2, // Lambda: 1 connection; Dev: 2-3 for concurrency
    min: 0,
    idleTimeoutMillis: isLambda ? 60000 : 10000, // Lambda: longer; Dev: shorter

    ssl: {
      rejectUnauthorized: false, // AWS RDS
    },
  };
}

export function getOrCreateConnection(schema: any) {
  if (!globalPool) {
    const isLambda = isLambdaEnvironment();
    console.log(
      `[Connection Manager] Creating pool (${isLambda ? 'Lambda' : 'Dev'} mode)`,
    );

    globalPool = new Pool(getPoolConfig());

    // Monitoring
    globalPool.on('connect', () => {
      console.log(`[Pool] Connected. Active: ${globalPool!.totalCount}`);
    });

    globalPool.on('error', (err) => {
      console.error('[Pool] Unexpected error:', err);
    });

    // Dev mode only: cleanup on process exit
    if (!isLambda) {
      process.on('SIGTERM', () => globalPool?.end());
      process.on('SIGINT', () => globalPool?.end());
    }
  }

  return drizzle(globalPool, { schema });
}

// Usage in Lambda handler
export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const db = getOrCreateConnection(schema); // Reuses on warm starts!

  // Query database
  const users = await db.query.users.findMany();

  return { statusCode: 200, body: JSON.stringify(users) };
};
```

### 5. **Connection Health Checks**

Add health monitoring for long-lived connections:

```typescript
async function ensureConnectionHealth(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
  } catch (error) {
    console.error('[Pool] Health check failed, recreating pool');
    await pool.end();
    globalPool = null; // Force recreation on next request
    throw error;
  }
}

export async function getHealthyConnection(schema: any) {
  const pool = globalPool || new Pool(getPoolConfig());

  if (!globalPool) {
    globalPool = pool;
  }

  // Health check for warm starts (connection might be stale)
  await ensureConnectionHealth(pool);

  return drizzle(pool, { schema });
}
```

### 6. **Monitoring & Observability**

Key metrics to track:

```typescript
// Add CloudWatch custom metrics
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatch({});

async function logPoolMetrics(pool: Pool) {
  await cloudwatch.putMetricData({
    Namespace: 'LegacySports/Database',
    MetricData: [
      {
        MetricName: 'ActiveConnections',
        Value: pool.totalCount,
        Unit: 'Count',
      },
      {
        MetricName: 'IdleConnections',
        Value: pool.idleCount,
        Unit: 'Count',
      },
      {
        MetricName: 'WaitingClients',
        Value: pool.waitingCount,
        Unit: 'Count',
      },
    ],
  });
}
```

## Migration Path

### Phase 1: Minimal Changes (Immediate)

1. Move connection creation outside handler (module level)
2. Change pool config: `max: 1` for Lambda
3. Add connection reuse logging

### Phase 2: Short-term (1-2 weeks)

1. Implement environment-aware connection manager
2. Add health checks for warm starts
3. Add CloudWatch metrics

### Phase 3: Production (1-2 months)

1. Deploy RDS Proxy for production environment
2. Update Lambda to use proxy endpoint
3. Enable IAM authentication

## Testing Connection Reuse

```bash
# Test cold vs warm starts
aws lambda invoke --function-name db-graphql \
  --payload '{"httpMethod":"POST","body":"{\"query\":\"{users{id}}\"}"}' \
  response.json

# Check logs for connection reuse
aws logs tail /aws/lambda/db-graphql --follow | grep "Creating pool\|Reusing pool"

# Expected output:
# Cold start: "Creating pool (Lambda mode)"
# Warm start: "Reusing pool (warm start)"
```

## References

1. **AWS Lambda Execution Context**: https://docs.aws.amazon.com/lambda/latest/dg/runtimes-context.html
2. **RDS Proxy Best Practices**: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-setup.html
3. **node-postgres Pooling**: https://node-postgres.com/features/pooling
4. **Prisma Lambda Guide**: https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-aws-lambda

## Summary: Key Takeaways

✅ **DO**:

- Initialize connections at module level (outside handler)
- Use max:1 connection per Lambda instance
- Keep `callbackWaitsForEmptyEventLoop = false`
- Monitor connection metrics
- Plan for RDS Proxy in production

❌ **DON'T**:

- Create new pools inside handler
- Close connections after each invocation (Lambda)
- Use large pool sizes (max > 1) in Lambda
- Ignore connection health on warm starts
- Skip monitoring and observability

## Current Working Solution

The current implementation with caching in dev mode is working well for:

- **Development**: Connection pooling with caching prevents exhaustion
- **Tests**: All 32 tests passing without connection errors

**Next step**: Implement module-level singleton for production Lambda deployment.
