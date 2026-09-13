/**
 * Tests for scripts/db/verify-migration.mjs (LS-10088).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/verify-migration.test.mjs
 *
 * Every case that boots Postgres runs the script against a temporary
 * MIGRATIONS_DIR fixture rather than the real 293-migration chain, so the
 * suite stays fast. The real chain is exercised by running the script against
 * a landed migration, which is a manual/PR-time check, not a unit test.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import {
  MIGRATION_FILE_RE,
  PGLITE_UNSUPPORTED,
  planChain,
  resolveCandidate,
} from '../db/verify-migration.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = resolve(__dirname, '..', 'db', 'verify-migration.mjs');

/** A migration that creates a table, guarded so it re-runs clean. */
const GOOD_MIGRATION = [
  'export const up = async ({ db }) => {',
  '  await db.execute(`CREATE TABLE IF NOT EXISTS widgets (id serial primary key, name text);`);',
  '};',
  'export const down = async ({ db }) => {',
  '  await db.execute(`DROP TABLE IF EXISTS widgets;`);',
  '};',
].join('\n');

/** Builds a temp migrations dir; returns its path and a cleanup function. */
function fixtureDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'verify-migration-'));
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(dir, name), source);
  }
  return dir;
}

function runScript(args, dir) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, MIGRATIONS_DIR: dir },
  });
}

// --- pure helpers (no Postgres) ---------------------------------------------

