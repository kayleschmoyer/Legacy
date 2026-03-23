import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Fix Discord OAuth down migration
 *
 * Purpose:
 * - The original migration (20260322_120000) added Discord columns and updated
 *   the public.users VIEW, but the down migration did not recreate the VIEW
 *   without the Discord columns before dropping them.
 * - This migration is a no-op for `up` (the columns already exist).
 * - The `down` properly recreates the VIEW without Discord columns first,
 *   then drops the columns.
 */

export const up = async ({
  db,
}: {
  db: PgDatabase<any>;
}): Promise<void> => {
  // Verify the columns exist (no-op — they were added in 20260322_120000)
  await db.execute(`SELECT 1 FROM app_internal.users LIMIT 0`);
  console.log(
    '📝 No-op: Discord OAuth columns already exist from 20260322_120000',
  );
};

export const down = async ({
  db,
}: {
  db: PgDatabase<any>;
}): Promise<void> => {
  console.log(
    '⬇️ Removing Discord OAuth columns (with proper VIEW recreation)...',
  );

  await db.execute(`
    DROP INDEX IF EXISTS app_internal.idx_users_discord_id;
  `);

  console.log(
    '📝 Reverting public.users VIEW to remove Discord columns...',
  );

  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             email,
             username,
             access_level::character varying::access_level AS access_level,
             avatar_url,
             subscription_tier::text AS subscription_tier
      FROM app_internal.users;
  `);

  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS discord_id,
    DROP COLUMN IF EXISTS discord_username,
    DROP COLUMN IF EXISTS discord_avatar;
  `);

  console.log(
    '✅ Reverted: Discord OAuth columns and public.users VIEW updated',
  );
};
