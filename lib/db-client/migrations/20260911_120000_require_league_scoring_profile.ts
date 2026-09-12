/**
 * Migration: Guarantee every league has a default scoring profile (LS-6395)
 *
 * `getFootballScoringSettingsForLeague` silently fell back to hardcoded
 * PPR-style defaults whenever a league had no `league_scoring_profiles` row
 * with `is_default = true` — whether from a forgotten insert during league
 * creation or a migration/manual delete that dropped it. That produced
 * scores that looked legitimate but were mathematically wrong for any league
 * actually configured as Half-PPR or custom scoring.
 *
 * `LeagueService.createLeague` already inserts a default profile for every
 * new league inside the same transaction, but that guarantee lived only in
 * application code. This adds a database-level backstop: a deferred
 * constraint trigger that, at the end of the transaction that inserted a
 * league row, auto-creates a default scoring profile for it if one wasn't
 * already inserted. Being deferred (checked at COMMIT, not immediately after
 * the row is inserted) means it never conflicts with application code that
 * inserts the profile itself earlier in the same transaction — it only fills
 * the gap when nothing did.
 *
 * This does not (and cannot) protect against a profile row being deleted
 * *after* league creation — that "genuinely missing" case is guarded at read
 * time by `getFootballScoringSettingsForLeague`, which now throws instead of
 * silently defaulting.
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    CREATE OR REPLACE FUNCTION public.ensure_league_has_default_scoring_profile()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM public.league_scoring_profiles
        WHERE league_id = NEW.id AND is_default = true
      ) THEN
        INSERT INTO public.league_scoring_profiles (league_id, profile_name, status, is_default)
        VALUES (NEW.id, 'Default', 'active', true);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await db.execute(`
    DROP TRIGGER IF EXISTS leagues_require_scoring_profile_trigger ON public.leagues;
  `);

  await db.execute(`
    CREATE CONSTRAINT TRIGGER leagues_require_scoring_profile_trigger
      AFTER INSERT ON public.leagues
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.ensure_league_has_default_scoring_profile();
  `);

  // Backfill: any pre-existing league that is somehow already missing its
  // default profile (the exact corruption this ticket is about) gets one now,
  // rather than waiting for the next time someone reads its scoring settings.
  await db.execute(`
    INSERT INTO public.league_scoring_profiles (league_id, profile_name, status, is_default)
    SELECT l.id, 'Default', 'active', true
    FROM public.leagues l
    WHERE NOT EXISTS (
      SELECT 1 FROM public.league_scoring_profiles p
      WHERE p.league_id = l.id AND p.is_default = true
    );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    DROP TRIGGER IF EXISTS leagues_require_scoring_profile_trigger ON public.leagues;
  `);
  await db.execute(`
    DROP FUNCTION IF EXISTS public.ensure_league_has_default_scoring_profile();
  `);
};
