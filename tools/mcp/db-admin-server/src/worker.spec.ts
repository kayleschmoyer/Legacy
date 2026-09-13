import { runDbMigrateWorker } from './worker.js';
import { getMigrationSql } from './db.js';
import { finishJob, heartbeatJob, loadJob } from './jobs.js';
import { applyMigrationBatch } from './tools/migrate.js';
import type { DbMigrateJobRow } from './jobs.js';

jest.mock('./db.js');
jest.mock('./jobs.js');
jest.mock('./tools/migrate.js', () => ({
  applyMigrationBatch: jest.fn(),
}));

const mockGetMigrationSql = getMigrationSql as jest.MockedFunction<
  typeof getMigrationSql
>;
const mockLoadJob = loadJob as jest.MockedFunction<typeof loadJob>;
const mockFinishJob = finishJob as jest.MockedFunction<typeof finishJob>;
const mockHeartbeat = heartbeatJob as jest.MockedFunction<typeof heartbeatJob>;
const mockBatch = applyMigrationBatch as jest.MockedFunction<
  typeof applyMigrationBatch
>;

const SQL = {} as Awaited<ReturnType<typeof getMigrationSql>>;

function row(overrides: Partial<DbMigrateJobRow> = {}): DbMigrateJobRow {
  return {
    id: 'job-1',
    principal: 'client_id=abc sub=123',
    migration_names: '["20260616_120000_a.ts"]',
    payload: JSON.stringify({
      migrations: [
        {
          name: '20260616_120000_a.ts',
          hash: '20260616_120000_a.ts',
          jsSource: 'exports.up = async () => {};',
        },
      ],
    }),
    status: 'running',
    result: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('runDbMigrateWorker', () => {
  beforeEach(() => {
    mockGetMigrationSql.mockResolvedValue(SQL);
    mockLoadJob.mockResolvedValue(row());
    mockBatch.mockResolvedValue({
      applied: 1,
      appliedNames: ['20260616_120000_a.ts'],
      skipped: [],
      success: true,
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('applies the persisted batch and writes a done terminal state', async () => {
    await runDbMigrateWorker('job-1');

    // The batch runs with the principal persisted on the row (audit, AC7).
    expect(mockBatch).toHaveBeenCalledWith(
      SQL,
      [expect.objectContaining({ name: '20260616_120000_a.ts' })],
      'client_id=abc sub=123',
      expect.any(Function),
    );
    expect(mockFinishJob).toHaveBeenCalledWith(
      SQL,
      'job-1',
      'done',
      expect.stringContaining('"success":true'),
    );
  });

  it('wires the progress callback to the job heartbeat', async () => {
    await runDbMigrateWorker('job-1');

    const onProgress = mockBatch.mock.calls[0][3];
    await onProgress?.();
    expect(mockHeartbeat).toHaveBeenCalledWith(SQL, 'job-1');
  });

  it('writes a failed terminal state when the batch fails', async () => {
    mockBatch.mockResolvedValue({
      applied: 0,
      appliedNames: [],
      skipped: [],
      success: false,
      failed: '20260616_120000_a.ts',
      error: 'syntax error',
    });

    await runDbMigrateWorker('job-1');

    expect(mockFinishJob).toHaveBeenCalledWith(
      SQL,
      'job-1',
      'failed',
      expect.stringContaining('syntax error'),
    );
  });

  it('writes a failed terminal state on an unexpected error', async () => {
    mockBatch.mockRejectedValue(new Error('connection reset'));

    await runDbMigrateWorker('job-1');

    expect(mockFinishJob).toHaveBeenCalledWith(
      SQL,
      'job-1',
      'failed',
      expect.stringContaining('connection reset'),
    );
  });

  it('does nothing when the job row is missing', async () => {
    mockLoadJob.mockResolvedValue(null);

    await runDbMigrateWorker('job-x');

    expect(mockBatch).not.toHaveBeenCalled();
    expect(mockFinishJob).not.toHaveBeenCalled();
  });

  it('never re-applies a job that already reached a terminal state', async () => {
    mockLoadJob.mockResolvedValue(row({ status: 'done' }));

    await runDbMigrateWorker('job-1');

    expect(mockBatch).not.toHaveBeenCalled();
    expect(mockFinishJob).not.toHaveBeenCalled();
  });

  it('exits quietly when the database is unavailable (stale reaper covers it)', async () => {
    mockGetMigrationSql.mockRejectedValue(new Error('no route to host'));

    await expect(runDbMigrateWorker('job-1')).resolves.toBeUndefined();
    expect(mockFinishJob).not.toHaveBeenCalled();
  });
});
