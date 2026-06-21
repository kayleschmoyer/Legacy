/**
 * Transactional migration-application primitives.
 *
 * Extracted from `rollback-migrations.ts` so they can be imported by callers
 * that must NOT drag in that script's heavier dependency graph (dotenv +
 * `config/database` → AWS credential resolution). In particular the hosted
 * db-admin Lambda (LS-8119) imports `applyMigrationModule` from here to apply a
 * client-transpiled migration through the exact same atomic code path as the
 * local runner, without pulling local-only credential code into its bundle.
 *
 * This module deliberately depends ONLY on `drizzle-orm` and `postgres`.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';

/**
 * Context handed to a migration's `up`/`down` function. Migrations receive a
 * Drizzle instance (`db`) and, optionally, the raw `postgres` client (`sql`).
 * When a migration is applied transactionally, both point at the same
 * transaction so the migration body and the bookkeeping insert commit together.
 */
export interface MigrationContext {
  db: ReturnType<typeof drizzle>;
  sql: postgres.Sql;
}

/**
 * Minimal shape of an imported migration module — just the `up` function we
 * need to apply it. Migration files export both `up` and `down`; callers that
 * only apply migrations need `up`.
 */
export interface MigrationModule {
  up: (ctx: MigrationContext) => Promise<void>;
}

/**
 * Apply a single migration module's `up()` and record its hash inside ONE
 * transaction. If `up()` throws (or the bookkeeping insert fails), the whole
 * transaction rolls back and the hash is NOT recorded — so a partially-applied
 * migration can never be marked as applied.
 *
 * Connection-agnostic by design: callers pass an already-opened `postgres`
 * client and an already-imported migration module. This lets a hosted Lambda
 * (LS-8119) evaluate a client-transpiled migration and apply it through the
 * exact same code path as the local runner.
 *
 * `hash` is the migration's tracking key — the runner keys on the migration
 * filename (e.g. "20260303_150000_add_ci_readonly_role.ts").
 */
export async function applyMigrationModule(
  sqlClient: postgres.Sql,
  hash: string,
  module: MigrationModule,
): Promise<void> {
  await sqlClient.begin(async (tx) => {
    // `tx` is a TransactionSql, which is NOT assignable to postgres.Sql — it
    // lacks the connection-management methods (CLOSE/END/PostgresError/...).
    // A direct `tx as postgres.Sql` fails to compile (TS2352: "neither type
    // sufficiently overlaps... convert to 'unknown' first"), so the `unknown`
    // hop is required. Migrations only run queries on it, never lifecycle
    // methods. The raw INSERT below still uses `tx` directly as a tagged
    // template.
    const txSql = tx as unknown as postgres.Sql;
    // postgres.js transaction clients (created by `Sql(handler)`) do not carry
    // the `.options` bag that the top-level connection holds — `.options` is
    // attached only to the parent connection instance. drizzle-orm's
    // `construct()` reads `client.options.parsers`/`.serializers` to install
    // its transparent date/timestamp parsers (drizzle-orm/postgres-js/
    // driver.js), so building a Drizzle instance from the bare transaction
    // client throws "Cannot read properties of undefined (reading 'parsers')"
    // (LS-8141, a regression from LS-8118 routing every migration through this
    // transactional path). Borrow the parent connection's options onto the tx
    // so the per-tx Drizzle can construct; the parsers it installs are
    // idempotent and identical to what a Drizzle instance built on the parent
    // connection would set.
    const txWithOptions = txSql as unknown as { options?: unknown };
    if (txWithOptions.options === undefined) {
      txWithOptions.options = (
        sqlClient as unknown as { options?: unknown }
      ).options;
    }
    const txDb = drizzle(txSql);
    await module.up({ db: txDb, sql: txSql });
    await tx`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${Date.now()})
      ON CONFLICT (hash) DO NOTHING
    `;
  });
}
