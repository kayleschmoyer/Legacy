import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add the Android APK download allowlist and audit log (LS-9453)
 *
 * Backs the gated APK download (parent LS-9452). `app_download_allowlist`
 * records which email addresses may download the Android app;
 * `app_download_audit` records every attempt and how it resolved.
 *
 * Both tables live in `app_internal` alongside the other auth-adjacent tables
 * (users, user_identities, subscriptions, password_reset_tokens) rather than in
 * `public` — they gate access and hold personal data. Resolvers reach them with
 * raw `app_internal.*` SQL the way account-merge.ts already does, so no
 * `public` view is needed.
 *
 * No FK from `app_download_allowlist.email` to `users.canonical_email`, by
 * design: an address must be listable before that person has ever signed up.
 * Their account is created on first Google sign-in via resolveOrCreateUser, and
 * the allowlist is matched on the email itself, never on a user id. Adding a
 * constraint here would break the normal "invite a new tester" flow.
 *
 * `added_by_user_id` is the admin who added the row, so it *does* reference
 * users — but nullable with ON DELETE SET NULL rather than CASCADE: removing an
 * admin must not silently revoke every tester they invited.
 *
 * Case handling: this database has no `citext` extension (zero of the 273
 * migrations before this one use it) and nothing in the codebase lowercases
 * emails before storing them — `users.canonical_email` holds whatever the
 * identity provider returned. So uniqueness and lookups both go through
 * `lower(email)` functional indexes, which keeps matching case-insensitive
 * without depending on how any other table normalises.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // 1. Outcome enum. Three states, because an admin bypass and a listed grant
  // must stay distinguishable after the fact — "who actually needed to be on
  // the list" is the question the audit log exists to answer.
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE app_internal.app_download_outcome AS ENUM (
        'allowed_listed',
        'allowed_admin',
        'denied'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // 2. The allowlist itself.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_internal.app_download_allowlist (
      id               SERIAL PRIMARY KEY,
      email            VARCHAR(255) NOT NULL,
      note             TEXT,
      added_by_user_id INTEGER REFERENCES app_internal.users(id) ON DELETE SET NULL,
      created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      revoked_at       TIMESTAMP WITH TIME ZONE
    );
  `);

  // 3. Case-insensitive uniqueness. Stores the address as the admin typed it
  // (for display) while preventing the same person being listed twice under
  // different casing.
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS app_download_allowlist_email_lower_uk
      ON app_internal.app_download_allowlist (lower(email));
  `);

  // 4. Partial index over the active rows — the download route's hot path is
  // "is this address currently allowed", which never cares about revoked ones.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS app_download_allowlist_active_idx
      ON app_internal.app_download_allowlist (lower(email))
      WHERE revoked_at IS NULL;
  `);

  // 5. The audit log. Denormalised on email rather than joined to the allowlist:
  // an attempt from an address with no row is exactly the case worth recording,
  // and the log must survive the allowlist row being deleted.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_internal.app_download_audit (
      id          SERIAL PRIMARY KEY,
      email       VARCHAR(255) NOT NULL,
      outcome     app_internal.app_download_outcome NOT NULL,
      apk_version VARCHAR(100),
      user_agent  VARCHAR(512),
      created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  // 6. Serves the admin page's per-tester "last downloaded" lookup.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS app_download_audit_email_created_at_idx
      ON app_internal.app_download_audit (lower(email), created_at DESC);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Tables first — the enum cannot drop while a column still uses it.
  await db.execute(
    `DROP TABLE IF EXISTS app_internal.app_download_audit;`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS app_internal.app_download_allowlist;`,
  );
  await db.execute(`DROP TYPE IF EXISTS app_internal.app_download_outcome;`);
};
