import { migrationStatus } from './migration-status';
import { getReadonlySql } from '../db.js';
import type { DbMigrateJobRow } from '../jobs.js';

jest.mock('../db.js');

const mockGetReadonlySql = getReadonlySql as jest.MockedFunction<
  typeof getReadonlySql
>;

/** A fake postgres tagged-template `sql` that resolves to the given rows. */
function fakeSql(rows: unknown[]) {
  return jest.fn(() => Promise.resolve(rows)) as unknown as Awaited<
    ReturnType<typeof getReadonlySql>
  >;
}

interface MigrationStatusPayload {
  available?: boolean;
  applied?: number;
  pending?: number;
  pendingNames?: string[];
  needsMigration?: boolean | null;
  jobId?: string;
  status?: string;
  terminal?: boolean;
  migrationNames?: string[];
  appliedNames?: string[];
  success?: boolean;
  error?: string;
  found?: boolean;
}

function parseBody(text: string): MigrationStatusPayload {
  return JSON.parse(text) as MigrationStatusPayload;
}

function jobRow(overrides: Partial<DbMigrateJobRow> = {}): DbMigrateJobRow {
  return {
    id: 'job-1',
    principal: 'client_id=abc sub=123',
    migration_names: '["a.ts","b.ts"]',
    payload: '{"migrations":[]}',
    status: 'running',
    result: null,
    created_at: new Date('2026-07-22T00:00:00Z'),
    updated_at: new Date(),
    ...overrides,
  };
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

    const payload = parseBody(result.content[0].text);
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

    const payload = parseBody(result.content[0].text);
    expect(payload.pending).toBe(0);
    expect(payload.needsMigration).toBe(false);
  });

  it('reports unavailable when the connection cannot be established', async () => {
    mockGetReadonlySql.mockRejectedValue(
      new Error('DB_HOST is not configured'),
    );

    const result = await migrationStatus({ localMigrationNames: ['a.ts'] });

    const payload = parseBody(result.content[0].text);
    expect(payload.available).toBe(false);
    expect(payload.needsMigration).toBeNull();
  });
});

describe('db_migration_status (async job polling, LS-8563)', () => {
  afterEach(() => jest.resetAllMocks());

  it('reports a running job with metadata but no result', async () => {
    mockGetReadonlySql.mockResolvedValue(fakeSql([jobRow()]));

    const result = await migrationStatus({ jobId: 'job-1' });

    const payload = parseBody(result.content[0].text);
    expect(payload.jobId).toBe('job-1');
    expect(payload.status).toBe('running');
    expect(payload.terminal).toBe(false);
    expect(payload.migrationNames).toEqual(['a.ts', 'b.ts']);
    expect(payload.applied).toBeUndefined();
  });

  it('reports a finished job with the synchronous db_migrate result shape', async () => {
    mockGetReadonlySql.mockResolvedValue(
      fakeSql([
        jobRow({
          status: 'done',
          result: JSON.stringify({
            applied: 2,
            appliedNames: ['a.ts', 'b.ts'],
            skipped: [],
            success: true,
          }),
        }),
      ]),
    );

    const result = await migrationStatus({ jobId: 'job-1' });

    const payload = parseBody(result.content[0].text);
    expect(payload.status).toBe('done');
    expect(payload.terminal).toBe(true);
    expect(payload.applied).toBe(2);
    expect(payload.appliedNames).toEqual(['a.ts', 'b.ts']);
    expect(payload.success).toBe(true);
  });

  it('derives orphaned for a running job whose heartbeat exceeded the stale cutoff', async () => {
    mockGetReadonlySql.mockResolvedValue(
      fakeSql([jobRow({ updated_at: new Date(Date.now() - 2_000_000) })]),
    );

    const result = await migrationStatus({ jobId: 'job-1' });

    const payload = parseBody(result.content[0].text);
    expect(payload.status).toBe('orphaned');
    expect(payload.terminal).toBe(true);
    expect(payload.success).toBe(false);
    expect(String(payload.error)).toContain('heartbeat');
  });

  it('errors on an unknown job id', async () => {
    mockGetReadonlySql.mockResolvedValue(fakeSql([]));

    const result = await migrationStatus({ jobId: 'nope' });

    expect(result.isError).toBe(true);
    const payload = parseBody(result.content[0].text);
    expect(payload.found).toBe(false);
  });
});
