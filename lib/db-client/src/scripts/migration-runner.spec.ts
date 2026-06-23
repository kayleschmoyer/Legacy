import { drizzle } from 'drizzle-orm/postgres-js';

import { applyMigrationModule } from './migration-runner';

/**
 * Coverage for `applyMigrationModule` (LS-8254).
 *
 * The runner applies a migration's `up()` with autocommit semantics — directly
 * on the connection, NOT inside an enclosing `sqlClient.begin(...)` transaction
 * (which LS-8118 added and LS-8254 reverted, because several landed migrations
 * require per-statement commits: best-effort try/catch DDL, `ALTER TYPE ADD
 * VALUE` then use, `CREATE INDEX CONCURRENTLY`). The hash is recorded only after
 * `up()` fully resolves.
 *
 * These tests deliberately do NOT mock `drizzle` — they exercise the real
 * drizzle-orm `construct()` path against a fake `postgres` client (a callable
 * tagged template that owns the `.options` bag construct() reads), so the
 * Drizzle instance handed to `up()` is built for real.
 */

type SqlClientArg = Parameters<typeof applyMigrationModule>[0];

/**
 * Build a fake top-level `postgres` connection: a callable tagged template
 * (used for the bookkeeping INSERT and any raw `sql` calls) carrying the
 * `.options` bag drizzle's `construct()` reads. `begin` is present so a test can
 * assert the runner does NOT open a transaction.
 */
function makeSqlClient() {
  const tagged = jest.fn().mockResolvedValue(undefined);
  const begin = jest.fn();
  const sqlClient = Object.assign(tagged, {
    begin,
    options: { parsers: {}, serializers: {} },
  }) as unknown as SqlClientArg;
  return { sqlClient, tagged, begin };
}

describe('applyMigrationModule (LS-8254)', () => {
  it('applies up() then records the hash, with no enclosing transaction', async () => {
    const { sqlClient, tagged, begin } = makeSqlClient();
    let received: { db: unknown; sql: unknown } | undefined;
    const up = jest.fn((ctx: { db: unknown; sql: unknown }) => {
      received = ctx;
      return Promise.resolve();
    });

    await expect(
      applyMigrationModule(sqlClient, '20260101_000000_test.ts', { up }),
    ).resolves.toBeUndefined();

    expect(up).toHaveBeenCalledTimes(1);
    // No transaction is opened — migrations run with autocommit semantics.
    expect(begin).not.toHaveBeenCalled();

    const ctx = received as { db: unknown; sql: unknown };
    // up() received a REAL Drizzle instance bound to the connection...
    const db = ctx.db as ReturnType<typeof drizzle>;
    expect(typeof db.execute).toBe('function');
    expect((db as unknown as { $client: unknown }).$client).toBe(sqlClient);
    // ...plus the raw client for migrations that use `sql` directly.
    expect(ctx.sql).toBe(sqlClient);

    // The bookkeeping INSERT ran on the connection with the hash.
    expect(tagged).toHaveBeenCalledTimes(1);
    const [queryStrings, hashArg] = tagged.mock.calls[0] as [string[], string];
    expect(queryStrings.join('')).toContain(
      'INSERT INTO drizzle.__drizzle_migrations',
    );
    expect(hashArg).toBe('20260101_000000_test.ts');
  });

  it('does not record the hash when up() throws', async () => {
    const { sqlClient, tagged } = makeSqlClient();
    const boom = new Error('migration body failed');

    await expect(
      applyMigrationModule(sqlClient, '20260101_000000_test.ts', {
        up: () => Promise.reject(boom),
      }),
    ).rejects.toThrow(boom);

    // up() failed → the bookkeeping INSERT never ran, so the migration is not
    // marked applied and will be retried (migrations are idempotent).
    expect(tagged).not.toHaveBeenCalled();
  });
});
