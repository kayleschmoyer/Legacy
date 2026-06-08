/**
 * Determinism guards for the live-backend integration suite (LS-7845).
 *
 * These pure file-scan tests enforce two of the e2e-determinism levers
 * (.agents/skills/testing/references/e2e-determinism.md) across every spec in
 * `tests/`, so the antipatterns removed in LS-7845 cannot silently creep back:
 *
 *   - Lever #3 "No `waitForTimeout` — wait for conditions": fixed-duration UI
 *     waits are the #1 source of flake.
 *   - Levers #2/#9 "poll the source of truth, not the UI": a
 *     `waitForLoadState('networkidle')` gate never settles on a live app with
 *     Apollo polling/websockets, so it just burns its full timeout before any
 *     `.catch()` — dead wall-clock that compounded shard-2's load pressure
 *     without adding determinism the following auto-retrying assertion lacks.
 *
 * Scope is `tests/` only. The shared helpers under `helpers/` are exempt:
 * `wait-for-season-active.ts` deliberately keeps a documented legacy
 * UI-polling fallback for unmigrated callers, and the cooldown timer in
 * `reload-until-visible.ts` is an inter-attempt pacer, not a UI wait.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TESTS_DIR = path.resolve(__dirname, 'tests');

function specFiles(): string[] {
  return fs
    .readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(TESTS_DIR, f));
}

/**
 * Find lines matching `pattern` (an actual call, not a prose mention). Pure
 * comment lines (`//…`, `*…`) are skipped so a doc comment that names the
 * antipattern — explaining why it was removed — does not trip the guard.
 * Returns `"<file>:<lineNo>: <trimmed line>"` for each hit.
 */
function findCalls(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of specFiles()) {
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      if (pattern.test(line)) {
        hits.push(`${path.basename(file)}:${i + 1}: ${trimmed}`);
      }
    });
  }
  return hits;
}

void test('no page.waitForTimeout() calls in integration specs (lever #3)', () => {
  // Match the call form `.waitForTimeout(` — prose like "page.waitForTimeout"
  // in a comment has no paren and is intentionally not matched.
  const hits = findCalls(/\.waitForTimeout\(/);
  assert.deepEqual(
    hits,
    [],
    `Replace fixed waits with condition-based waits (expect.poll / toBeVisible):\n${hits.join('\n')}`,
  );
});

void test("no waitForLoadState('networkidle') gates in integration specs (levers #2/#9)", () => {
  // Match the actual call with a 'networkidle' / "networkidle" argument.
  const hits = findCalls(/waitForLoadState\(\s*['"]networkidle['"]/);
  assert.deepEqual(
    hits,
    [],
    `networkidle never settles on a live polling app — gate on a backend poll or an auto-retrying assertion instead:\n${hits.join('\n')}`,
  );
});
