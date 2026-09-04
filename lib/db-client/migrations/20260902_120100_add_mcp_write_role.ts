import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Add MCP write database role
 *
 * Creates a DML-only database role used by the hosted DB-admin MCP server's
 * `db_execute` tool (LS-9358) to run ad-hoc INSERT/UPDATE/DELETE statements
 * against the dev database without a tunnel or a versioned migration file.
 *
 * Unlike mcp_readonly (SELECT-only) and migration_user (full schema DDL,
 * used only by db_migrate), mcp_write has INSERT/UPDATE/DELETE on the public
 * and app_internal schemas — no CREATE/ALTER/DROP grants, so it cannot touch
 * schema. This mirrors why db_migrate exists as a separate, more privileged
 * path for schema changes: ad-hoc data writes should never be able to reach
 * DDL, even by accident.
 *
 * IMPORTANT: Before running this migration, set the following environment
 * variable (obtain from Secrets Manager or via `pnpm run sync-env`):
 *   MCP_WRITE_DB_PASSWORD=<password from AWS Secrets Manager mcp-write-db-creds>
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔒 Creating mcp_write database role...');

  const password =
    process.env['MCP_WRITE_DB_PASSWORD'] ?? 'CHANGE_ME_IN_PRODUCTION';

  // Stash the password in a session-scoped GUC as a *bound parameter* so it is
  // never interpolated into SQL text (mirrors add_mcp_readonly_role.ts).
  await db.execute(
    sql`SELECT set_config('mcp_write.password', ${password}, false)`,
  );

  await db.execute(sql`
    DO $$
    DECLARE
      pw text := current_setting('mcp_write.password');
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mcp_write') THEN
        EXECUTE format('CREATE ROLE mcp_write LOGIN PASSWORD %L', pw);
        RAISE NOTICE 'Created mcp_write role';
      ELSE
        EXECUTE format('ALTER ROLE mcp_write WITH PASSWORD %L', pw);
        RAISE NOTICE 'mcp_write role already exists – password updated';
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    GRANT CONNECT ON DATABASE postgres TO mcp_write;

    GRANT USAGE ON SCHEMA public TO mcp_write;
    GRANT INSERT, UPDATE, DELETE, SELECT ON ALL TABLES IN SCHEMA public TO mcp_write;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT INSERT, UPDATE, DELETE, SELECT ON TABLES TO mcp_write;

    GRANT USAGE ON SCHEMA app_internal TO mcp_write;
    GRANT INSERT, UPDATE, DELETE, SELECT ON ALL TABLES IN SCHEMA app_internal TO mcp_write;
    ALTER DEFAULT PRIVILEGES IN SCHEMA app_internal
      GRANT INSERT, UPDATE, DELETE, SELECT ON TABLES TO mcp_write;
  `);

  await db.execute(sql`SELECT set_config('mcp_write.password', '', false)`);

  console.log(
    '✅ mcp_write role created with INSERT/UPDATE/DELETE/SELECT on public + app_internal (no DDL)',
  );
  console.log('');
  console.log('ℹ️  The corresponding Secrets Manager secret is:');
  console.log('   MCP_WRITE_SECRET_NAME (from your .env or Terraform output)');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔓 Removing mcp_write database role...');

  await db.execute(sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA app_internal
      REVOKE INSERT, UPDATE, DELETE, SELECT ON TABLES FROM mcp_write;
    REVOKE INSERT, UPDATE, DELETE, SELECT ON ALL TABLES IN SCHEMA app_internal FROM mcp_write;
    REVOKE USAGE ON SCHEMA app_internal FROM mcp_write;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE INSERT, UPDATE, DELETE, SELECT ON TABLES FROM mcp_write;
    REVOKE INSERT, UPDATE, DELETE, SELECT ON ALL TABLES IN SCHEMA public FROM mcp_write;
    REVOKE USAGE ON SCHEMA public FROM mcp_write;

    REVOKE CONNECT ON DATABASE postgres FROM mcp_write;
  `);

  await db.execute(sql`DROP ROLE IF EXISTS mcp_write;`);

  console.log('✅ mcp_write role removed');
};
