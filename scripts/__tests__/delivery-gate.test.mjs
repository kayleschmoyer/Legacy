/**
 * Tests for .claude/hooks/delivery-gate.mjs — which Bash commands count as
 * validation evidence (LS-11022).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/delivery-gate.test.mjs
 *
 * The gate reads the per-session evidence ledger written by
 * log-tool-evidence.mjs and blocks Stop (exit 2) when source files were edited
 * with no successful validation run. LS-11022: the Bash matcher required the
 * make target immediately after `make`, so the AGENTS.md-mandated
 * `make -C <worktree> pc-<chunk>` form never counted and fully validated
 * sessions were blocked.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(
  import.meta.dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'delivery-gate.mjs',
);

let seq = 0;

const SOURCE_EDIT = {
  tool: 'Edit',
  arg: 'C:/repo/apps/web/src/page.tsx',
  ok: true,
};

/** Run the gate against a ledger of one source edit plus the given records. */
function runGate(records, ledger = [SOURCE_EDIT, ...records]) {
  const sessionId = `dg-test-${process.pid}-${Date.now()}-${seq++}`;
  const dir = join(tmpdir(), 'claude-hooks', sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'evidence.jsonl'),
    ledger.map((r) => JSON.stringify(r)).join('\n') + '\n',
  );
  try {
    return spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ session_id: sessionId }),
      encoding: 'utf8',
    }).status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const bash = (arg, ok = true) => ({ tool: 'Bash', arg, ok });

const COUNTED = [
  'make pc-lint',
  'make test',
  'make -C /c/code/legacy-sports-ls-11018 pc-lint',
  'make -C /c/code/legacy-sports-ls-11018 pc-test',
  'make --directory=/c/code/legacy-sports-ls-11018 pc-build',
  'make -C"C:/code/my worktree" pc-typecheck',
  'make -C "$wt" -j4 pc-format',
  'make -k -C /c/wt CI=1 build',
  'make -C /c/wt sync-agent-prompts',
  'make -j pc-lint',
  'make -j 4 -C /c/wt pc-test',
  'git -C /c/wt fetch && make -C /c/wt pc-lint',
  'pnpm run test:scripts',
];

for (const cmd of COUNTED) {
  test(`counts as validation: ${cmd}`, () => {
    assert.equal(runGate([bash(cmd)]), 0);
  });
}

const NOT_COUNTED = [
  'make worktree TICKET=11022 DESC=test',
  'make -C /c/wt kill-stale',
  'make -C /c/wt worktree DESC=pc-lint',
  'git -C /c/wt log --oneline',
];

for (const cmd of NOT_COUNTED) {
  test(`does not count as validation: ${cmd}`, () => {
    assert.equal(runGate([bash(cmd)]), 2);
  });
}

test('a long non-matching flag list does not backtrack exponentially', () => {
  // A single `(flag|value|assignment)*` regex hangs on this; the tokeniser is linear.
  const cmd = `make ${'-j4 X=1 '.repeat(25)}worktree`;
  const start = Date.now();
  assert.equal(runGate([bash(cmd)]), 2);
  assert.ok(Date.now() - start < 5000, 'gate took too long');
});

test('a failed make -C <dir> pc-* run is not evidence', () => {
  assert.equal(runGate([bash('make -C /c/wt pc-lint', false)]), 2);
});

test('docs-only edits never block', () => {
  assert.equal(
    runGate([], [{ tool: 'Edit', arg: 'C:/repo/docs/x.md', ok: true }]),
    0,
  );
});
