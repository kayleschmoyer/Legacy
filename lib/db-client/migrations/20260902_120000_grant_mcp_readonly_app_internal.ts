import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Grant mcp_readonly SELECT on the app_internal schema
 *
 * mcp_readonly (added in 20260616_150000_add_mcp_readonly_role.ts) only has
 * SELECT on the public schema, so the hosted db_query MCP tool cannot read
 * app_internal tables directly (e.g. app_internal.users,
 * app_internal.subscriptions) even though those are exactly the tables an
 * agent needs for ad-hoc data investigation/provisioning (LS-9358). Grant the
 * same broad, future-proof SELECT this role already has on public, scoped to
 * app_internal instead — this role remains SELECT-only; no write grants.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(sql`
    GRANT USAGE ON SCHEMA app_internal TO mcp_readonly;

    GRANT SELECT ON ALL TABLES IN SCHEMA app_internal TO mcp_readonly;

    ALTER DEFAULT PRIVILEGES IN SCHEMA app_internal
      GRANT SELECT ON TABLES TO mcp_readonly;
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA app_internal
      REVOKE SELECT ON TABLES FROM mcp_readonly;

    REVOKE SELECT ON ALL TABLES IN SCHEMA app_internal FROM mcp_readonly;

    REVOKE USAGE ON SCHEMA app_internal FROM mcp_readonly;
  `);
};
