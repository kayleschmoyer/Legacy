import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add identity_provider enum + user_identities table; backfill from
 * Discord/local (LS-7822 — Phase 1 "Expand" of epic LS-7821).
 *
 * Additive, no behavior change. `app_internal.users.email` remains the source of
 * truth this phase — it is NOT renamed here (that is Phase 2, "Cut over").
 *
 * Changes:
 * - Creates app_internal.identity_provider enum ('local' | 'discord' | 'google' | 'apple').
 * - Creates app_internal.user_identities (one row per linked provider per user),
 *   carrying that provider's own account id / email / username / avatar.
 * - Adds nullable app_internal.users.canonical_email_source column (typed as the
 *   identity_provider enum). NOT backfilled this phase — it is populated during the
 *   Phase 2 cutover when `email` becomes `canonical_email`.
 * - Backfills one 'discord' identity per user with a non-null discord_id (carrying
 *   discord_username / discord_avatar) and one 'local' identity per user with a
 *   non-null password_hash.
 * - Creates the public.user_identities VIEW for the app_user role. The view
 *   deliberately OMITS provider_account_id so the provider's raw account id never
 *   leaks through the public schema / GraphQL layer.
 * - Recreates public.users VIEW to expose canonical_email_source.
 *
 * Design notes (the referenced docs/architecture/multi-provider-identity.md does
 * not yet exist — this follows the ticket's Scope verbatim):
 * - provider_account_id is NULLABLE: 'local' accounts have no external provider id,
 *   so their rows store NULL. The unique(provider, provider_account_id) constraint
 *   treats NULLs as distinct (Postgres standard), and unique(user_id, provider)
 *   guarantees a single 'local' row per user.
 * - Google/Apple identities are intentionally NOT backfilled — there is no existing
 *   provider data for them. They are created lazily on the user's next sign-in
 *   through that provider (handled by the Phase 2 resolveOrCreateUser flow).
 * - Backfill email/verified values are best-effort from existing data: Discord only
 *   reports verified emails (verified = true), while local accounts carry no
 *   pre-Phase-1 verification signal (verified = false).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // 1. Create the identity_provider enum in the app_internal schema.
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE app_internal.identity_provider AS ENUM (
        'local',
        'discord',
        'google',
        'apple'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // 2. Create the user_identities table.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_internal.user_identities (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
      provider app_internal.identity_provider NOT NULL,
      provider_account_id VARCHAR(255),
      provider_email VARCHAR(255),
      provider_email_verified BOOLEAN NOT NULL DEFAULT false,
      provider_username VARCHAR(255),
      provider_avatar VARCHAR(512),
      linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      last_login_at TIMESTAMP WITH TIME ZONE,
      CONSTRAINT user_identities_provider_account_uk UNIQUE (provider, provider_account_id),
      CONSTRAINT user_identities_user_provider_uk UNIQUE (user_id, provider)
    );
  `);

  // 3. Index on user_id for "all identities for a user" lookups.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS user_identities_user_id_idx
      ON app_internal.user_identities(user_id);
  `);

  // 4. Add the nullable canonical_email_source column to users.
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS canonical_email_source app_internal.identity_provider;
  `);

  // 5. Backfill a 'discord' identity for every user with a Discord link.
  //    ON CONFLICT keeps the migration idempotent across partial re-runs.
  await db.execute(`
    INSERT INTO app_internal.user_identities (
      user_id,
      provider,
      provider_account_id,
      provider_email,
      provider_email_verified,
      provider_username,
      provider_avatar,
      linked_at
    )
    SELECT
      u.id,
      'discord'::app_internal.identity_provider,
      u.discord_id,
      u.email,
      true,
      u.discord_username,
      u.discord_avatar,
      u.created_at
    FROM app_internal.users u
    WHERE u.discord_id IS NOT NULL
    ON CONFLICT (user_id, provider) DO NOTHING;
  `);

  // 6. Backfill a 'local' identity for every user with a password.
  //    Local accounts have no external provider id, so provider_account_id is NULL.
  await db.execute(`
    INSERT INTO app_internal.user_identities (
      user_id,
      provider,
      provider_account_id,
      provider_email,
      provider_email_verified,
      provider_username,
      linked_at
    )
    SELECT
      u.id,
      'local'::app_internal.identity_provider,
      NULL,
      u.email,
      false,
      u.username,
      u.created_at
    FROM app_internal.users u
    WHERE u.password_hash IS NOT NULL
    ON CONFLICT (user_id, provider) DO NOTHING;
  `);

  // 7. Create the public.user_identities VIEW. provider_account_id is omitted on
  //    purpose so the provider's raw account id never leaks through public/GraphQL.
  await db.execute(`
    CREATE OR REPLACE VIEW "public"."user_identities" AS
      SELECT id,
             user_id,
             provider::text AS provider,
             provider_email,
             provider_email_verified,
             provider_username,
             provider_avatar,
             linked_at,
             last_login_at
      FROM app_internal.user_identities;
  `);

  // 8. Recreate public.users VIEW to expose canonical_email_source.
  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             email,
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
  // Drop the public.user_identities VIEW.
  await db.execute(`
    DROP VIEW IF EXISTS "public"."user_identities";
  `);

  // Revert public.users VIEW to exclude canonical_email_source.
  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             email,
             username,
             access_level::character varying::access_level AS access_level,
             avatar_url,
             subscription_tier::text AS subscription_tier,
             discord_id,
             discord_username,
             discord_avatar,
             theme_preference
      FROM app_internal.users;
  `);

  // Drop the user_identities table (cascades its constraints/indexes).
  await db.execute(`
    DROP TABLE IF EXISTS app_internal.user_identities;
  `);

  // Remove the canonical_email_source column from users.
  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS canonical_email_source;
  `);

  // Drop the enum last, after all dependents are gone.
  await db.execute(`
    DROP TYPE IF EXISTS app_internal.identity_provider;
  `);
};
