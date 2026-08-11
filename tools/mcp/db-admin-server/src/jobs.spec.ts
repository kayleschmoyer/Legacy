import type postgres from 'postgres';
import { insertJob, isJobStale, jobStaleMs } from './jobs';

describe('jobStaleMs', () => {
  const original = process.env['DB_MIGRATE_JOB_STALE_MS'];

  afterEach(() => {
    if (original === undefined) delete process.env['DB_MIGRATE_JOB_STALE_MS'];
    else process.env['DB_MIGRATE_JOB_STALE_MS'] = original;
  });

  it('defaults to the worker ceiling plus a buffer', () => {
    delete process.env['DB_MIGRATE_JOB_STALE_MS'];
    expect(jobStaleMs()).toBe(960_000);
  });

  it('is env-tunable', () => {
    process.env['DB_MIGRATE_JOB_STALE_MS'] = '120000';
    expect(jobStaleMs()).toBe(120_000);
  });
});

describe('isJobStale', () => {
  it('is false for a fresh running job', () => {
    expect(isJobStale({ status: 'running', updated_at: new Date() })).toBe(
      false,
    );
  });

  it('is true for a running job past the stale cutoff', () => {
    expect(
      isJobStale({
        status: 'running',
        updated_at: new Date(Date.now() - jobStaleMs() - 1_000),
      }),
    ).toBe(true);
  });

  it('is never true for a terminal job, however old', () => {
    expect(
      isJobStale({
        status: 'done',
        updated_at: new Date(Date.now() - 10 * jobStaleMs()),
      }),
    ).toBe(false);
  });
});

describe('insertJob', () => {
  it('returns null when the single-running-job index rejects the insert', async () => {
    // ON CONFLICT DO NOTHING yields zero returned rows on conflict.
    const sql = jest.fn(() => Promise.resolve([])) as unknown as postgres.Sql;

    const id = await insertJob(sql, {
      principal: 'p',
      migrationNames: ['a.ts'],
      payload: '{"migrations":[]}',
    });

    expect(id).toBeNull();
  });

  it('returns the generated id on a successful insert', async () => {
    const sql = jest.fn((...args: unknown[]) => {
      // Echo back the id bound as the first template parameter.
      return Promise.resolve([{ id: args[1] }]);
    }) as unknown as postgres.Sql;

    const id = await insertJob(sql, {
      principal: 'p',
      migrationNames: ['a.ts'],
      payload: '{"migrations":[]}',
    });

    expect(typeof id).toBe('string');
    expect(id).toHaveLength(36); // uuid
  });
});
