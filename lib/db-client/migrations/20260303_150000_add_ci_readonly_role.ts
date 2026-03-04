import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add CI readonly database role
 *
 * Creates a minimal read-only database role for GitHub Actions CI to verify
 * that all migration files have been applied to the database.
 *
 * The ci_readonly role has only:
 * - CONNECT on the database
 * - USAGE on the drizzle schema
 * - SELECT on drizzle.__drizzle_migrations
 *
 * This is the minimum permission set needed to check migration state.
 *
 * IMPORTANT: Before running this migration, set the following environment
 * variable (obtain from Secrets Manager or via `pnpm run sync-env`):
 *   CI_READONLY_DB_PASSWORD=<password from AWS Secrets Manager ci-readonly-db-creds>
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔒 Creating ci_readonly database role...');

  const password =
    process.env['CI_READONLY_DB_PASSWORD'] ?? 'CHANGE_ME_IN_PRODUCTION';

  // 1. Create ci_readonly role with login
  await db.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ci_readonly') THEN
        CREATE ROLE ci_readonly LOGIN PASSWORD '${password}';
        RAISE NOTICE 'Created ci_readonly role';
      ELSE
        -- Update the password in case it changed
        ALTER ROLE ci_readonly WITH PASSWORD '${password}';
        RAISE NOTICE 'ci_readonly role already exists – password updated';
      END IF;
    END
    $$;
  `);

  // 2. Ensure the drizzle schema exists (created by the migration runner, but
  //    guard in case this migration runs before any other app migrations)
  await db.execute(`CREATE SCHEMA IF NOT EXISTS drizzle;`);

  // 3. Grant only what is needed to read migration state
  await db.execute(`
    -- Allow ci_readonly to connect to the database
    GRANT CONNECT ON DATABASE postgres TO ci_readonly;

    -- Allow ci_readonly to look up objects in the drizzle schema
    GRANT USAGE ON SCHEMA drizzle TO ci_readonly;

    -- Grant SELECT on the migration tracking table only
    GRANT SELECT ON drizzle.__drizzle_migrations TO ci_readonly;
  `);

  console.log(
    '✅ ci_readonly role created with SELECT on drizzle.__drizzle_migrations',
  );
  console.log('');
  console.log('ℹ️  The corresponding Secrets Manager secret is:');
  console.log(
    '   CI_READONLY_DB_CREDS_SECRET_NAME (from your .env or Terraform output)',
  );
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔓 Removing ci_readonly database role...');

  await db.execute(`
    REVOKE SELECT ON drizzle.__drizzle_migrations FROM ci_readonly;
    REVOKE USAGE ON SCHEMA drizzle FROM ci_readonly;
    REVOKE CONNECT ON DATABASE postgres FROM ci_readonly;
  `);

  await db.execute(`DROP ROLE IF EXISTS ci_readonly;`);

  console.log('✅ ci_readonly role removed');
};
