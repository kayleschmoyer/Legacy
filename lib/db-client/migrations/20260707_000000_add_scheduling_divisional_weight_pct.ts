/**
 * Migration: Add scheduling_divisional_weight_pct to leagues (LS-6106 / CLB-014)
 *
 * Adds a nullable integer percentage (0-100) letting Premium users override the
 * in-division vs out-of-division game ratio for the Divisional scheduling
 * strategy. Null preserves the existing hardcoded behavior (100% in-division
 * games) for every league that never sets it. Premium-gated in the resolver
 * (`advanced_scheduling` entitlement) so free-tier users cannot set it.
 *
 * Uses raw postgres.js tagged-template sql from MigrationContext (no drizzle-orm
 * import) so this migration runs correctly in both the local runner and the
 * hosted db-admin Lambda sandbox.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MigrationContext's sql tag is untyped across runner/lambda sandbox boundaries
export const up = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS scheduling_divisional_weight_pct integer
  `;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MigrationContext's sql tag is untyped across runner/lambda sandbox boundaries
export const down = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.leagues
    DROP COLUMN IF EXISTS scheduling_divisional_weight_pct
  `;
};
