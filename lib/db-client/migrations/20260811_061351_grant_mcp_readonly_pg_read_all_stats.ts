import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Grant pg_read_all_stats to mcp_readonly
 *
 * mcp_readonly (added in 20260616_150000_add_mcp_readonly_role.ts) can read
 * pg_stat_statements aggregates, but Postgres masks the `query` text column
 * for statements it didn't execute itself. Almost all app traffic runs under
 * the `postgres` role, so the hosted db-admin MCP server could see slow-query
 * timings but not the SQL text behind them. Membership in the built-in
 * pg_read_all_stats role lifts that masking without granting any write
 * access.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(sql`GRANT pg_read_all_stats TO mcp_readonly;`);
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(sql`REVOKE pg_read_all_stats FROM mcp_readonly;`);
};
