import { applyMigrationModule } from '@legacy-sports/db-client/src/scripts/migration-runner.js';
import {
  applyMigrationBatch,
  evalMigrationModule,
  migrate,
  migrationRequire,
  type NormalizedMigrationItem,
  transpileTsSource,
} from './migrate.js';
import { getMigrationSql } from '../db.js';
import {
  ensureJobsTable,
  findRunningJob,
  finishJob,
  insertJob,
  reapStaleJobs,
} from '../jobs.js';
import { invokeWorkerAsync } from '../invoke-worker.js';
import type { McpCaller } from '../audit.js';

jest.mock('../db.js');
jest.mock('../jobs.js');
jest.mock('../invoke-worker.js');
// Replace the migration-runner with a factory so the real module never runs
// under @swc/jest; we only need to observe applyMigrationModule's calls.
jest.mock('@legacy-sports/db-client/src/scripts/migration-runner.js', () => ({
  applyMigrationModule: jest.fn(),
}));
// Keep the drizzle driver imports (used only to populate the require-shim
// allowlist) hermetic so no real driver is loaded. drizzle-orm itself stays
// real: it loads no driver, and the shim test only checks it resolves.
jest.mock('drizzle-orm/pg-core', () => ({}));
jest.mock('drizzle-orm/postgres-js', () => ({ drizzle: jest.fn() }));

const mockGetMigrationSql = getMigrationSql as jest.MockedFunction<
  typeof getMigrationSql
>;
const mockApply = applyMigrationModule as jest.MockedFunction<
  typeof applyMigrationModule
>;
const mockEnsureJobsTable = ensureJobsTable as jest.MockedFunction<
  typeof ensureJobsTable
>;
const mockReapStaleJobs = reapStaleJobs as jest.MockedFunction<
  typeof reapStaleJobs
>;
const mockFindRunningJob = findRunningJob as jest.MockedFunction<
  typeof findRunningJob
>;
const mockInsertJob = insertJob as jest.MockedFunction<typeof insertJob>;
const mockFinishJob = finishJob as jest.MockedFunction<typeof finishJob>;
const mockInvokeWorker = invokeWorkerAsync as jest.MockedFunction<
  typeof invokeWorkerAsync
>;

const CALLER: McpCaller = { clientId: 'client-abc', sub: 'sub-123' };

/**
 * Fake `postgres` client: callable as a tagged template (returns the applied
 * rows) and exposing `unsafe()` for the CREATE SCHEMA/TABLE statements.
 */
function makeSql(appliedHashes: string[]) {
  return Object.assign(
    jest.fn(() => Promise.resolve(appliedHashes.map((hash) => ({ hash })))),
    { unsafe: jest.fn(() => Promise.resolve(undefined)) },
  ) as never;
}

/** A valid transpiled-migration jsSource that exports an `up()`. */
function upSource(): string {
  return `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.up = async () => {};`;
}

function item(name: string, jsSource = upSource()): NormalizedMigrationItem {
  return { name, hash: name, jsSource };
}

