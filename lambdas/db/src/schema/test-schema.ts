// Re-exports the production PostgreSQL schema for use in DB integration tests.
import { PublicSchema } from '@legacy-sports/db-client';

export const testSchema = PublicSchema;
