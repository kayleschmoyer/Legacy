import type { SQLWrapper } from 'drizzle-orm';

type MigrationDb = { execute: (query: SQLWrapper | string) => Promise<unknown> };

export const up = async ({ db }: { db: MigrationDb }) => {
  await db.execute(`CREATE EXTENSION IF NOT EXISTS unaccent`);
};

export const down = async (_: { db: MigrationDb }) => {
  // Intentionally not dropping unaccent — it may be depended on by other queries.
};
