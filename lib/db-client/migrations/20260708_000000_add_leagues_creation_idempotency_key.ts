/**
 * Migration: Add creation_idempotency_key to leagues (LS-6063 / CLB-057)
 *
 * A rapid double-click on the create-league Submit button (or two parallel
 * browser tabs) can fire two createLeagueAndTeams requests before the client
 * disables the form. Both requests serialize on the existing per-owner
 * pg_advisory_xact_lock (LS-5122), so the free-tier cap itself cannot be
 * bypassed — but without an idempotency key, a duplicate request still
 * creates a second, unwanted league and consumes a free-tier slot.
 *
 * This nullable column stores a client-generated key (one per create-league
 * page mount). LeagueService.createLeague looks up an existing league by
 * (owner, creation_idempotency_key) inside the same locked transaction and
 * returns it instead of inserting a duplicate. The partial unique index
 * guards against a race between the lookup and the insert.
 *
 * Uses raw postgres.js tagged-template sql from MigrationContext (no
 * drizzle-orm import) so this migration runs correctly in both the local
 * runner and the hosted db-admin Lambda sandbox.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MigrationContext's sql tag is untyped across runner/lambda sandbox boundaries
export const up = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS creation_idempotency_key varchar(64)
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS leagues_owner_creation_idempotency_key_idx
    ON public.leagues (owner, creation_idempotency_key)
    WHERE creation_idempotency_key IS NOT NULL
  `;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MigrationContext's sql tag is untyped across runner/lambda sandbox boundaries
export const down = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    DROP INDEX IF EXISTS public.leagues_owner_creation_idempotency_key_idx
  `;

  await sql`
    ALTER TABLE public.leagues
    DROP COLUMN IF EXISTS creation_idempotency_key
  `;
};
