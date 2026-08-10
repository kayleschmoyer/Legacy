/**
 * Tests for scripts/db/transpile-migration.mjs (LS-9203).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/transpile-migration.test.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { transpileMigrationSource } from '../db/transpile-migration.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'db', 'transpile-migration.mjs');

test('transpileMigrationSource strips type-only imports and emits CJS module.exports', () => {
  const ts = [
    "import type { PgDatabase } from 'drizzle-orm/pg-core';",
    'export const up = async ({ db }) => {',
    "  await db.execute('SELECT 1');",
    '};',
  ].join('\n');

  const code = transpileMigrationSource(ts);

  assert.match(code, /module\.exports/);
  assert.doesNotMatch(code, /import type/);
  assert.doesNotMatch(code, /require\("drizzle-orm\/pg-core"\)/);
});

test('transpileMigrationSource turns a runtime import into a require()', () => {
  const ts = [
    "import { sql } from 'drizzle-orm';",
    'export const up = async () => {',
    '  sql`SELECT 1`;',
    '};',
  ].join('\n');

  const code = transpileMigrationSource(ts);

  assert.match(code, /require\("drizzle-orm"\)/);
});

test('CLI: rejects an invalid migration filename', () => {
  const result = spawnSync('node', [SCRIPT, 'not-a-migration.ts'], {
    encoding: 'utf-8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not a valid migration filename/);
});

test('CLI: with no arguments, emits every migration in the migrations dir', () => {
  const tmp = mktempMigrationsDir();
  try {
    writeFileSync(
      join(tmp, '20260101_000000_a.ts'),
      'export const up = async () => {};',
    );
    writeFileSync(
      join(tmp, '20260102_000000_b.ts'),
      'export const up = async () => {};',
    );
    writeFileSync(join(tmp, 'schema.ts'), 'export const schema = {};');

    const result = runScriptAgainst(tmp, []);

    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(
      payload.migrations.map((m) => m.name),
      ['20260101_000000_a.ts', '20260102_000000_b.ts'],
    );
    for (const m of payload.migrations) {
      assert.equal(m.hash, m.name);
      assert.match(m.jsSource, /module\.exports/);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI: with arguments, emits only the requested migrations', () => {
  const tmp = mktempMigrationsDir();
  try {
    writeFileSync(
      join(tmp, '20260101_000000_a.ts'),
      'export const up = async () => {};',
    );
    writeFileSync(
      join(tmp, '20260102_000000_b.ts'),
      'export const up = async () => {};',
    );

    const result = runScriptAgainst(tmp, ['20260102_000000_b.ts']);

    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(
      payload.migrations.map((m) => m.name),
      ['20260102_000000_b.ts'],
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

function mktempMigrationsDir() {
  return mkdtempSync(join(tmpdir(), 'transpile-migration-test-'));
}

/** Run the CLI against a scratch migrations dir via the MIGRATIONS_DIR override. */
function runScriptAgainst(migrationsDir, args) {
  return spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, MIGRATIONS_DIR: migrationsDir },
  });
}
