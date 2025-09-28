import { GenericDatabase } from './BaseDbClient';

export interface DbClient<TSchema extends Record<string, unknown>> {
  db: GenericDatabase<TSchema>;
  initialize(): Promise<void>;
  close(): Promise<void>;
}
