import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add app_internal.password_reset_tokens table (LS-6678 / LGN-023)
 *
 * Backs the forgot-password / reset-password flow in the oauth-proxy lambda.
 * Only the SHA-256 hash of each reset token is stored (never the raw token),
 * so a DB compromise cannot be used to take over accounts. `used_at` enforces
 * single-use and `expires_at` enforces expiry; both are checked atomically when
 * a token is consumed.
 */

// `db` is the generic drizzle instance the migration runner injects at runtime;
// migration files are excluded from lint (see lib/db-client/.eslintrc.json
// ignorePatterns) so `PgDatabase<any>` needs no suppression comment.
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_internal.password_reset_tokens (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL
                    REFERENCES app_internal.users(id) ON DELETE CASCADE,
      token_hash  VARCHAR(64) NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      used_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT password_reset_tokens_token_hash_uk UNIQUE (token_hash)
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
      ON app_internal.password_reset_tokens (user_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx
      ON app_internal.password_reset_tokens (expires_at);
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `DROP TABLE IF EXISTS app_internal.password_reset_tokens;`,
  );
};
