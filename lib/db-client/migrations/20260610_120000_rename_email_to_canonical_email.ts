import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Rename users.email → users.canonical_email; bump length to 255
 * (LS-7824 — Phase 2b "Cut over reads/writes" of epic LS-7821).
 *
 * This is the Phase 2 column rename described in
 * `docs/architecture/multi-provider-identity.md`. After this migration,
 * `users.canonical_email` (length 255, unique via `users_canonical_email_uk`)
 * is the sole canonical email column and the single source of truth for the
 * JWT `email` claim, billing, and display.
 *
 * Changes:
 * - Renames `app_internal.users.email` → `canonical_email`.
 * - Bumps the column length from 100 to 255 (RFC 5321 max; covers Apple
 *   private-relay addresses and long Google addresses).
 * - Drops `users_email_uk` unique constraint; creates
 *   `users_canonical_email_uk` unique constraint on the renamed column.
 * - Recreates public.users VIEW to expose `canonical_email` instead of `email`.
 *
 * This is a live column rename (RENAME COLUMN), which requires an ACCESS
 * EXCLUSIVE lock on the table only for the instant the catalog is updated —
 * the subsequent ALTER COLUMN TYPE (varchar length increase) is lightweight on
 * Postgres because varchar(N) → varchar(M ≥ N) requires no row rewrites.
 *
 * Rollback safety: `down` renames `canonical_email` back to `email` and
 * recreates `users_email_uk`. Because varchar(255) → varchar(100) would reject
 * rows longer than 100 chars, the down migration silently truncates values
 * exceeding the old limit; in practice this should never happen in a clean
 * rollback scenario (no production writes hit the new length between phases).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // 1. Drop the public view first — PostgreSQL blocks ALTER COLUMN TYPE while
  // any view or rule depends on the column being modified.
  await db.execute(`DROP VIEW IF EXISTS "public"."users";`);

  // 2. Rename the column.
  await db.execute(`
    ALTER TABLE app_internal.users
    RENAME COLUMN email TO canonical_email;
  `);

  // 3. Bump the column length to 255.
  await db.execute(`
    ALTER TABLE app_internal.users
    ALTER COLUMN canonical_email TYPE VARCHAR(255);
  `);

  // 4. Drop the old unique constraint and index.
  await db.execute(`
    ALTER TABLE app_internal.users
    DROP CONSTRAINT IF EXISTS users_email_uk;
  `);

  // 5. Create the new unique constraint on the renamed column.
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD CONSTRAINT users_canonical_email_uk UNIQUE (canonical_email);
  `);

  // 6. Recreate the btree index (the old email_idx targeted the old column name).
  await db.execute(`
    DROP INDEX IF EXISTS app_internal.email_idx;
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS users_canonical_email_idx
      ON app_internal.users (canonical_email);
  `);

  // 7. Recreate the public.users VIEW to expose canonical_email.
  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             canonical_email,
             username,
             access_level::character varying::access_level AS access_level,
             avatar_url,
             subscription_tier::text AS subscription_tier,
             discord_id,
             discord_username,
             discord_avatar,
             theme_preference,
             canonical_email_source::text AS canonical_email_source
      FROM app_internal.users;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Revert public.users VIEW.
  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             canonical_email AS email,
             username,
             access_level::character varying::access_level AS access_level,
             avatar_url,
             subscription_tier::text AS subscription_tier,
             discord_id,
             discord_username,
             discord_avatar,
             theme_preference,
             canonical_email_source::text AS canonical_email_source
      FROM app_internal.users;
  `);

  // Drop the new constraint and index.
  await db.execute(`
    ALTER TABLE app_internal.users
    DROP CONSTRAINT IF EXISTS users_canonical_email_uk;
  `);

  await db.execute(`
    DROP INDEX IF EXISTS app_internal.users_canonical_email_idx;
  `);

  // Rename back and shrink the column (values > 100 chars are truncated).
  await db.execute(`
    ALTER TABLE app_internal.users
    ALTER COLUMN canonical_email TYPE VARCHAR(100)
      USING LEFT(canonical_email, 100);
  `);

  await db.execute(`
    ALTER TABLE app_internal.users
    RENAME COLUMN canonical_email TO email;
  `);

  // Restore the old unique constraint.
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD CONSTRAINT users_email_uk UNIQUE (email);
  `);
};
