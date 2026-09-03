import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add scored_at column to matchups
 *
 * Purpose (LS-9665):
 * - Record *when* a matchup's persisted score was computed, so we can answer
 *   "was this score computed under the scoring rules and semantics that are
 *   current right now?" (the `Matchup.scoringIsStale` signal).
 * - `matchups.updated_at` cannot serve this purpose: it is bumped by any write
 *   to the row (status transitions, stats_loading_status changes), so it
 *   reports a score as fresher than it actually is.
 *
 * Changes:
 * - matchups.scored_at TIMESTAMPTZ NULL
 *
 * Deliberately NOT backfilled (LS-9665 AC7, and the LS-9524 epic decision):
 * backfilling from `updated_at` would be wrong wherever an unrelated write
 * bumped the row, which is exactly the reason this column exists. Rows scored
 * before this migration stay NULL and are treated as stale; LS-9668's one-time
 * rescore stamps them exactly.
 *
 * No new index: the staleness resolver never filters or sorts on scored_at —
 * it reads the value off matchup rows the query already fetched, and joins the
 * league's latest scoring change via existing indexes
 * (`league_scoring_profiles_unique_default` on (league_id) WHERE is_default,
 * and `league_scoring_change_log_profile_id_changed_at_idx` on
 * (profile_id, changed_at DESC)).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase's generic is the migration runner's contract; narrowing it here would not match the handle Drizzle passes in.
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE matchups
      ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;
  `);

  await db.execute(`
    COMMENT ON COLUMN matchups.scored_at IS 'When team1_score/team2_score were last computed. NULL means the score predates scoring provenance (LS-9665) or was never computed. Never backfilled from updated_at.';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase's generic is the migration runner's contract; narrowing it here would not match the handle Drizzle passes in.
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE matchups
      DROP COLUMN IF EXISTS scored_at;
  `);
};
