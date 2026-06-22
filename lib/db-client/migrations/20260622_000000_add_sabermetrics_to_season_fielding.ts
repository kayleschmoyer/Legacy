/**
 * Migration: Add defensive sabermetrics (DRS, UZR, OAA) to season_fielding (LS-6988)
 *
 * Adds three advanced defensive metrics columns to `season_fielding`:
 *   drs  — Defensive Runs Saved (Baseball Info Solutions)
 *   uzr  — Ultimate Zone Rating (FanGraphs)
 *   oaa  — Outs Above Average (Statcast/Baseball Savant)
 *
 * All three are nullable floats; existing rows will be NULL until a future
 * data-ingestion pipeline populates them. These columns are premium-gated in
 * the resolver (defensive_sabermetrics entitlement) so free-tier users never
 * see them.
 *
 * Uses raw postgres.js tagged-template sql from MigrationContext (no drizzle-orm
 * import) so this migration runs correctly in both the local runner and the
 * hosted db-admin Lambda sandbox.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.season_fielding
    ADD COLUMN IF NOT EXISTS drs double precision,
    ADD COLUMN IF NOT EXISTS uzr double precision,
    ADD COLUMN IF NOT EXISTS oaa double precision
  `;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.season_fielding
    DROP COLUMN IF EXISTS drs,
    DROP COLUMN IF EXISTS uzr,
    DROP COLUMN IF EXISTS oaa
  `;
};
