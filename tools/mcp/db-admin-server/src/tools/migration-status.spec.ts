import { migrationStatus } from './migration-status';
import { getReadonlySql } from '../db.js';

jest.mock('../db.js');

const mockGetReadonlySql = getReadonlySql as jest.MockedFunction<
  typeof getReadonlySql
>;

/** A fake postgres tagged-template `sql` that resolves to the given rows. */
function fakeSql(rows: { hash: string }[]) {
  return jest.fn(async () => rows) as unknown as Awaited<
    ReturnType<typeof getReadonlySql>
  >;
}

describe('db_migration_status (hosted)', () => {
  afterEach(() => jest.resetAllMocks());

  it('computes pending as local names not present in applied', async () => {
    mockGetReadonlySql.mockResolvedValue(
      fakeSql([{ hash: 'a.ts' }, { hash: 'b.ts' }]),
    );

    const result = await migrationStatus({
      localMigrationNames: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.available).toBe(true);
    expect(payload.applied).toBe(2);
    expect(payload.pending).toBe(2);
    expect(payload.pendingNames).toEqual(['c.ts', 'd.ts']);
    expect(payload.needsMigration).toBe(true);
  });

  it('reports no pending when all local migrations are applied', async () => {
    mockGetReadonlySql.mockResolvedValue(
      fakeSql([{ hash: 'a.ts' }, { hash: 'b.ts' }]),
    );

    const result = await migrationStatus({
      localMigrationNames: ['a.ts', 'b.ts'],
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.pending).toBe(0);
    expect(payload.needsMigration).toBe(false);
  });

  it('reports unavailable when the connection cannot be established', async () => {
    mockGetReadonlySql.mockRejectedValue(
      new Error('DB_HOST is not configured'),
    );

    const result = await migrationStatus({ localMigrationNames: ['a.ts'] });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.available).toBe(false);
    expect(payload.needsMigration).toBeNull();
  });
});
