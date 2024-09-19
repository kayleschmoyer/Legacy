import { getDbCredentials } from '@legacy-sports/utils';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { readFileSync } from 'fs';
import { BaseDbConnection, InitProperties } from './BaseDbClient';

interface PostgresDbInitProps<TSchema extends Record<string, unknown>>
  extends InitProperties<TSchema> {
  pool: Pool;
  client: PoolClient;
}

export class PgDbConnection<
  TSchema extends Record<string, unknown>
> extends BaseDbConnection<TSchema, PostgresDbInitProps<TSchema>> {
  public get client(): PoolClient {
    return this.initProperties.client;
  }

  public get pool(): Pool {
    return this.initProperties.pool;
  }

  constructor(
    private readonly dbCertPath: string | undefined,
    private readonly schema: TSchema
  ) {
    super();
  }

  protected async _initialize(): Promise<PostgresDbInitProps<TSchema>> {
    const { dbHost, dbUser, dbPassword } = await getDbCredentials();

    const options: PoolConfig = {
      database: 'postgres',
      host: dbHost,
      password: dbPassword,
      port: 5432,
      user: dbUser,
    };

    if (this.dbCertPath !== undefined) {
      options.ssl = {
        ca: readFileSync(this.dbCertPath).toString(),
      };
    }

    const pgPool = new Pool(options);

    const client = await pgPool.connect();

    const db = drizzlePg(client, {
      schema: this.schema,
    });

    return {
      client: client,
      db: db,
      pool: pgPool,
    };
  }

  async close(): Promise<void> {
    this.client.release();
    await this.pool.end();
  }
}
