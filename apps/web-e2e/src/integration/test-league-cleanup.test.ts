import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ACTIVE_RUN_LOCK_STALE_MS,
  clearActiveRunLock,
  extractLeagueAgeMs,
  isActiveRunLockFresh,
  isTestLeague,
  isYoungerThanCleanupThreshold,
  MIN_LEAGUE_AGE_FOR_CLEANUP_MS,
  writeActiveRunLock,
} from './test-league-cleanup';

const FIXED_NOW = 1715731200000;
const HOUR_MS = 60 * 60 * 1000;

void test('MIN_LEAGUE_AGE_FOR_CLEANUP_MS is 4 hours', () => {
  assert.equal(MIN_LEAGUE_AGE_FOR_CLEANUP_MS, 4 * HOUR_MS);
});

void test('isTestLeague matches every spec-produced name pattern', () => {
  assert.equal(isTestLeague('Test League 2026-05-14T20:00:00.000Z'), true);
  assert.equal(isTestLeague('Integration Season Test League'), true);
  assert.equal(
    isTestLeague('Integration Season Test League 1715731200000'),
    true,
  );
  // LS-4539: this name was missed by the original patterns; 110 orphans
  // accumulated before it was added. Guard against regression.
  assert.equal(isTestLeague('Season Lifecycle Integration Test'), true);
  assert.equal(
    isTestLeague('Season Lifecycle Integration Test 1715731200000'),
    true,
  );
  assert.equal(isTestLeague('Mock Draft Practice'), true);
  assert.equal(isTestLeague('Live Draft E2E 1715731200000'), true);
  assert.equal(isTestLeague('Trade Flow E2E 1715731200000'), true);
});

void test('isTestLeague rejects user-created leagues', () => {
  assert.equal(isTestLeague('My Real League'), false);
  assert.equal(isTestLeague('The 2024 Champs'), false);
  assert.equal(isTestLeague('Random League'), false);
  // Substring-only matches that should NOT trigger: the `test` lowercase
  // appears in many real league names (e.g. someone's team called "Testers")
  // — patterns intentionally use `startsWith` or word-boundary regexes.
  assert.equal(isTestLeague('Greatest League Ever'), false);
});

void test('extractLeagueAgeMs parses trailing 13-digit unix ms', () => {
  const name = `Live Draft E2E ${FIXED_NOW - 30 * 60 * 1000}`; // 30 min ago
  const age = extractLeagueAgeMs(name, FIXED_NOW);
  assert.equal(age, 30 * 60 * 1000);
});

void test('extractLeagueAgeMs parses trailing ISO 8601 timestamp', () => {
  const iso = new Date(FIXED_NOW - 2 * HOUR_MS).toISOString();
  const name = `Test League ${iso}`;
  const age = extractLeagueAgeMs(name, FIXED_NOW);
  assert.equal(age, 2 * HOUR_MS);
});

void test('extractLeagueAgeMs returns undefined for names without a timestamp', () => {
  assert.equal(
    extractLeagueAgeMs('Integration Season Test League', FIXED_NOW),
    undefined,
  );
  assert.equal(extractLeagueAgeMs('Live Draft E2E abc', FIXED_NOW), undefined);
  assert.equal(extractLeagueAgeMs('My Real League', FIXED_NOW), undefined);
});

void test('extractLeagueAgeMs ignores non-trailing digit sequences', () => {
  // Digits in the middle of the name shouldn't be picked up.
  assert.equal(
    extractLeagueAgeMs('E2E 1715731200000 leftover', FIXED_NOW),
    undefined,
  );
});

void test('isYoungerThanCleanupThreshold is true for leagues just under 4h', () => {
  const name = `Live Draft E2E ${FIXED_NOW - (4 * HOUR_MS - 60 * 1000)}`;
  assert.equal(isYoungerThanCleanupThreshold(name, FIXED_NOW), true);
});

void test('isYoungerThanCleanupThreshold is false for leagues exactly at 4h', () => {
  const name = `Live Draft E2E ${FIXED_NOW - 4 * HOUR_MS}`;
  assert.equal(isYoungerThanCleanupThreshold(name, FIXED_NOW), false);
});

void test('isYoungerThanCleanupThreshold is false for leagues just over 4h', () => {
  const name = `Live Draft E2E ${FIXED_NOW - (4 * HOUR_MS + 60 * 1000)}`;
  assert.equal(isYoungerThanCleanupThreshold(name, FIXED_NOW), false);
});

void test('isYoungerThanCleanupThreshold respects ISO-timestamp names too', () => {
  const youngIso = new Date(FIXED_NOW - 1 * HOUR_MS).toISOString();
  const oldIso = new Date(FIXED_NOW - 5 * HOUR_MS).toISOString();
  assert.equal(
    isYoungerThanCleanupThreshold(`Test League ${youngIso}`, FIXED_NOW),
    true,
  );
  assert.equal(
    isYoungerThanCleanupThreshold(`Test League ${oldIso}`, FIXED_NOW),
    false,
  );
});

void test('isYoungerThanCleanupThreshold is false when no timestamp is parseable', () => {
  // Hardcoded names like the full-season league fall through to the existing
  // brute-force cleanup — they are not "protected" by the age gate.
  assert.equal(
    isYoungerThanCleanupThreshold('Integration Season Test League', FIXED_NOW),
    false,
  );
});

// ---------------------------------------------------------------------------
// Active-run lockfile (LS-4539)
// ---------------------------------------------------------------------------

void test('ACTIVE_RUN_LOCK_STALE_MS is 15 minutes', () => {
  assert.equal(ACTIVE_RUN_LOCK_STALE_MS, 15 * 60 * 1000);
});

void test('isActiveRunLockFresh returns false when no lock exists', () => {
  const tmp = path.join(
    os.tmpdir(),
    `ls-4539-lock-${process.pid}-${Date.now()}`,
  );
  assert.equal(isActiveRunLockFresh(Date.now(), tmp), false);
});

void test('write + isFresh + clear roundtrip', () => {
  const tmp = path.join(
    os.tmpdir(),
    `ls-4539-lock-${process.pid}-${Date.now()}-rt`,
  );
  try {
    writeActiveRunLock(tmp);
    assert.equal(fs.existsSync(tmp), true);
    assert.equal(isActiveRunLockFresh(Date.now(), tmp), true);
    clearActiveRunLock(tmp);
    assert.equal(fs.existsSync(tmp), false);
    assert.equal(isActiveRunLockFresh(Date.now(), tmp), false);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
});

void test('isActiveRunLockFresh returns false for stale locks', () => {
  const tmp = path.join(
    os.tmpdir(),
    `ls-4539-lock-${process.pid}-${Date.now()}-stale`,
  );
  try {
    writeActiveRunLock(tmp);
    // Simulate a 20-minute-old lock by checking against a `now` 20 min in the future.
    const future = Date.now() + 20 * 60 * 1000;
    assert.equal(isActiveRunLockFresh(future, tmp), false);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
});

void test('clearActiveRunLock is idempotent — no-op when file already gone', () => {
  const tmp = path.join(
    os.tmpdir(),
    `ls-4539-lock-${process.pid}-${Date.now()}-idemp`,
  );
  // Should not throw even though the file does not exist.
  clearActiveRunLock(tmp);
  clearActiveRunLock(tmp);
});
