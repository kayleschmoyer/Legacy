/**
 * LS-10941 / LS-11021 regression tests for scripts/modules-pool/link.mjs:
 *
 *   1. Without Developer Mode (mklink /D lacks privilege) link.mjs falls back
 *      to a junction (mklink /J) and succeeds (LS-11021); if the final link
 *      still cannot be created it exits 1 and leaves no node_modules husk
 *      behind, instead of exiting 0 and letting `nx` fail much later as
 *      "not recognized" (LS-10941).
 *   2. `--check` reports UNHEALTHY when the worktree's node_modules link is
 *      missing / not a symlink / pointing at another slot — not only when the
 *      pool slot itself is unhealthy.
 *
 * The broader modules-pool suite lives in scripts/modules-pool/pool.test.mjs;
 * these live here so CI's `test:scripts` gate runs them. The Windows-without-
 * Developer-Mode failure is simulated on any host via a preload fixture.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const LINK = join(here, '..', 'modules-pool', 'link.mjs');
// `--import` takes a URL: a bare `C:\…` path is rejected on Windows.
const FAKE_NO_DEVMODE = pathToFileURL(
  join(here, 'fixtures', 'modules-pool-link', 'fake-win32-no-devmode.mjs'),
).href;

const LOCK = 'lockfileVersion: 9\nimporters:\n  .: {}\n';
const PKG = JSON.stringify({ name: 'fixture', packageManager: 'pnpm@9.12.1' });

function makeHealthyNodeModules(nm) {
  mkdirSync(join(nm, 'nx'), { recursive: true });
  writeFileSync(join(nm, 'nx', 'package.json'), '{"name":"nx"}');
  mkdirSync(join(nm, '.bin'), { recursive: true });
  writeFileSync(join(nm, '.bin', 'nx'), '');
  writeFileSync(join(nm, '.modules.yaml'), 'hoistedDependencies: {}\n');
}

/** Main repo + worktree + a prebuilt healthy slot for the worktree's lockfile. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'mp-link-'));
  mkdirSync(join(root, '.git'));
  const wt = join(root, '.claude', 'worktrees', 'wt1');
  mkdirSync(wt, { recursive: true });
  writeFileSync(join(wt, 'pnpm-lock.yaml'), LOCK);
  writeFileSync(join(wt, 'package.json'), PKG);
  const base = [`--worktree=${wt}`, `--main-repo=${root}`];
  const hash = run(['--print-hash', ...base]).stdout.trim();
  const slotNm = join(root, '.modules-pool', hash, 'node_modules');
  makeHealthyNodeModules(slotNm);
  return { root, wt, base, slotNm, nm: join(wt, 'node_modules') };
}

function run(args, nodeFlags = [], env = {}) {
  const r = spawnSync('node', [...nodeFlags, LINK, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout, output: r.stdout + r.stderr };
}

test('no symlink privilege falls back to a junction and --check passes (LS-11021)', () => {
  const ctx = setup();
  try {
    // A pre-existing empty husk is replaced by the link.
    mkdirSync(ctx.nm);
    const r = run(ctx.base, ['--import', FAKE_NO_DEVMODE]);
    assert.equal(r.status, 0, r.output);
    assert.match(r.output, /created a junction instead/);
    assert.match(r.output, /\[ok\] node_modules/);
    const check = run([...ctx.base, '--check'], ['--import', FAKE_NO_DEVMODE]);
    assert.equal(check.status, 0, check.output);
    assert.match(check.output, /worktree node_modules link is healthy/);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('exits 1 when both the symlink and the junction fallback fail (LS-10941)', () => {
  const ctx = setup();
  try {
    // A pre-existing empty husk must not survive the failed run either.
    mkdirSync(ctx.nm);
    const r = run(ctx.base, ['--import', FAKE_NO_DEVMODE], {
      FAKE_MKLINK_JUNCTION_FAILS: '1',
    });
    assert.equal(r.status, 1, r.output);
    assert.match(r.output, /\[ERROR\] Failed to create directory symlink/);
    assert.match(r.output, /sufficient privilege/);
    assert.match(r.output, /Junction fallback \(mklink \/J\) also failed/);
    assert.doesNotMatch(r.output, /\[ok\] node_modules/);
    assert.ok(!existsSync(ctx.nm), 'no node_modules may be left behind');
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('--check exits 1 when the slot is healthy but node_modules was never linked', () => {
  const ctx = setup();
  try {
    const r = run([...ctx.base, '--check']);
    assert.equal(r.status, 1, r.output);
    assert.match(r.output, /slot is healthy/);
    assert.match(r.output, /worktree node_modules link is UNHEALTHY/);
    assert.match(r.output, /does not exist/);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('--check exits 1 when node_modules is a real directory, not a symlink', () => {
  const ctx = setup();
  try {
    makeHealthyNodeModules(ctx.nm);
    const r = run([...ctx.base, '--check']);
    assert.equal(r.status, 1, r.output);
    assert.match(r.output, /is a real directory, not a symlink/);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('--check exits 1 when node_modules links to a different slot', () => {
  const ctx = setup();
  try {
    const other = join(ctx.root, '.modules-pool', 'other', 'node_modules');
    makeHealthyNodeModules(other);
    // 'junction' needs no privilege on Windows; a plain dir symlink elsewhere.
    symlinkSync(other, ctx.nm, 'junction');
    const r = run([...ctx.base, '--check']);
    assert.equal(r.status, 1, r.output);
    assert.match(r.output, /resolves to .*, expected /);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test('link then --check exits 0 when the slot is healthy and linked', () => {
  const ctx = setup();
  try {
    const linked = run(ctx.base);
    assert.equal(linked.status, 0, linked.output);
    const r = run([...ctx.base, '--check']);
    assert.equal(r.status, 0, r.output);
    assert.match(r.output, /slot is healthy/);
    assert.match(r.output, /worktree node_modules link is healthy/);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});
