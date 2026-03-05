import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { LOGGER } from '@legacy-sports/logging';
import { readFileSync } from 'fs';
import { BaseDbConnection, InitProperties } from './BaseDbClient';
import { getDatabaseConfig } from '../../../config/database';

interface PostgresDbInitProps<
  TSchema extends Record<string, unknown>,
> extends InitProperties<TSchema> {
  pool: Pool;
  client: PoolClient;
}

export class PgDbConnection<
  TSchema extends Record<string, unknown>,
> extends BaseDbConnection<TSchema, PostgresDbInitProps<TSchema>> {
  public get client(): PoolClient {
    return this.initProperties.client;
  }

  public get pool(): Pool {
    return this.initProperties.pool;
  }

  constructor(
    private readonly dbCertPath: string | undefined,
    private readonly schema: TSchema,
  ) {
    super();
  }

  protected async _initialize(): Promise<PostgresDbInitProps<TSchema>> {
    const dbConfig = await getDatabaseConfig();

    const options: PoolConfig = {
      database: dbConfig.database,
      host: dbConfig.host,
      password: dbConfig.password,
      port: 5432,
      user: dbConfig.user,

      // Connection pool limits to prevent exhaustion
      // In Lambda: Each instance should use minimal connections
      // db.t3.micro has ~87 max_connections, AWS reserves ~10
      // With 10 concurrent Lambdas, each can safely use 3-4 connections
      max: 3, // Maximum connections per Lambda instance
      min: 0, // Don't keep idle connections (Lambda is ephemeral)
      idleTimeoutMillis: 30000, // Release idle connections after 30s
      connectionTimeoutMillis: 5000, // Fail fast if pool is exhausted
    };

    // Use SSL configuration from database config
    if (dbConfig.ssl) {
      options.ssl = dbConfig.ssl;
    } else if (this.dbCertPath !== undefined) {
      try {
        options.ssl = {
          ca: readFileSync(this.dbCertPath).toString(),
        };
      } catch {
        // If cert file can't be read, fall back to basic SSL for AWS RDS
        options.ssl = {
          rejectUnauthorized: false,
        };
      }
    } else if (process.env.USE_LOCAL_CREDENTIALS !== 'true') {
      // For AWS RDS connections without cert path, enable SSL with relaxed verification.
      // Skip when running locally (USE_LOCAL_CREDENTIALS=true) since local Postgres
      // containers do not have SSL configured.
      options.ssl = {
        rejectUnauthorized: false,
      };
    }

    const pgPool = new Pool(options);

    // Log connection pool events for monitoring
    pgPool.on('connect', () => {
      LOGGER.info(
        `[DB Pool] Connection established. Active: ${pgPool.totalCount}, Idle: ${pgPool.idleCount}, Waiting: ${pgPool.waitingCount}`,
      );
    });

    pgPool.on('error', (err) => {
      LOGGER.error(`[DB Pool] Unexpected error on idle client: ${String(err)}`);
    });

    pgPool.on('remove', () => {
      LOGGER.info(
        `[DB Pool] Connection removed. Active: ${pgPool.totalCount}, Idle: ${pgPool.idleCount}`,
      );
    });

    // IMPORTANT: Pass the Pool directly to drizzle, not a single client
    // This allows drizzle to get fresh clients from the pool for each query
    // and properly handle connection lifecycle in Lambda environments
    const db = drizzlePg(pgPool, {
      schema: this.schema,
    });

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
      // Deprecated field - pool manages all clients now, but kept for backward compatibility
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      client: null as any,
      db: db,
      pool: pgPool,
    };
  }

  async close(): Promise<void> {
    // Only close the pool, don't try to release a specific client
    await this.pool.end();
  }
}
