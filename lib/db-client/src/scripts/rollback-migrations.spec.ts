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
 * Build a fake `postgres` client: a callable tagged template that records every
 * templated query so tests can assert whether (and with what values) the
 * bookkeeping INSERT ran. Migrations run with autocommit semantics (no
 * `begin` transaction — LS-8254), so the client is invoked directly.
 */
function makeSqlClient() {
  const sqlClient = jest
    .fn()
    .mockResolvedValue(undefined) as unknown as SqlClientArg;
  return { sqlClient, calls: sqlClient as unknown as jest.Mock };
}

/** Fake drizzle db backed by a jest.Mock `execute`. */
function makeDb(execute: jest.Mock): DrizzleDbArg {
  return { execute } as unknown as DrizzleDbArg;
}

describe('applyMigrationModule', () => {
  it('runs up() then records the hash (autocommit, no transaction)', async () => {
    const { sqlClient, calls } = makeSqlClient();
    const up = jest.fn().mockResolvedValue(undefined);

    await applyMigrationModule(sqlClient, '20260101_000000_test.ts', { up });

    // up() received the connection-bound db and the raw sql client.
    expect(up).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledWith({ db: mockTxDb, sql: sqlClient });

    // The bookkeeping INSERT ran with the hash, directly on the connection.
    expect(calls).toHaveBeenCalledTimes(1);
    const [queryStrings, hashArg] = calls.mock.calls[0] as [string[], string];
    expect(queryStrings.join('')).toContain(
      'INSERT INTO drizzle.__drizzle_migrations',
    );
    expect(hashArg).toBe('20260101_000000_test.ts');

    // up() must run before the hash is recorded.
    expect(up.mock.invocationCallOrder[0]).toBeLessThan(
      calls.mock.invocationCallOrder[0],
    );
  });

  it('does NOT record the hash when up() throws', async () => {
    const { sqlClient, calls } = makeSqlClient();
    const up = jest.fn().mockRejectedValue(new Error('migration boom'));

    await expect(
      applyMigrationModule(sqlClient, '20260101_000000_test.ts', { up }),
    ).rejects.toThrow('migration boom');

    expect(up).toHaveBeenCalledTimes(1);
    // up() failed before the INSERT, so the hash is never recorded — the
    // migration will be retried (migrations are idempotent).
    expect(calls).not.toHaveBeenCalled();
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
    const { sqlClient, calls } = makeSqlClient();

    await runMigrationsUp(db, sqlClient);

    // Already applied → applyMigrationModule is never invoked, so nothing runs
    // on the connection to re-apply it.
    expect(calls).not.toHaveBeenCalled();
  });
});
