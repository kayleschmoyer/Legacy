import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add sport column to season_draft_games (LS-4664)
 *
 * Sport-toggle [8/10] — pre-draft lobby + draft creation. The `sport_kind`
 * Postgres enum was introduced by LS-4628 for the leagues table; reuses it
 * here. Backfill is implicit — every existing season draft game is baseball.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."season_draft_games"
      ADD COLUMN IF NOT EXISTS "sport" "public"."sport_kind" NOT NULL DEFAULT 'baseball';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."season_draft_games" DROP COLUMN IF EXISTS "sport";
  `);
};
