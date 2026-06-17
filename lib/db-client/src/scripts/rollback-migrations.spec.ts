import { readdirSync } from 'fs';

// Drizzle is mocked so applyMigrationModule's `drizzle(tx)` returns a sentinel
// we can assert against, without touching a real connection.
const mockTxDb = { __brand: 'tx-db' } as const;
jest.mock('drizzle-orm/postgres-js', () => ({
  drizzle: jest.fn(() => mockTxDb),
}));

jest.mock('fs', () => ({
  readdirSync: jest.fn(() => []),
}));

import {
  applyMigrationModule,
  getAppliedMigrations,
  runMigrationsUp,
} from './rollback-migrations';

type SqlClientArg = Parameters<typeof applyMigrationModule>[0];
type DrizzleDbArg = Parameters<typeof getAppliedMigrations>[0];

const mockedReaddir = jest.mocked(readdirSync);

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Build a fake `postgres` client whose `begin` runs the callback with a
 * tagged-template transaction stub. The stub records every templated query so
 * tests can assert whether (and with what values) the bookkeeping INSERT ran.
 */
function makeSqlClient() {
  const tx = jest.fn().mockResolvedValue(undefined);
  const begin = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(tx),
  );
  // The real client is callable + has .begin; tests only use .begin here.
  const sqlClient = Object.assign(jest.fn(), {
    begin,
  }) as unknown as SqlClientArg;
  return { sqlClient, begin, tx };
}

/** Fake drizzle db backed by a jest.Mock `execute`. */
function makeDb(execute: jest.Mock): DrizzleDbArg {
  return { execute } as unknown as DrizzleDbArg;
}

describe('applyMigrationModule', () => {
  it('runs up() and records the hash inside one transaction', async () => {
    const { sqlClient, begin, tx } = makeSqlClient();
    const up = jest.fn().mockResolvedValue(undefined);

    await applyMigrationModule(sqlClient, '20260101_000000_test.ts', { up });

    // Wrapped in exactly one transaction.
    expect(begin).toHaveBeenCalledTimes(1);

    // up() received the transaction-scoped db and sql.
    expect(up).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledWith({ db: mockTxDb, sql: tx });

    // The bookkeeping INSERT ran with the hash, on the same transaction.
    expect(tx).toHaveBeenCalledTimes(1);
    const [queryStrings, hashArg] = tx.mock.calls[0] as [string[], string];
    expect(queryStrings.join('')).toContain(
      'INSERT INTO drizzle.__drizzle_migrations',
    );
    expect(hashArg).toBe('20260101_000000_test.ts');

    // up() must run before the hash is recorded.
    expect(up.mock.invocationCallOrder[0]).toBeLessThan(
      tx.mock.invocationCallOrder[0],
    );
  });

  it('rolls back and does NOT record the hash when up() throws', async () => {
    const { sqlClient, begin, tx } = makeSqlClient();
    const up = jest.fn().mockRejectedValue(new Error('migration boom'));

    await expect(
      applyMigrationModule(sqlClient, '20260101_000000_test.ts', { up }),
    ).rejects.toThrow('migration boom');

    expect(begin).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledTimes(1);
    // The transaction aborts before the INSERT, so the hash is never recorded.
    expect(tx).not.toHaveBeenCalled();
  });
});

describe('getAppliedMigrations', () => {
  it('returns the recorded hashes', async () => {
    const db = makeDb(
      jest
        .fn()
        .mockResolvedValue([
          { hash: '20260101_000000_a.ts' },
          { hash: '20260102_000000_b.ts' },
        ]),
    );

    await expect(getAppliedMigrations(db)).resolves.toEqual([
      '20260101_000000_a.ts',
      '20260102_000000_b.ts',
    ]);
  });

  it('returns an empty list when the query fails', async () => {
    const db = makeDb(jest.fn().mockRejectedValue(new Error('no table')));

    await expect(getAppliedMigrations(db)).resolves.toEqual([]);
  });
});

describe('runMigrationsUp', () => {
  it('skips migrations that are already applied', async () => {
    const filename = '20260101_000000_already_applied.ts';
    mockedReaddir.mockReturnValue([filename] as unknown as ReturnType<
      typeof readdirSync
    >);

    // db.execute backs getAppliedMigrations — report the file as already applied.
    const db = makeDb(jest.fn().mockResolvedValue([{ hash: filename }]));
    const { sqlClient, begin } = makeSqlClient();

    await runMigrationsUp(db, sqlClient);

    // Already applied → no transaction is opened to re-apply it.
    expect(begin).not.toHaveBeenCalled();
  });
});
