/**
 * Tests for the poll-diff logic embedded in scripts/watch-pr.sh (LS-10374).
 *
 * "No Merge Conflicts" and "Verify All Migrations Applied" are commit statuses
 * (StatusContext) — LS-9604 / LS-9776, .github/ruleset.json — but the watch used
 * to look them up in the CheckRun map, so the red-conflict corroboration, the
 * gate-terminal summary, and the stall "missing" list were all blind to them.
 *
 * The Python program lives in a bash heredoc, so each test extracts it and runs
 * it directly against a state file + a gh-shaped payload, exactly as the bash
 * loop does. The negative control runs the SAME scenarios against a frozen copy
 * of the pre-fix script (fixtures/watch-pr/legacy-watch-pr.sh) and asserts they
 * fail there, so the suite cannot pass vacuously.
 *
 * Run via: node --test scripts/__tests__/watch-pr.test.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const CURRENT = join(ROOT, 'scripts', 'watch-pr.sh');
const LEGACY = join(
  import.meta.dirname,
  'fixtures',
  'watch-pr',
  'legacy-watch-pr.sh',
);

const PYTHON =
  spawnSync('python3', ['--version']).status === 0 ? 'python3' : 'python';

function extractProgram(scriptPath) {
  const src = readFileSync(scriptPath, 'utf8');
  const match = src.match(/<<'PYEOF'\n([\s\S]*?)\nPYEOF\n/);
  assert.ok(match, `no PYEOF heredoc found in ${scriptPath}`);
  return match[1];
}

/** A watch session: one program, one state file, successive polls. */
function session(scriptPath) {
  const dir = mkdtempSync(join(tmpdir(), 'watch-pr-test-'));
  const program = join(dir, 'poll.py');
  writeFileSync(program, extractProgram(scriptPath));
  const stateFile = join(dir, 'state.json');
  const curFile = join(dir, 'cur.json');
  let now = 1_000_000;
  return {
    /** Run one poll; returns { rc, lines }. */
    poll(payload, { advance = 90, rebaseline = false } = {}) {
      now += advance;
      writeFileSync(curFile, JSON.stringify(payload));
      const r = spawnSync(
        PYTHON,
        [
          program,
          stateFile,
          curFile,
          '1',
          String(now),
          rebaseline ? '1' : '0',
          '900',
        ],
        { encoding: 'utf8' },
      );
      return {
        rc: r.status,
        lines: r.stdout.split('\n').filter(Boolean),
        stderr: r.stderr,
      };
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const SHA = 'abcdef0123456789';
const ctx = (context, state) => ({
  __typename: 'StatusContext',
  context,
  state,
});
const GATE_GREEN = [
  ctx('bot-review', 'SUCCESS'),
  ctx('CI Gate', 'SUCCESS'),
  ctx('No Merge Conflicts', 'SUCCESS'),
  ctx('Verify All Migrations Applied', 'SUCCESS'),
];
const withStatus = (rollup, context, state) =>
  rollup.map((n) => (n.context === context ? ctx(context, state) : n));

const pr = (over = {}) => ({
  number: 1,
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  labels: [],
  latestReviews: [],
  headRefOid: SHA,
  statusCheckRollup: [],
  ...over,
});

function withSession(scriptPath, fn) {
  const s = session(scriptPath);
  try {
    return fn(s);
  } finally {
    s.cleanup();
  }
}

// Each scenario returns the events it observed so the control can re-run it.
const scenarios = {
  redNoMergeConflictsStatusCorroboratesConflict(s) {
    // GraphQL mergeable UNKNOWN (post-main-push) — only the status says conflict.
    const payload = pr({
      mergeable: 'UNKNOWN',
      statusCheckRollup: withStatus(
        GATE_GREEN,
        'No Merge Conflicts',
        'FAILURE',
      ),
    });
    s.poll(payload); // baseline / count 1
    const second = s.poll(payload); // count 2 -> emit
    assert.equal(
      second.lines.length,
      1,
      `expected one conflict event, got ${JSON.stringify(second.lines)}`,
    );
    assert.match(second.lines[0], /^conflict: PR #1 has merge conflicts/);
    assert.match(second.lines[0], /No Merge Conflicts=red/);
  },

  errorStateCountsAsRed(s) {
    const payload = pr({
      mergeable: 'UNKNOWN',
      statusCheckRollup: withStatus(GATE_GREEN, 'No Merge Conflicts', 'ERROR'),
    });
    s.poll(payload);
    const second = s.poll(payload);
    assert.match(
      second.lines.join('\n'),
      /conflict: PR #1 has merge conflicts/,
    );
  },

  gateCompleteWhenAllFourStatusesTerminal(s) {
    const payload = pr({ statusCheckRollup: GATE_GREEN });
    const first = s.poll(payload);
    assert.equal(first.lines.length, 1, JSON.stringify(first.lines));
    assert.match(first.lines[0], /^gate complete on abcdef0:/);
    assert.match(first.lines[0], /No Merge Conflicts=SUCCESS/);
    assert.match(first.lines[0], /Verify All Migrations Applied=SUCCESS/);
    assert.deepEqual(
      s.poll(payload).lines,
      [],
      'gate-terminal is once per SHA',
    );
  },

  noFalseStallWhenStatusesAreTerminal(s) {
    // Everything terminal and unchanged for far longer than the 900s stall window
    // (but a gate-complete line is expected once). No stall line may ever appear.
    const payload = pr({ statusCheckRollup: GATE_GREEN });
    const all = [
      s.poll(payload),
      s.poll(payload, { advance: 1000 }),
      s.poll(payload, { advance: 1000 }),
    ];
    const joined = all.flatMap((r) => r.lines).join('\n');
    assert.doesNotMatch(joined, /stall:/);
  },

  stallNamesTheStatusThatIsActuallyMissing(s) {
    const partial = GATE_GREEN.filter(
      (n) => n.context !== 'Verify All Migrations Applied',
    );
    const payload = pr({ statusCheckRollup: partial });
    s.poll(payload);
    const stalled = s.poll(payload, { advance: 1000 });
    const line = stalled.lines.find((l) => l.startsWith('stall:'));
    assert.ok(
      line,
      `expected a stall line, got ${JSON.stringify(stalled.lines)}`,
    );
    assert.match(line, /incomplete: Verify All Migrations Applied\)/);
  },

  redVerifyMigrationsStatusIsAnnounced(s) {
    const payload = pr({
      statusCheckRollup: withStatus(
        GATE_GREEN,
        'Verify All Migrations Applied',
        'FAILURE',
      ),
    });
    s.poll(payload);
    const second = s.poll(payload);
    assert.match(
      second.lines.join('\n'),
      /status red: 'Verify All Migrations Applied' = FAILURE/,
    );
  },

  conflictRearmsOnSameShaAfterClearing(s) {
    const red = pr({
      mergeable: 'CONFLICTING',
      statusCheckRollup: withStatus(
        GATE_GREEN,
        'No Merge Conflicts',
        'FAILURE',
      ),
    });
    const clear = pr({ statusCheckRollup: GATE_GREEN });
    s.poll(red);
    const announced = s.poll(red);
    assert.match(announced.lines.join('\n'), /conflict: PR #1/);
    assert.ok(
      !s.poll(red).lines.some((l) => l.startsWith('conflict:')),
      'no repeat while still conflicting',
    );
    s.poll(clear); // conflict resolved on the same head SHA
    s.poll(red);
    const again = s.poll(red);
    assert.ok(
      again.lines.some((l) => l.startsWith('conflict: PR #1')),
      `conflict must be re-announced after clearing on the same SHA, got ${JSON.stringify(again.lines)}`,
    );
  },
};

for (const [name, scenario] of Object.entries(scenarios)) {
  test(`watch-pr: ${name}`, () => {
    withSession(CURRENT, scenario);
  });
}

test('watch-pr: still-conflicting poll after one clear poll does not re-announce early (debounce kept)', () => {
  withSession(CURRENT, (s) => {
    const red = pr({ mergeable: 'CONFLICTING' });
    s.poll(red);
    s.poll(red); // announced
    s.poll(pr());
    const single = s.poll(red); // count 1 only
    assert.deepEqual(single.lines, []);
  });
});

// Negative control: the same scenarios must FAIL against the pre-fix script.
// Scenarios whose assertions hold vacuously on old code (a clean "nothing
// emitted" outcome, or behaviour that did not change) are excluded.
const CONTROLLED = [
  'redNoMergeConflictsStatusCorroboratesConflict',
  'errorStateCountsAsRed',
  'gateCompleteWhenAllFourStatusesTerminal',
  'noFalseStallWhenStatusesAreTerminal',
  'stallNamesTheStatusThatIsActuallyMissing',
  'redVerifyMigrationsStatusIsAnnounced',
  'conflictRearmsOnSameShaAfterClearing',
];

for (const name of CONTROLLED) {
  test(`watch-pr negative control: legacy script fails "${name}"`, () => {
    assert.throws(
      () => withSession(LEGACY, scenarios[name]),
      assert.AssertionError,
      `scenario "${name}" unexpectedly passed on the pre-fix script — it does not prove the fix`,
    );
  });
}
