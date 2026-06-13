import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add injuries_last_synced_at to players (LS-6251 / FPD-027)
 *
 * Records the timestamp at which a football player's injury data was last
 * refreshed from the upstream provider. Stale injury data is worse than no
 * injury data — a "Questionable" badge that silently fails to refresh through
 * Sunday morning can mislead a roster decision. Surfacing a last-synced
 * timestamp lets the UI render relative freshness ("Last updated: 6 min ago"
 * vs "Stale (12 hours old)").
 *
 * Mirrors the existing stats_last_fetched_at freshness column on the same
 * table. Nullable — a NULL value means injury data has never been synced for
 * this player (the common case until the injury sync pipeline lands).
 *
 * Scope note (FPD epic LS-5270): the injury *status* fields (FPD-026) and the
 * data *source / provenance* fields (FPD-029) are owned by sibling tickets;
 * this migration adds only the freshness timestamp.
 */

// `db` is the generic drizzle instance the migration runner injects at runtime;
// migration files are excluded from lint (see lib/db-client/.eslintrc.json
// ignorePatterns) so `PgDatabase<any>` needs no suppression comment.
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE players
    ADD COLUMN IF NOT EXISTS injuries_last_synced_at TIMESTAMPTZ;
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE players
    DROP COLUMN IF EXISTS injuries_last_synced_at;
  `);
};
