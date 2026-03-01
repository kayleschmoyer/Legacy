import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add advanced commissioner tools schema
 *
 * Purpose:
 * - Support LS-294: Advanced commissioner tools (force moves, edit scores, etc.)
 *
 * Changes:
 * - Add `is_locked BOOLEAN` to `public.teams` (lock/unlock teams)
 * - Add `lm_notes TEXT` to `public.leagues` (persistent commissioner notes)
 * - Create `public.commissioner_audit_log` table for all commissioner actions
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Add is_locked to teams
  await db.execute(`
    ALTER TABLE public.teams
      ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;
  `);

  // 2. Add lm_notes to leagues
  await db.execute(`
    ALTER TABLE public.leagues
      ADD COLUMN IF NOT EXISTS lm_notes TEXT;
  `);

  // 3. Create commissioner_audit_log
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.commissioner_audit_log (
      id          SERIAL PRIMARY KEY,
      league_id   INTEGER NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL,
      action      VARCHAR(100) NOT NULL,
      target_type VARCHAR(50),
      target_id   INTEGER,
      details     JSONB,
      reason      TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS commissioner_audit_log_league_id_idx
      ON public.commissioner_audit_log(league_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS commissioner_audit_log_created_at_idx
      ON public.commissioner_audit_log(created_at DESC);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS public.commissioner_audit_log;`);

  await db.execute(`
    ALTER TABLE public.leagues
      DROP COLUMN IF EXISTS lm_notes;
  `);

  await db.execute(`
    ALTER TABLE public.teams
      DROP COLUMN IF EXISTS is_locked;
  `);
};
