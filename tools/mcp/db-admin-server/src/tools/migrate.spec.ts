import {
  migrate,
  migrationRequire,
  evalMigrationModule,
  type MigrationPayloadItem,
} from './migrate';
import { getMigrationSql } from '../db.js';
import { applyMigrationModule } from '@legacy-sports/db-client/src/scripts/migration-runner.js';
import type { McpCaller } from '../audit.js';

jest.mock('../db.js');
// Replace the migration-runner with a factory so the real module never runs
// under ts-jest; we only need to observe applyMigrationModule's calls.
jest.mock('@legacy-sports/db-client/src/scripts/migration-runner.js', () => ({
  applyMigrationModule: jest.fn(),
}));
// Keep the drizzle imports (used only to populate the require-shim allowlist)
// hermetic so no real driver is loaded.
jest.mock('drizzle-orm', () => ({ sql: jest.fn() }));
jest.mock('drizzle-orm/pg-core', () => ({}));
jest.mock('drizzle-orm/postgres-js', () => ({ drizzle: jest.fn() }));

const mockGetMigrationSql = getMigrationSql as jest.MockedFunction<
  typeof getMigrationSql
>;
const mockApply = applyMigrationModule as jest.MockedFunction<
  typeof applyMigrationModule
>;

const CALLER: McpCaller = { clientId: 'client-abc', sub: 'sub-123' };

/**
 * Fake `postgres` client: callable as a tagged template (returns the applied
 * rows) and exposing `unsafe()` for the CREATE SCHEMA/TABLE statements.
 */
function makeSql(appliedHashes: string[]) {
  return Object.assign(
    jest.fn(async () => appliedHashes.map((hash) => ({ hash }))),
    { unsafe: jest.fn(async () => undefined) },
  ) as never;
}

/** A valid transpiled-migration jsSource that exports an `up()`. */
function upSource(): string {
  return `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.up = async () => {};`;
}

function item(name: string, jsSource = upSource()): MigrationPayloadItem {
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

describe('db_migrate', () => {
  const originalEnv = process.env['NODE_ENV'];

  beforeEach(() => {
    process.env['NODE_ENV'] = 'dev';
    mockGetMigrationSql.mockResolvedValue(makeSql([]));
    mockApply.mockResolvedValue(undefined);
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
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('rejects an invalid migration name', async () => {
    const result = await migrate(
      { migrations: [item('not-a-migration.ts')] },
      CALLER,
    );

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(String(payload.error)).toContain('Invalid migration name');
    expect(mockApply).not.toHaveBeenCalled();
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

  it('applies pending migrations in order and skips already-applied ones', async () => {
    mockGetMigrationSql.mockResolvedValue(makeSql(['20260616_120000_a.ts']));

    const result = await migrate(
      {
        migrations: [
          item('20260616_130000_c.ts'),
          item('20260616_120000_a.ts'),
          item('20260616_125000_b.ts'),
        ],
      },
      CALLER,
    );

    expect(result.isError).toBeUndefined();
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.applied).toBe(2);
    expect(payload.appliedNames).toEqual([
      '20260616_125000_b.ts',
      '20260616_130000_c.ts',
    ]);
    expect(payload.skipped).toEqual(['20260616_120000_a.ts']);

    // applyMigrationModule called once per applied migration, with (sql, hash, module).
    expect(mockApply).toHaveBeenCalledTimes(2);
    expect(mockApply.mock.calls[0][1]).toBe('20260616_125000_b.ts');
  });

  it('stops on the first failure and reports the failed migration', async () => {
    mockApply
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('syntax error at or near "CRATE"'));

    const result = await migrate(
      {
        migrations: [
          item('20260616_120000_a.ts'),
          item('20260616_130000_b.ts'),
          item('20260616_140000_c.ts'),
        ],
      },
      CALLER,
    );

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.applied).toBe(1);
    expect(payload.appliedNames).toEqual(['20260616_120000_a.ts']);
    expect(payload.failed).toBe('20260616_130000_b.ts');
    expect(String(payload.error)).toContain('CRATE');
    // The third migration is never attempted.
    expect(mockApply).toHaveBeenCalledTimes(2);
  });
});
