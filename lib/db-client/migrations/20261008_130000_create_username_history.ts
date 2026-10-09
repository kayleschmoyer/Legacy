/**
 * Migration: Create app_internal.username_history (LS-7242 / PRS-041)
 * Created: 2026-10-08
 *
 * updateUsername overwrote users.username in place, leaving no record of the
 * previous name. Moderators escalating a report ("user X used to be called Y")
 * had nothing to look at. One row is now written per successful change.
 *
 * Changes:
 * - Creates app_internal.username_history: (user_id, old_username,
 *   new_username, changed_at). Rows cascade when the user is deleted.
 * - Indexes user_id (history per user) and lower(old_username) (reverse
 *   lookup: "who used to be called Y").
 *
 * Additive only, so it is safe ahead of any lambda deploy. Re-runnable.
 */

interface MigrationDb {
  execute: (query: string) => Promise<unknown>;
}

export const up = async ({ db }: { db: MigrationDb }): Promise<void> => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_internal.username_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
      old_username VARCHAR(50),
      new_username VARCHAR(50) NOT NULL,
      changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS username_history_user_id_idx
      ON app_internal.username_history(user_id, changed_at DESC);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS username_history_old_username_idx
      ON app_internal.username_history(lower(old_username));
  `);
};

export const down = async ({ db }: { db: MigrationDb }): Promise<void> => {
  await db.execute(`DROP TABLE IF EXISTS app_internal.username_history;`);
};
