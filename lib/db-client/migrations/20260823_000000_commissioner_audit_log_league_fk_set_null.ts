import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: SET NULL on commissioner_audit_log_league_fk (LS-6308)
 *
 * `deleteLeague` never wrote a commissioner_audit_log entry for the delete
 * itself — every other commissioner action (force-add, force-drop, edit
 * score, etc.) is audited, but a league deletion (including an admin
 * deleting a league they don't own) left no trail at all.
 *
 * Fixing that by writing an audit entry before the delete runs hits the
 * same problem `league_scoring_profiles_copied_from_fk` had (LS-8137):
 * `commissioner_audit_log_league_fk` is `ON DELETE CASCADE`, so the audit
 * row documenting the deletion would itself be cascade-deleted the instant
 * the league it references is removed — the trail can never survive.
 *
 * Fix: switch to `ON DELETE SET NULL` (same "preserve the row, drop the
 * dangling pointer" pattern as `league_scoring_profiles_copied_from_fk` and
 * `matchup_messages.reply_to_message_id` — see
 * docs/database/cascade-delete-implementation.md). The deleted league's
 * identifying info is preserved in the audit row's `details` JSONB, so the
 * entry stays meaningful after `league_id` goes null.
 *
 * Idempotent: DROP CONSTRAINT IF EXISTS before re-adding.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE public.commissioner_audit_log
    ALTER COLUMN league_id DROP NOT NULL;
  `);
  await db.execute(`
    ALTER TABLE public.commissioner_audit_log
    DROP CONSTRAINT IF EXISTS commissioner_audit_log_league_fk;
  `);
  await db.execute(`
    ALTER TABLE public.commissioner_audit_log
    ADD CONSTRAINT commissioner_audit_log_league_fk
    FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE SET NULL;
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE public.commissioner_audit_log
    DROP CONSTRAINT IF EXISTS commissioner_audit_log_league_fk;
  `);
  await db.execute(`
    ALTER TABLE public.commissioner_audit_log
    ADD CONSTRAINT commissioner_audit_log_league_fk
    FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE CASCADE;
  `);
  await db.execute(`
    ALTER TABLE public.commissioner_audit_log
    ALTER COLUMN league_id SET NOT NULL;
  `);
};
