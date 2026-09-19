/**
 * Tests for scripts/check-mandated-make-targets.mjs (LS-10152 AC3).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/check-mandated-make-targets.test.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXPECTED_LOCAL_ONLY,
  extractMakefileTargets,
  extractAllowedTargets,
  findMandatedTargetMentions,
} from '../check-mandated-make-targets.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// --- extractMakefileTargets -------------------------------------------------

test('extractMakefileTargets picks up documented targets only', () => {
  const text = [
    'pc-lint: _PC_FLAGS := $(shell node scripts/classify-changes.js)',
    'pc-lint: ## pc step 5: lint affected projects',
    '\t@echo lint',
    '',
    '_internal-helper:',
    '\t@echo not documented, not a target we should ever mandate',
  ].join('\n');
  const targets = extractMakefileTargets(text);
  assert.equal(targets.has('pc-lint'), true);
  assert.equal(targets.has('_internal-helper'), false);
});

// --- extractAllowedTargets ---------------------------------------------------

test('extractAllowedTargets reads quoted entries between the Set([ and ]);', () => {
  const text = [
    'const ALLOWED_TARGETS = new Set([',
    "  'pc',",
    "  'audit-session',",
    ']);',
    '',
    "const OTHER = new Set(['not-a-real-target']);",
  ].join('\n');
  const allowed = extractAllowedTargets(text);
  assert.deepEqual([...allowed].sort(), ['audit-session', 'pc']);
});

test('extractAllowedTargets returns null when the marker is missing', () => {
  assert.equal(extractAllowedTargets('no such set here'), null);
});

// --- findMandatedTargetMentions ----------------------------------------------

test('finds a bare `make <target>` mention when the target is real', () => {
  const validTargets = new Set(['audit-session']);
  const text = 'Run `make audit-session ARGS="--auditMode"` as the fallback.';
  const mentions = findMandatedTargetMentions(text, validTargets);
  assert.deepEqual(mentions, [{ target: 'audit-session', line: 1 }]);
});

test('ignores `make <word>` when <word> is not a real Makefile target', () => {
  const validTargets = new Set(['audit-session']);
  const text = 'Make sure to make progress before you make changes.';
  const mentions = findMandatedTargetMentions(text, validTargets);
  assert.deepEqual(mentions, []);
});

test('finds a make_run({ target: "..." }) call example', () => {
  const validTargets = new Set(['pc']);
  const text = 'Use `make_run({ target: "pc" })` to validate.';
  const mentions = findMandatedTargetMentions(text, validTargets);
  assert.deepEqual(mentions, [{ target: 'pc', line: 1 }]);
});

test('reports 1-indexed line numbers across multiple lines', () => {
  const validTargets = new Set(['pc', 'lint']);
  const text = ['first line', '`make lint`', '`make pc`'].join('\n');
  const mentions = findMandatedTargetMentions(text, validTargets);
  assert.deepEqual(mentions, [
    { target: 'lint', line: 2 },
    { target: 'pc', line: 3 },
  ]);
});

// --- EXPECTED_LOCAL_ONLY integrity ------------------------------------------

test('every EXPECTED_LOCAL_ONLY key is a real, currently-documented Makefile target', () => {
  const makefileText = readFileSync(resolve(repoRoot, 'Makefile'), 'utf8');
  const validTargets = extractMakefileTargets(makefileText);
  const stale = Object.keys(EXPECTED_LOCAL_ONLY).filter(
    (t) => !validTargets.has(t),
  );
  assert.deepEqual(
    stale,
    [],
    `EXPECTED_LOCAL_ONLY names target(s) no longer in the Makefile: ${stale.join(', ')}`,
  );
});

test('no EXPECTED_LOCAL_ONLY entry is also in ALLOWED_TARGETS (would be dead)', () => {
  const runTargetText = readFileSync(
    resolve(repoRoot, 'tools/mcp/make-server/src/tools/run-target.ts'),
    'utf8',
  );
  const allowed = extractAllowedTargets(runTargetText);
  const overlap = Object.keys(EXPECTED_LOCAL_ONLY).filter((t) =>
    allowed.has(t),
  );
  assert.deepEqual(
    overlap,
    [],
    `target(s) are in both ALLOWED_TARGETS and EXPECTED_LOCAL_ONLY: ${overlap.join(', ')}`,
  );
});
