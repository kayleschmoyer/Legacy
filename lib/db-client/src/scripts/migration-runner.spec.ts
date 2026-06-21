import { drizzle } from 'drizzle-orm/postgres-js';

import { applyMigrationModule } from './migration-runner';

/**
 * Regression coverage for LS-8141 (an LS-8118 regression).
 *
 * Unlike `rollback-migrations.spec.ts`, this suite deliberately does NOT mock
 * `drizzle` — it exercises the real drizzle-orm `construct()` path so the
 * per-transaction Drizzle build is actually covered. The regression crashed
 * inside `construct()` with "Cannot read properties of undefined (reading
 * 'parsers')" because a postgres.js transaction client has no `.options`. These
 * tests reproduce that transaction shape (a callable tagged template with no
 * `.options`, fed by a parent connection that owns the `.options` bag) and
 * assert the runner builds the per-tx Drizzle instance and applies `up()`
 * without throwing.
 */

type SqlClientArg = Parameters<typeof applyMigrationModule>[0];

/**
 * Build a fake top-level `postgres` connection whose `.begin` runs the callback
 * with a transaction stub shaped like a real postgres.js TransactionSql: a
 * callable tagged template that records its queries and carries NO `.options`
 * of its own. Only the parent connection exposes the `.options` bag that
 * drizzle's `construct()` reads and mutates.
 */
function makeSqlClient() {
  const tx = jest.fn().mockResolvedValue(undefined);
  const begin = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  const sqlClient = Object.assign(jest.fn(), {
    begin,
    options: { parsers: {}, serializers: {} },
  }) as unknown as SqlClientArg;
  return { sqlClient, begin, tx };
}

describe('applyMigrationModule — real drizzle transaction (LS-8141)', () => {
  it('builds a per-tx Drizzle instance and applies up() without throwing', async () => {
    const { sqlClient, begin, tx } = makeSqlClient();
    let received: { db: unknown; sql: unknown } | undefined;
    const up = jest.fn((ctx: { db: unknown; sql: unknown }) => {
      received = ctx;
      return Promise.resolve();
    });

    await expect(
      applyMigrationModule(sqlClient, '20260101_000000_test.ts', { up }),
    ).resolves.toBeUndefined();

    expect(begin).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledTimes(1);
    expect(received).toBeDefined();
    const ctx = received as { db: unknown; sql: unknown };

    // up() received a REAL Drizzle instance bound to the transaction client...
    const db = ctx.db as ReturnType<typeof drizzle>;
    expect(typeof db.execute).toBe('function');
    expect((db as unknown as { $client: unknown }).$client).toBe(tx);
    // ...plus the raw transaction client for migrations that use `sql` directly.
    expect(ctx.sql).toBe(tx);

    // The bookkeeping INSERT ran on the same transaction with the hash.
    expect(tx).toHaveBeenCalledTimes(1);
    const [queryStrings, hashArg] = tx.mock.calls[0] as [string[], string];
    expect(queryStrings.join('')).toContain(
      'INSERT INTO drizzle.__drizzle_migrations',
    );
    expect(hashArg).toBe('20260101_000000_test.ts');
  });

  it('borrows the parent connection options onto the optionless tx client', async () => {
    const { sqlClient, tx } = makeSqlClient();

    await applyMigrationModule(sqlClient, '20260101_000000_test.ts', {
      up: () => Promise.resolve(),
    });

    // The tx stub started without `.options`; the runner borrows the parent's
    // so drizzle's construct() can install its transparent parsers.
    expect((tx as unknown as { options?: unknown }).options).toBe(
      (sqlClient as unknown as { options: unknown }).options,
    );
  });
});