test('planChain applies every migration sorting before the candidate, in timestamp order', () => {
  const dir = fixtureDir({
    '20260101_000000_a.ts': GOOD_MIGRATION,
    '20260102_000000_b.ts': GOOD_MIGRATION,
    '20260103_000000_c.ts': GOOD_MIGRATION,
    'not-a-migration.ts': 'export const up = async () => {};',
    'README.md': 'ignored',
  });
  try {
    assert.deepEqual(planChain('20260103_000000_c.ts', dir), [
      '20260101_000000_a.ts',
      '20260102_000000_b.ts',
    ]);
    // The first migration has an empty chain, and the candidate is never in it.
    assert.deepEqual(planChain('20260101_000000_a.ts', dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MIGRATION_FILE_RE matches the production runner filename shape', () => {
  assert.ok(
    MIGRATION_FILE_RE.test('20260910_000000_add_cancellation_reason.ts'),
  );
  assert.ok(!MIGRATION_FILE_RE.test('0051_add_thing.ts'));
  assert.ok(!MIGRATION_FILE_RE.test('schema.ts'));
  assert.ok(!MIGRATION_FILE_RE.test('20260910_000000_add_thing.js'));
});

test('resolveCandidate accepts a full path and rejects unknown or malformed names', () => {
  const dir = fixtureDir({ '20260101_000000_a.ts': GOOD_MIGRATION });
  try {
    assert.equal(
      resolveCandidate('lib/db-client/migrations/20260101_000000_a.ts', dir),
      '20260101_000000_a.ts',
    );
    assert.throws(
      () => resolveCandidate('nope.ts', dir),
      /not a valid migration filename/,
    );
    assert.throws(
      () => resolveCandidate('20260102_000000_missing.ts', dir),
      /was not found/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- end-to-end against ephemeral Postgres ----------------------------------

test('exits 0 for a migration that applies, re-runs and rolls back cleanly', () => {
  const dir = fixtureDir({
    '20260101_000000_base.ts': GOOD_MIGRATION,
    '20260102_000000_candidate.ts': [
      'export const up = async ({ db }) => {',
      '  await db.execute(`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS color text;`);',
      '};',
      'export const down = async ({ db }) => {',
      '  await db.execute(`ALTER TABLE widgets DROP COLUMN IF EXISTS color;`);',
      '};',
    ].join('\n'),
  });
  try {
    const res = runScript(['20260102_000000_candidate.ts'], dir);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    // The chain — not a hand-written replica — is what the candidate applies onto.
    assert.match(res.stdout, /chain: 1 migration\(s\) before/);
    assert.match(res.stdout, /✓ applies clean/);
    assert.match(res.stdout, /✓ re-runs clean \(idempotent\)/);
    assert.match(res.stdout, /✓ down\(\) then up\(\) round-trips/);
    assert.match(res.stdout, /PASSED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exits non-zero with a readable diagnostic when up() throws', () => {
  const dir = fixtureDir({
    '20260101_000000_candidate.ts': [
      'export const up = async ({ db }) => {',
      '  await db.execute(`ALTER TABLE table_that_does_not_exist ADD COLUMN x int;`);',
      '};',
    ].join('\n'),
  });
  try {
    const res = runScript(['20260101_000000_candidate.ts'], dir);
    assert.notEqual(res.status, 0);
    assert.match(res.stdout, /✗ applies clean — FAILED/);
    assert.match(res.stdout, /table_that_does_not_exist/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fails a non-idempotent migration on the second up()', () => {
  const dir = fixtureDir({
    '20260101_000000_base.ts': GOOD_MIGRATION,
    // Bare ADD COLUMN with no IF NOT EXISTS: applies once, fails when re-run.
    '20260102_000000_candidate.ts': [
      'export const up = async ({ db }) => {',
      '  await db.execute(`ALTER TABLE widgets ADD COLUMN size int;`);',
      '};',
    ].join('\n'),
  });
  try {
    const res = runScript(['20260102_000000_candidate.ts'], dir);
    assert.notEqual(res.status, 0);
    assert.match(res.stdout, /✓ applies clean/);
    assert.match(res.stdout, /✗ re-runs clean \(idempotent\) — FAILED/);
    assert.match(res.stdout, /IF \[NOT\] EXISTS/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('skips the rollback check, and still passes, when the migration exports no down()', () => {
  const dir = fixtureDir({
    '20260101_000000_candidate.ts': [
      'export const up = async ({ db }) => {',
      '  await db.execute(`CREATE TABLE IF NOT EXISTS gadgets (id serial primary key);`);',
      '};',
    ].join('\n'),
  });
  try {
    const res = runScript(['20260101_000000_candidate.ts'], dir);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /- no down\(\) — rollback check skipped/);
    assert.match(res.stdout, /PASSED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reports a failing down() rather than passing the migration', () => {
  const dir = fixtureDir({
    '20260101_000000_candidate.ts': [
      'export const up = async ({ db }) => {',
      '  await db.execute(`CREATE TABLE IF NOT EXISTS gizmos (id serial primary key);`);',
      '};',
      'export const down = async ({ db }) => {',
      '  await db.execute(`DROP TABLE gizmos_typo;`);',
      '};',
    ].join('\n'),
  });
  try {
    const res = runScript(['20260101_000000_candidate.ts'], dir);
    assert.notEqual(res.status, 0);
    assert.match(res.stdout, /✗ down\(\) then up\(\) round-trips — FAILED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('skips PGlite-unsupported chain migrations and names each one', () => {
  const [skipListed] = Object.keys(PGLITE_UNSUPPORTED);
  const dir = fixtureDir({
    // Body is irrelevant: the skip-list is keyed on filename, so this proves
    // the chain steps over the entry instead of executing (and failing) it.
    [skipListed]: [
      'export const up = async ({ db }) => {',
      '  await db.execute(`THIS IS NOT VALID SQL;`);',
      '};',
    ].join('\n'),
    '20261231_000000_candidate.ts': [
      'export const up = async ({ db }) => {',
      '  await db.execute(`CREATE TABLE IF NOT EXISTS doodads (id serial primary key);`);',
      '};',
    ].join('\n'),
  });
  try {
    const res = runScript(['20261231_000000_candidate.ts'], dir);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /1 skipped/);
    assert.match(res.stdout, new RegExp(`skipped ${skipListed}`));
    assert.match(res.stdout, /PASSED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reports the offending file when a pre-existing chain migration fails', () => {
  const dir = fixtureDir({
    '20260101_000000_broken.ts': [
      'export const up = async ({ db }) => {',
      '  await db.execute(`DROP TABLE nothing_here;`);',
      '};',
    ].join('\n'),
    '20260102_000000_candidate.ts': GOOD_MIGRATION,
  });
  try {
    const res = runScript(['20260102_000000_candidate.ts'], dir);
    assert.notEqual(res.status, 0);
    assert.match(res.stdout, /✗ chain failed at 20260101_000000_broken\.ts/);
    assert.match(res.stdout, /not the candidate/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- CLI / make wiring ------------------------------------------------------

test('prints usage and exits non-zero when no migration is given', () => {
  const dir = fixtureDir({ '20260101_000000_a.ts': GOOD_MIGRATION });
  try {
    for (const args of [[], ['']]) {
      const res = runScript(args, dir);
      assert.notEqual(res.status, 0);
      assert.match(
        res.stderr,
        /Usage: node scripts\/db\/verify-migration\.mjs/,
      );
      assert.match(res.stderr, /make verify-migration MIGRATION=/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the make verify-migration target invokes the script and guards an empty MIGRATION', () => {
  // Asserted statically rather than by shelling out to make, so the suite runs
  // the same way on a local Windows box as it does on a cloud agent.
  const makefile = readFileSync(join(REPO_ROOT, 'Makefile'), 'utf-8');
  const target = makefile.split(/^verify-migration:/m)[1];
  assert.ok(target, 'Makefile has no verify-migration target');
  const body = target.split(/\n(?=[a-zA-Z])/)[0];
  // Quoted $(MIGRATION) means an unset variable reaches the script as an empty
  // argument, which the script answers with usage + a non-zero exit (asserted
  // above) — no shell conditional in the recipe, which would not survive on
  // Windows.
  assert.match(
    body,
    /node scripts\/db\/verify-migration\.mjs "\$\(MIGRATION\)"/,
  );
  // The target must not cd into lib/db-client the way the other db targets do.
  assert.ok(
    !/\bcd\b/.test(body),
    'verify-migration must run node from the repo root',
  );
});
