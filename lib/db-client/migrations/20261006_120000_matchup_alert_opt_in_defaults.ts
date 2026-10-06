import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Per-class defaults for matchup alerts (LS-7087)
 * Created: 2026-10-06
 *
 * Every matchup alert class defaulted to ON, so new users got close-game
 * and reminder pushes they never asked for. Product decision (2026-10-06):
 * matchup started / ended stay on by default; close-game and reminder
 * become opt-in (touchdown alerts already are).
 *
 * Column defaults only — existing rows are left as-is (no backfill).
 * Re-runnable: SET DEFAULT is idempotent.
 */
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE public.notification_preferences
      ALTER COLUMN matchup_close_game_enabled SET DEFAULT false,
      ALTER COLUMN matchup_reminder_enabled SET DEFAULT false
  `);
};

export const down = async ({
  db,
}: {
  db: PgDatabase<any>;
}): Promise<void> => {
  await db.execute(`
    ALTER TABLE public.notification_preferences
      ALTER COLUMN matchup_close_game_enabled SET DEFAULT true,
      ALTER COLUMN matchup_reminder_enabled SET DEFAULT true
  `);
};
