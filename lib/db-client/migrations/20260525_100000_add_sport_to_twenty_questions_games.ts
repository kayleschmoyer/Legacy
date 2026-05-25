import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add sport column to twenty_questions_games (LS-4764)
 *
 * Records which sport the player pool was drawn from so that the player-guess
 * search can be scoped to the same sport during an active game session,
 * including resumed games.
 *
 * Existing rows default to 'baseball' — all historical games used the baseball
 * player pool.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."twenty_questions_games"
      ADD COLUMN IF NOT EXISTS "sport" "public"."sport_kind" NOT NULL DEFAULT 'baseball';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."twenty_questions_games"
      DROP COLUMN IF EXISTS "sport";
  `);
};
