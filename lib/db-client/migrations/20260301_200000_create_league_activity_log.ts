import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create league_activity_log table
 *
 * Purpose:
 * - Provide a structured, queryable event log per league for the
 *   LeagueActivityFeed component (LS-356).
 * - Records user-facing events: trades, waiver claims, draft picks,
 *   commissioner announcements, etc.
 *
 * Changes:
 * - Add `league_activity_event_type` enum
 * - Create `league_activity_log` table
 * - Add indexes on league_id + occurred_at for feed queries
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create the event type enum
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE public.league_activity_event_type AS ENUM (
        'trade_proposed',
        'trade_accepted',
        'trade_rejected',
        'trade_cancelled',
        'trade_vetoed',
        'waiver_claimed',
        'waiver_cancelled',
        'draft_pick_made',
        'league_announcement'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // 2. Create the activity log table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.league_activity_log (
      id              SERIAL PRIMARY KEY,
      league_id       INTEGER NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
      team_id         INTEGER REFERENCES public.teams(id) ON DELETE SET NULL,
      actor_user_id   INTEGER,
      event_type      public.league_activity_event_type NOT NULL,
      payload         JSONB NOT NULL DEFAULT '{}',
      occurred_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  // 3. Add performance indexes
  await db.execute(`
    CREATE INDEX IF NOT EXISTS league_activity_log_league_id_occurred_at_idx
      ON public.league_activity_log (league_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS league_activity_log_event_type_idx
      ON public.league_activity_log (event_type);
    CREATE INDEX IF NOT EXISTS league_activity_log_team_id_idx
      ON public.league_activity_log (team_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS public.league_activity_log CASCADE;`);
  await db.execute(
    `DROP TYPE IF EXISTS public.league_activity_event_type CASCADE;`,
  );
};
