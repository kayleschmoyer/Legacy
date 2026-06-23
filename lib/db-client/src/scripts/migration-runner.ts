/**
 * Migration-application primitives.
 *
 * Extracted from `rollback-migrations.ts` so they can be imported by callers
 * that must NOT drag in that script's heavier dependency graph (dotenv +
 * `config/database` → AWS credential resolution). In particular the hosted
 * db-admin Lambda (LS-8119) imports `applyMigrationModule` from here to apply a
 * client-transpiled migration through the exact same code path as the local
 * runner, without pulling local-only credential code into its bundle.
 *
 * This module deliberately depends ONLY on `drizzle-orm` and `postgres`.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';

/**
 * Context handed to a migration's `up`/`down` function. Migrations receive a
 * Drizzle instance (`db`) and, optionally, the raw `postgres` client (`sql`).
 * Both point at the same connection, so a migration body can mix `db.execute`
 * and raw `sql` calls freely.
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
 * Apply a single migration module's `up()`, then record its hash.
 *
 * The migration body runs with autocommit semantics — each `db.execute()` /
 * `sql` statement commits on its own, NOT inside one enclosing transaction.
 *
 * LS-8254: LS-8118 (PR #5454) wrapped every migration in a single
 * `sqlClient.begin(...)` transaction to make `up()` + the bookkeeping insert
 * atomic. But every landed migration was authored for the pre-LS-8118 runner,
 * which auto-committed each statement, and several REQUIRE that — a single
 * transaction breaks them on a fresh DB, leaving "DB Integration Tests" red:
 *
 *   - `20260215_..._add_missing_foreign_key_indexes.ts` swallows a best-effort
 *     `ALTER TABLE ... RENAME COLUMN` in a JS `try/catch`. Inside a transaction
 *     the failed statement aborts the WHOLE transaction, so the swallowed error
 *     poisons the following `CREATE INDEX` ("current transaction is aborted").
 *   - `20260219_..._update_draft_type_enum.ts` runs `ALTER TYPE ... ADD VALUE`
 *     and then uses the new value in the very next statement. Postgres forbids
 *     using a freshly-added enum value in the same transaction that added it.
 *   - `CREATE INDEX CONCURRENTLY` migrations cannot run in a transaction at all.
 *
 * None of these can opt out per-migration: they are landed and immutable
 * (`scripts/check-migration-immutability.js`). Running the body with autocommit
 * — exactly as authored — fixes all three classes. We still record the hash
 * only AFTER `up()` fully resolves, so a migration that fails partway is never
 * marked applied; migrations are idempotent (IF [NOT] EXISTS / best-effort
 * guards), so re-running after a partial failure is safe.
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
  // The top-level connection carries the `.options` bag drizzle-orm's
  // `construct()` reads (`client.options.parsers`/`.serializers`), so building
  // the Drizzle instance directly on it is safe — no options-borrow needed
  // (that was only required for the transaction client; see LS-8141).
  const db = drizzle(sqlClient);
  await module.up({ db, sql: sqlClient });
  await sqlClient`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${hash}, ${Date.now()})
    ON CONFLICT (hash) DO NOTHING
  `;
}