function parse(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

describe('migrationRequire (sandbox allowlist)', () => {
  it('resolves postgres and drizzle-orm', () => {
    expect(migrationRequire('postgres')).toBeDefined();
    expect(migrationRequire('drizzle-orm')).toBeDefined();
  });

  it('rejects any other specifier', () => {
    expect(() => migrationRequire('fs')).toThrow(/not allowed/);
    expect(() => migrationRequire('child_process')).toThrow(/not allowed/);
    expect(() => migrationRequire('../secrets')).toThrow(/not allowed/);
  });
});

describe('transpileTsSource (server-side TS transpile, LS-9582)', () => {
  it('transpiles a named export to CJS that evalMigrationModule accepts', () => {
    const js = transpileTsSource(
      'export const up = async ({ db }: { db: unknown }): Promise<void> => {};',
    );
    const mod = evalMigrationModule(js);
    expect(typeof mod.up).toBe('function');
  });

  it('erases type-only imports', () => {
    const js = transpileTsSource(
      [
        "import type { PgDatabase } from 'drizzle-orm/pg-core';",
        'export const up = async ({ db }: { db: PgDatabase<unknown> }): Promise<void> => {};',
      ].join('\n'),
    );
    expect(js).not.toContain('drizzle-orm/pg-core');
    const mod = evalMigrationModule(js);
    expect(typeof mod.up).toBe('function');
  });

  it('throws with a clear message on invalid syntax', () => {
    expect(() => transpileTsSource('export const up = async ( => {};')).toThrow(
      /Failed to transpile migration TypeScript/,
    );
  });
});

describe('evalMigrationModule', () => {
  it('evaluates CJS source into a module exposing up()', () => {
    const mod = evalMigrationModule(upSource());
    expect(typeof mod.up).toBe('function');
  });

  it('handles the esbuild module.exports = __toCommonJS(...) shape', () => {
    // Mirrors esbuild cjs output: up is exposed via a getter on a fresh object
    // assigned to module.exports, and `const up` is declared after the assign.
    const esbuildShaped = [
      '"use strict";',
      'var e = {};',
      'Object.defineProperty(e, "up", { get: () => up, enumerable: true });',
      'module.exports = e;',
      'const up = async () => {};',
    ].join('\n');

    const mod = evalMigrationModule(esbuildShaped);
    expect(typeof mod.up).toBe('function');
  });

  it('throws when the module does not export up()', () => {
    expect(() => evalMigrationModule('"use strict";')).toThrow(/up\(\)/);
  });

  it('throws when the source requires a disallowed module', () => {
    const src = `const fs = require('fs');\nexports.up = async () => {};`;
    expect(() => evalMigrationModule(src)).toThrow(/not allowed/);
  });
});

describe('applyMigrationBatch (worker apply loop)', () => {
  beforeEach(() => {
    mockApply.mockResolvedValue(undefined);
  });

  afterEach(() => jest.clearAllMocks());

  it('applies pending migrations in order and skips already-applied ones', async () => {
    const result = await applyMigrationBatch(
      makeSql(['20260616_120000_a.ts']),
      [
        item('20260616_130000_c.ts'),
        item('20260616_120000_a.ts'),
        item('20260616_125000_b.ts'),
      ],
      'principal-x',
    );

    expect(result.success).toBe(true);
    expect(result.applied).toBe(2);
    expect(result.appliedNames).toEqual([
      '20260616_125000_b.ts',
      '20260616_130000_c.ts',
    ]);
    expect(result.skipped).toEqual(['20260616_120000_a.ts']);

    // applyMigrationModule called once per applied migration, with (sql, hash, module).
    expect(mockApply).toHaveBeenCalledTimes(2);
    expect(mockApply.mock.calls[0][1]).toBe('20260616_125000_b.ts');
  });

  it('stops on the first failure and reports the failed migration', async () => {
    mockApply
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('syntax error at or near "CRATE"'));

    const result = await applyMigrationBatch(
      makeSql([]),
      [
        item('20260616_120000_a.ts'),
        item('20260616_130000_b.ts'),
        item('20260616_140000_c.ts'),
      ],
      'principal-x',
    );

    expect(result.success).toBe(false);
    expect(result.applied).toBe(1);
    expect(result.appliedNames).toEqual(['20260616_120000_a.ts']);
    expect(result.failed).toBe('20260616_130000_b.ts');
    expect(String(result.error)).toContain('CRATE');
    // The third migration is never attempted.
    expect(mockApply).toHaveBeenCalledTimes(2);
  });

  it('awaits the progress heartbeat after every processed migration', async () => {
    const onProgress = jest.fn(() => Promise.resolve(undefined));

    await applyMigrationBatch(
      makeSql(['20260616_120000_a.ts']),
      [item('20260616_120000_a.ts'), item('20260616_125000_b.ts')],
      'principal-x',
      onProgress,
    );

    // Once for the skip, once for the applied migration.
    expect(onProgress).toHaveBeenCalledTimes(2);
  });
});

