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
import { fetchMigrationFromRepo, gitBlobSha } from '../github-source.js';

jest.mock('../db.js');
jest.mock('../jobs.js');
jest.mock('../invoke-worker.js');
// Keep the real path/ref validation; only the network fetch is mocked.
jest.mock('../github-source.js', () => ({
  ...jest.requireActual<typeof import('../github-source.js')>(
    '../github-source.js',
  ),
  fetchMigrationFromRepo: jest.fn(),
}));
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

const mockFetchMigration = fetchMigrationFromRepo as jest.MockedFunction<
  typeof fetchMigrationFromRepo
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
      'provided more than one of jsSource, tsSource and ref',
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
      'must provide jsSource, tsSource or ref',
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

describe('db_migrate by repo ref (LS-10974)', () => {
  const originalEnv = process.env['NODE_ENV'];
  const NAME = '20261006_180000_backfill_big.ts';
  const PATH = `lib/db-client/migrations/${NAME}`;

  /** A ~100 KB migration: an up() plus a large inline seed array. */
  const BIG_SOURCE = [
    "import type { PgDatabase } from 'drizzle-orm/pg-core';",
    `const ROWS: string[] = ${JSON.stringify(
      Array.from({ length: 2_500 }, (_, i) => `row-${i}-${'x'.repeat(30)}`),
    )};`,
    'export const up = async ({ db }: { db: PgDatabase<never> }): Promise<void> => {',
    '  void db;',
    '  void ROWS.length;',
    '};',
  ].join('\n');

  function fetched(source = BIG_SOURCE) {
    const bytes = Buffer.from(source);
    return {
      name: NAME,
      tsSource: source,
      source: {
        name: NAME,
        repo: 'bkrupa/legacy-sports',
        path: PATH,
        ref: 'claude/feature',
        blobSha: gitBlobSha(bytes),
        sha256: 'sha256-of-file',
        bytes: bytes.length,
      },
    };
  }

  beforeEach(() => {
    process.env['NODE_ENV'] = 'dev';
    mockGetMigrationSql.mockResolvedValue(makeSql([]));
    mockEnsureJobsTable.mockResolvedValue(undefined);
    mockReapStaleJobs.mockResolvedValue([]);
    mockFindRunningJob.mockResolvedValue(null);
    mockInsertJob.mockResolvedValue('job-1');
    mockInvokeWorker.mockResolvedValue(undefined);
    mockFetchMigration.mockResolvedValue(fetched());
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
    jest.clearAllMocks();
  });

  it('submits a ~100 KB migration given only { branch, path } and applies it with provenance', async () => {
    expect(BIG_SOURCE.length).toBeGreaterThan(95_000);

    const result = await migrate(
      { migrations: [{ ref: { branch: 'claude/feature', path: PATH } }] },
      CALLER,
    );

    expect(result.isError).toBeUndefined();
    expect(mockFetchMigration).toHaveBeenCalledWith({
      branch: 'claude/feature',
      path: PATH,
    });
    const ack = parse(result.content[0].text);
    expect(ack.jobId).toBe('job-1');
    expect(ack.sources).toEqual([fetched().source]);

    // name/hash default to the filename; the transpiled source + provenance persist.
    const inserted = mockInsertJob.mock.calls[0][1];
    expect(inserted.migrationNames).toEqual([NAME]);
    const persisted = JSON.parse(inserted.payload) as {
      migrations: NormalizedMigrationItem[];
    };
    expect(persisted.migrations[0]).toMatchObject({
      name: NAME,
      hash: NAME,
      source: fetched().source,
    });
    expect(persisted.migrations[0].jsSource).toContain('exports.up');

    // The worker path evaluates the transpiled module and reports the blob SHA.
    mockApply.mockResolvedValue(undefined);
    const applied = await applyMigrationBatch(
      makeSql([]),
      persisted.migrations,
      'p',
    );
    expect(applied.success).toBe(true);
    expect(applied.appliedNames).toEqual([NAME]);
    expect(applied.sources?.[0].blobSha).toBe(
      gitBlobSha(Buffer.from(BIG_SOURCE)),
    );
  });

  it('reports provenance for an already-applied ref migration (skipped, idempotent)', async () => {
    const result = await applyMigrationBatch(
      makeSql([NAME]),
      [{ ...item(NAME), source: fetched().source }],
      'p',
    );

    expect(result.skipped).toEqual([NAME]);
    expect(result.sources).toEqual([fetched().source]);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('rejects a path outside lib/db-client/migrations/ before fetching', async () => {
    const result = await migrate(
      {
        migrations: [
          { ref: { branch: 'main', path: 'lib/db-client/src/schema.ts' } },
        ],
      },
      CALLER,
    );

    expect(result.isError).toBe(true);
    expect(String(parse(result.content[0].text).error)).toContain(
      'is not allowed',
    );
    expect(mockFetchMigration).not.toHaveBeenCalled();
    expect(mockInsertJob).not.toHaveBeenCalled();
  });

  it('rejects a name that does not match the ref filename', async () => {
    const result = await migrate(
      {
        migrations: [
          {
            name: '20260101_000000_other.ts',
            ref: { branch: 'main', path: PATH },
          },
        ],
      },
      CALLER,
    );

    expect(result.isError).toBe(true);
    expect(String(parse(result.content[0].text).error)).toContain(
      'does not match ref path filename',
    );
    expect(mockFetchMigration).not.toHaveBeenCalled();
  });

  it('rejects a migration that provides both ref and tsSource', async () => {
    const result = await migrate(
      {
        migrations: [
          {
            tsSource: 'export const up = async () => {};',
            ref: { branch: 'main', path: PATH },
          },
        ],
      },
      CALLER,
    );

    expect(result.isError).toBe(true);
    expect(String(parse(result.content[0].text).error)).toContain(
      'more than one of jsSource, tsSource and ref',
    );
  });

  it('surfaces a GitHub fetch failure without creating a job', async () => {
    mockFetchMigration.mockRejectedValue(
      new Error(`Migration '${PATH}' not found at ref 'gone'`),
    );

    const result = await migrate(
      { migrations: [{ ref: { branch: 'gone', path: PATH } }] },
      CALLER,
    );

    expect(result.isError).toBe(true);
    expect(String(parse(result.content[0].text).error)).toContain(
      'not found at ref',
    );
    expect(mockInsertJob).not.toHaveBeenCalled();
  });

  it('mixes ref and inline items and only reports sources for ref items', async () => {
    const result = await migrate(
      {
        migrations: [
          item('20260101_000000_inline.ts'),
          { ref: { sha: 'abc1234', path: PATH } },
        ],
      },
      CALLER,
    );

    expect(result.isError).toBeUndefined();
    const ack = parse(result.content[0].text);
    expect(ack.submitted).toBe(2);
    expect(ack.sources).toEqual([fetched().source]);
  });
});
