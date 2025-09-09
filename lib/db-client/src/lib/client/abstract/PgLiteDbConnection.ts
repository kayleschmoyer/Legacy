import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePgLite } from 'drizzle-orm/pglite';
import { LOGGER } from '@legacy-sports/logging';
import { BaseDbConnection, InitProperties } from './BaseDbClient';

interface PgLiteDbInitProps<TSchema extends Record<string, unknown>>
  extends InitProperties<TSchema> {
  client: PGlite;
}

export class PgLiteDbConnection<
  TSchema extends Record<string, unknown>
> extends BaseDbConnection<TSchema, PgLiteDbInitProps<TSchema>> {
  public get client(): PGlite {
    return this.initProperties.client;
  }

  constructor(
    public readonly dataPath: string,
    public readonly schema: TSchema
  ) {
    super();
  }

  protected async _initialize(): Promise<PgLiteDbInitProps<TSchema>> {
    const client = await PGlite.create(this.dataPath, {
      database: 'postgres',
      username: 'postgres',
    });
    const db = drizzlePgLite(client, {
      schema: this.schema,
    });

    return {
      client: client,
      db: db,
    };
  }

  async close(): Promise<void> {
    try {
      await this.client.close();
    } catch (err) {
      LOGGER.warn('Could not close the DB connection');
      if (err instanceof Error) {
        LOGGER.warn(err.message);
      }
    }
  }
}
