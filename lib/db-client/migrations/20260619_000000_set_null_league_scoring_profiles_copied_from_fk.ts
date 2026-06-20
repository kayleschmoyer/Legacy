import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: SET NULL on league_scoring_profiles.copied_from_profile_id (LS-8137)
 *
 * `league_scoring_profiles_copied_from_fk` is a self-referential FK
 * (`copied_from_profile_id` → `league_scoring_profiles.id`) created `ON DELETE
 * NO ACTION` in the initial schema, intentionally to keep the copy-provenance
 * audit trail. But that NO ACTION blocks legitimate deletes: when a user owns
 * two leagues where one league's scoring profile was *copied from* the other's,
 * deleting the source league CASCADE-deletes its profiles, and the still-living
 * referencing profile in the other league pins the source row — Postgres raises
 *
 *   [code 23503] [constraint league_scoring_profiles_copied_from_fk]
 *   [detail Key (id)=(…) is still referenced from table "league_scoring_profiles".]
 *
 * `deleteAllLeagues` / `deleteLeague` then surface this as an opaque
 * "Internal server error" 500, which repeatedly broke the integration reset
 * path (`resetMockDraftUsage` → mock-draft-simulator-ui:75) and any other spec
 * relying on `deleteAllLeagues` for cleanup.
 *
 * Fix: switch the self-FK to `ON DELETE SET NULL`. This preserves the audit
 * intent — the copied profile row survives — while clearing the now-dangling
 * provenance pointer when its source is deleted. It mirrors the existing
 * `matchup_messages.reply_to_message_id` self-FK, which is SET NULL for the
 * same "preserve the row, drop the dangling pointer" reason
 * (see docs/database/cascade-delete-implementation.md).
 *
 * Idempotent: DROP CONSTRAINT IF EXISTS before re-adding. No CONCURRENTLY, so
 * it is safe under the transactional migration runner (LS-8118).
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log(
    '🔗 Setting ON DELETE SET NULL on league_scoring_profiles_copied_from_fk...',
  );
  await db.execute(`
    ALTER TABLE league_scoring_profiles
    DROP CONSTRAINT IF EXISTS league_scoring_profiles_copied_from_fk;
  `);
  await db.execute(`
    ALTER TABLE league_scoring_profiles
    ADD CONSTRAINT league_scoring_profiles_copied_from_fk
    FOREIGN KEY (copied_from_profile_id)
    REFERENCES league_scoring_profiles(id) ON DELETE SET NULL;
  `);
  console.log(
    '✅ league_scoring_profiles_copied_from_fk now ON DELETE SET NULL',
  );
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log(
    '🔄 Reverting league_scoring_profiles_copied_from_fk to NO ACTION...',
  );
  await db.execute(`
    ALTER TABLE league_scoring_profiles
    DROP CONSTRAINT IF EXISTS league_scoring_profiles_copied_from_fk;
  `);
  await db.execute(`
    ALTER TABLE league_scoring_profiles
    ADD CONSTRAINT league_scoring_profiles_copied_from_fk
    FOREIGN KEY (copied_from_profile_id)
    REFERENCES league_scoring_profiles(id);
  `);
  console.log('✅ Reverted to NO ACTION');
};
