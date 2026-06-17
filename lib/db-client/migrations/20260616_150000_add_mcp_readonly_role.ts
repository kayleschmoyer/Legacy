import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Add MCP readonly database role
 *
 * Creates a broad read-only database role used by the hosted DB-admin MCP
 * server (LS-8116) to run SELECT-only queries without a tunnel.
 *
 * Unlike ci_readonly (which can only read drizzle.__drizzle_migrations), the
 * mcp_readonly role has SELECT on every table in the public schema plus future
 * tables, so the server can serve read-only data queries. It also retains
 * SELECT on drizzle.__drizzle_migrations so the same role powers
 * db_migration_status.
 *
 * The mcp_readonly role has:
 * - CONNECT on the database
 * - USAGE + SELECT on all current and future tables in schema public
 * - USAGE on the drizzle schema + SELECT on drizzle.__drizzle_migrations
 *
 * IMPORTANT: Before running this migration, set the following environment
 * variable (obtain from Secrets Manager or via `pnpm run sync-env`):
 *   MCP_READONLY_DB_PASSWORD=<password from AWS Secrets Manager mcp-readonly-db-creds>
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔒 Creating mcp_readonly database role...');

  const password =
    process.env['MCP_READONLY_DB_PASSWORD'] ?? 'CHANGE_ME_IN_PRODUCTION';

  // 1. Stash the password in a session-scoped GUC as a *bound parameter* so it
  //    is never interpolated into SQL text. The role DDL below reads it back
  //    server-side and quotes it safely with format(%L), avoiding any SQL
  //    injection surface even if the value contained quotes.
  await db.execute(
    sql`SELECT set_config('mcp_readonly.password', ${password}, false)`,
  );

  // 2. Create mcp_readonly role with login (idempotent: create if absent,
  //    otherwise refresh the password in case it changed).
  await db.execute(sql`
    DO $$
    DECLARE
      pw text := current_setting('mcp_readonly.password');
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mcp_readonly') THEN
        EXECUTE format('CREATE ROLE mcp_readonly LOGIN PASSWORD %L', pw);
        RAISE NOTICE 'Created mcp_readonly role';
      ELSE
        EXECUTE format('ALTER ROLE mcp_readonly WITH PASSWORD %L', pw);
        RAISE NOTICE 'mcp_readonly role already exists – password updated';
      END IF;
    END
    $$;
  `);

  // 3. Ensure the drizzle schema exists (created by the migration runner, but
  //    guard in case this migration runs before any other app migrations)
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle;`);

  // 4. Grant broad SELECT on the public schema
  await db.execute(sql`
    -- Allow mcp_readonly to connect to the database
    GRANT CONNECT ON DATABASE postgres TO mcp_readonly;

    -- Allow mcp_readonly to access objects in the public schema
    GRANT USAGE ON SCHEMA public TO mcp_readonly;

    -- Grant SELECT on all existing tables in the public schema
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_readonly;

    -- Grant SELECT on any tables created in the future
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT ON TABLES TO mcp_readonly;
  `);

  // 5. Grant read access to migration state so the same role powers
  //    db_migration_status
  await db.execute(sql`
    -- Allow mcp_readonly to look up objects in the drizzle schema
    GRANT USAGE ON SCHEMA drizzle TO mcp_readonly;

    -- Grant SELECT on the migration tracking table
    GRANT SELECT ON drizzle.__drizzle_migrations TO mcp_readonly;
  `);

  // 6. Drop the transient password GUC now that the role owns it.
  await db.execute(
    sql`SELECT set_config('mcp_readonly.password', '', false)`,
  );

  console.log('✅ mcp_readonly role created with broad SELECT on schema public');
  console.log('');
  console.log('ℹ️  The corresponding Secrets Manager secret is:');
  console.log('   MCP_READONLY_SECRET_NAME (from your .env or Terraform output)');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔓 Removing mcp_readonly database role...');

  await db.execute(sql`
    REVOKE SELECT ON drizzle.__drizzle_migrations FROM mcp_readonly;
    REVOKE USAGE ON SCHEMA drizzle FROM mcp_readonly;
  `);

  await db.execute(sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE SELECT ON TABLES FROM mcp_readonly;
    REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM mcp_readonly;
    REVOKE USAGE ON SCHEMA public FROM mcp_readonly;
    REVOKE CONNECT ON DATABASE postgres FROM mcp_readonly;
  `);

  await db.execute(sql`DROP ROLE IF EXISTS mcp_readonly;`);

  console.log('✅ mcp_readonly role removed');
};
