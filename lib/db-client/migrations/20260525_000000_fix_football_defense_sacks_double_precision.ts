import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."game_football_defense"
      ALTER COLUMN "sacks" TYPE double precision;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."game_football_defense"
      ALTER COLUMN "sacks" TYPE integer USING sacks::integer;
  `);
};