describe('db_migrate (async submit)', () => {
  const originalEnv = process.env['NODE_ENV'];

  beforeEach(() => {
    process.env['NODE_ENV'] = 'dev';
    mockGetMigrationSql.mockResolvedValue(makeSql([]));
    mockEnsureJobsTable.mockResolvedValue(undefined);
    mockReapStaleJobs.mockResolvedValue([]);
    mockFindRunningJob.mockResolvedValue(null);
    mockInsertJob.mockResolvedValue('job-1');
    mockInvokeWorker.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
    jest.clearAllMocks();
  });

  it('refuses to run outside dev environments', async () => {
    process.env['NODE_ENV'] = 'production';

    const result = await migrate(
      { migrations: [item('20260616_120000_a.ts')] },
      CALLER,
    );

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(String(payload.error)).toContain('disabled outside dev');
    expect(mockInsertJob).not.toHaveBeenCalled();
  });

  it('rejects an invalid migration name', async () => {
    const result = await migrate(
      { migrations: [item('not-a-migration.ts')] },
      CALLER,
    );

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(String(payload.error)).toContain('Invalid migration name');
    expect(mockInsertJob).not.toHaveBeenCalled();
  });

  it('rejects an over-large migration count', async () => {
    const migrations = Array.from({ length: 51 }, (_, i) =>
      item(`2026061${i % 10}_120000_m${i}.ts`),
    );

    const result = await migrate({ migrations }, CALLER);

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(String(payload.error)).toContain('Too many migrations');
  });

  it('transpiles tsSource server-side and submits it as jsSource (LS-9582)', async () => {
    const result = await migrate(
      {
        migrations: [
          {
            name: '20260616_120000_a.ts',
            hash: '20260616_120000_a.ts',
            tsSource: 'export const up = async () => {};',
          },
        ],
      },
      CALLER,
    );

    expect(result.isError).toBeUndefined();
    const inserted = mockInsertJob.mock.calls[0][1];
    const persisted = JSON.parse(inserted.payload) as {
      migrations: NormalizedMigrationItem[];
    };
    expect(persisted.migrations).toHaveLength(1);
    expect(persisted.migrations[0].jsSource).toContain('exports.up');
    expect('tsSource' in persisted.migrations[0]).toBe(false);
  });

  it('rejects a migration that provides both jsSource and tsSource', async () => {
    const result = await migrate(
      {
        migrations: [
          {
            name: '20260616_120000_a.ts',
            hash: '20260616_120000_a.ts',
            jsSource: upSource(),
            tsSource: 'export const up = async () => {};',
          },
        ],
      },
      CALLER,
    );

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(String(payload.error)).toContain(
      'provided both jsSource and tsSource',
    );
    expect(mockInsertJob).not.toHaveBeenCalled();
  });

  it('rejects a migration that provides neither jsSource nor tsSource', async () => {
    const result = await migrate(
      {
        migrations: [
          { name: '20260616_120000_a.ts', hash: '20260616_120000_a.ts' },
        ],
      },
      CALLER,
    );

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(String(payload.error)).toContain(
      'must provide jsSource or tsSource',
    );
    expect(mockInsertJob).not.toHaveBeenCalled();
  });

  it('rejects unparseable tsSource with a clear error', async () => {
    const result = await migrate(
      {
        migrations: [
          {
            name: '20260616_120000_a.ts',
            hash: '20260616_120000_a.ts',
            tsSource: 'export const up = async ( => {};',
          },
        ],
      },
      CALLER,
    );

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(String(payload.error)).toContain('Failed to transpile');
    expect(mockInsertJob).not.toHaveBeenCalled();
  });

  it('persists the job in apply order and returns { jobId, status: running }', async () => {
    const result = await migrate(
      {
        migrations: [
          item('20260616_130000_c.ts'),
          item('20260616_120000_a.ts'),
        ],
      },
      CALLER,
    );

    expect(result.isError).toBeUndefined();
    const payload = parse(result.content[0].text);
    expect(payload.jobId).toBe('job-1');
    expect(payload.status).toBe('running');
    expect(payload.joined).toBe(false);
    expect(payload.submitted).toBe(2);

    // Table ensured + stale rows reaped before submitting.
    expect(mockEnsureJobsTable).toHaveBeenCalled();
    expect(mockReapStaleJobs).toHaveBeenCalled();

    // Payload persisted ordered by timestamp, names alongside.
    const inserted = mockInsertJob.mock.calls[0][1];
    expect(inserted.migrationNames).toEqual([
      '20260616_120000_a.ts',
      '20260616_130000_c.ts',
    ]);
    const persisted = JSON.parse(inserted.payload) as {
      migrations: NormalizedMigrationItem[];
    };
    expect(persisted.migrations.map((m) => m.name)).toEqual([
      '20260616_120000_a.ts',
      '20260616_130000_c.ts',
    ]);
    // Audit principal rides on the row so the worker keys its log lines to it.
    expect(inserted.principal).toContain('client-abc');

    // The async worker is invoked with the new job id — nothing is applied inline.
    expect(mockInvokeWorker).toHaveBeenCalledWith('job-1');
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('joins an already-running job instead of starting a second worker', async () => {
    mockFindRunningJob.mockResolvedValue('job-9');

    const result = await migrate(
      { migrations: [item('20260616_120000_a.ts')] },
      CALLER,
    );

    const payload = parse(result.content[0].text);
    expect(payload.jobId).toBe('job-9');
    expect(payload.joined).toBe(true);
    expect(mockInsertJob).not.toHaveBeenCalled();
    expect(mockInvokeWorker).not.toHaveBeenCalled();
  });

  it('joins the winner when a concurrent submit wins the insert race', async () => {
    mockInsertJob.mockResolvedValue(null);
    mockFindRunningJob
      .mockResolvedValueOnce(null) // pre-insert check
      .mockResolvedValueOnce('job-2'); // post-conflict lookup

    const result = await migrate(
      { migrations: [item('20260616_120000_a.ts')] },
      CALLER,
    );

    const payload = parse(result.content[0].text);
    expect(payload.jobId).toBe('job-2');
    expect(payload.joined).toBe(true);
    expect(mockInvokeWorker).not.toHaveBeenCalled();
  });

  it('fails the job and reports the error when the worker invoke fails', async () => {
    mockInvokeWorker.mockRejectedValue(new Error('AccessDenied'));

    const result = await migrate(
      { migrations: [item('20260616_120000_a.ts')] },
      CALLER,
    );

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(String(payload.error)).toContain('AccessDenied');
    // The job row is transitioned to failed so pollers see a terminal state.
    expect(mockFinishJob).toHaveBeenCalledWith(
      expect.anything(),
      'job-1',
      'failed',
      expect.stringContaining('AccessDenied'),
    );
  });
});
