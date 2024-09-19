import { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { PgDatabase } from 'drizzle-orm/pg-core';
import { PgliteQueryResultHKT } from 'drizzle-orm/pglite';

export type GenericDatabase<TSchema extends Record<string, unknown>> =
  PgDatabase<PgliteQueryResultHKT | NodePgQueryResultHKT, TSchema>;

export interface InitProperties<TSchema extends Record<string, unknown>> {
  db: GenericDatabase<TSchema>;
}

export abstract class BaseDbConnection<
  TSchema extends Record<string, unknown>,
  TInitProperties extends InitProperties<TSchema> = InitProperties<TSchema>
> {
  private _initProperties: TInitProperties | undefined;

  get initProperties(): TInitProperties {
    if (this._initProperties === undefined) {
      throw new Error(
        'You must call .initialize() before attempting to use this connection.'
      );
    }

    return this._initProperties;
  }

  public get db(): GenericDatabase<TSchema> {
    return this.initProperties.db;
  }

  protected abstract _initialize(): Promise<TInitProperties>;

  public async initialize(): Promise<void> {
    if (this._initProperties !== undefined) {
      throw new Error('This connection has already been initialized.');
    }

    this._initProperties = await this._initialize();
  }

  abstract close(): Promise<void>;
}
