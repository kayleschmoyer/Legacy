/**
 * Tests for the poll-diff logic of scripts/watch-pr.sh.
 *
 * LS-10374: "No Merge Conflicts" and "Verify All Migrations Applied" are commit
 * statuses (StatusContext) — LS-9604 / LS-9776, .github/ruleset.json — but the
 * watch used to look them up in the CheckRun map, so the red-conflict
 * corroboration, the gate-terminal summary, and the stall "missing" list were
 * all blind to them.
 *
 * LS-10598: the poll logic moved from a Python heredoc to the dependency-free
 * scripts/watch-pr-poll.mjs (Windows hosts whose `python` is only the Microsoft
 * Store alias killed the watch). The scenarios run against the Node port; a
 * differential test replays every scenario against a frozen copy of the last
 * Python version (fixtures/watch-pr/python-watch-pr.sh) and requires identical
 * stdout, exit codes and state-file bytes. The negative control runs the
 * LS-10374 scenarios against the pre-LS-10374 script
 * (fixtures/watch-pr/legacy-watch-pr.sh) and asserts they fail there, so the
 * suite cannot pass vacuously. Python-backed tests skip when no real Python is
 * available.
 *
 * Run via: node --test scripts/__tests__/watch-pr.test.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const WATCH = join(ROOT, 'scripts', 'watch-pr.sh');
const POLL = join(ROOT, 'scripts', 'watch-pr-poll.mjs');
const FIXTURES = join(import.meta.dirname, 'fixtures', 'watch-pr');
const LEGACY = join(FIXTURES, 'legacy-watch-pr.sh');
const PYTHON_REF = join(FIXTURES, 'python-watch-pr.sh');

const PYTHON = ['python3', 'python'].find(
  (p) =>
    spawnSync(p, ['-c', 'import json, sys'], { stdio: 'ignore' }).status === 0,
);
const NO_PYTHON = PYTHON ? false : 'no usable python on PATH';

function extractProgram(scriptPath) {
  const src = readFileSync(scriptPath, 'utf8');
  const match = src.match(/<<'PYEOF'\n([\s\S]*?)\nPYEOF\n/);
  assert.ok(match, `no PYEOF heredoc found in ${scriptPath}`);
  return match[1];
}

/** Command prefix that runs one poll: node port, or a fixture's Python. */
function runnerFor(target, dir) {
  if (target === 'node') return [process.execPath, POLL];
  const program = join(dir, 'poll.py');
  writeFileSync(program, extractProgram(target));
  return [PYTHON, program];
}

/** A watch session: one program, one state file, successive polls. */
function session(target) {
  const dir = mkdtempSync(join(tmpdir(), 'watch-pr-test-'));
  const [cmd, ...pre] = runnerFor(target, dir);
  const stateFile = join(dir, 'state.json');
  const curFile = join(dir, 'cur.json');
  let now = 1_000_000;
  return {
    stateFile,
    /** Run one poll; returns { rc, lines, state }. */
    poll(payload, { advance = 90, rebaseline = false, raw } = {}) {
      now += advance;
      writeFileSync(curFile, raw ?? JSON.stringify(payload));
      const r = spawnSync(
        cmd,
        [
          ...pre,
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
        stdout: r.stdout,
        stderr: r.stderr,
        state: existsSync(stateFile) ? readFileSync(stateFile, 'utf8') : null,
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

function withSession(target, fn) {
  const s = session(target);
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
    withSession('node', scenario);
  });
}

test('watch-pr: still-conflicting poll after one clear poll does not re-announce early (debounce kept)', () => {
  withSession('node', (s) => {
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
  test(
    `watch-pr negative control: legacy script fails "${name}"`,
    { skip: NO_PYTHON },
    () => {
      assert.throws(
        () => withSession(LEGACY, scenarios[name]),
        assert.AssertionError,
        `scenario "${name}" unexpectedly passed on the pre-fix script — it does not prove the fix`,
      );
    },
  );
}

// ---------------------------------------------------------------------------
// LS-10598: Node port vs the last Python version — identical transcripts.
// ---------------------------------------------------------------------------

const ROCKET = '\u{1F680} CI Pipeline / lint';
const run = (name, conclusion, startedAt, status = 'COMPLETED') => ({
  __typename: 'CheckRun',
  name,
  status,
  conclusion,
  startedAt,
});
const label = (name) => ({ name });
const review = (login, state, submittedAt) => ({
  author: { login },
  state,
  submittedAt,
});

// Exercise every branch of the poll body; assertions come from the
// differential comparison, not the scenario itself.
const parityOnly = {
  terminalMerged(s) {
    s.poll(pr());
    s.poll(pr({ state: 'MERGED' }));
  },
  terminalClosed(s) {
    s.poll(pr({ state: 'CLOSED' }));
  },
  earlySignalRedCheckWithNonAsciiName(s) {
    const red = pr({
      statusCheckRollup: [
        run(ROCKET, 'SUCCESS', '2026-10-05T10:00:00Z'),
        run(ROCKET, 'FAILURE', '2026-10-05T11:00:00Z'), // newest wins
        run('Ünïcödé — check', 'FAILURE', '2026-10-05T11:00:00Z'),
        ctx('bot-review', 'PENDING'),
      ],
    });
    s.poll(red);
    s.poll(red);
    s.poll(pr({ statusCheckRollup: [run(ROCKET, 'TIMED_OUT', null)] }));
    s.poll(pr({ statusCheckRollup: [run(ROCKET, null, null, 'IN_PROGRESS')] }));
  },
  redStatusesDebounceAndReset(s) {
    const red = pr({
      statusCheckRollup: withStatus(GATE_GREEN, 'bot-review', 'FAILURE'),
    });
    s.poll(red);
    s.poll(
      pr({ statusCheckRollup: withStatus(GATE_GREEN, 'CI Gate', 'ERROR') }),
    );
    s.poll(red);
    s.poll(red);
  },
  labelTransitions(s) {
    s.poll(pr({ labels: [label('merge-when-ready'), label('CI: Conflicts')] }));
    s.poll(
      pr({
        labels: [
          label('review-bot-billing'),
          label('ci-stuck'),
          label('CI: Lint'),
          label('CI: Conflicts'),
          label('unrelated'),
        ],
      }),
    );
    s.poll(pr({ labels: [label('needs-human-review')] }), { rebaseline: true });
    s.poll(
      pr({
        labels: [label('needs-human-review'), label('review-bot-degraded')],
      }),
    );
  },
  newReviews(s) {
    s.poll(
      pr({
        latestReviews: [review('alice', 'COMMENTED', '2026-10-05T10:00:00Z')],
      }),
    );
    s.poll(
      pr({
        latestReviews: [
          review('alice', 'COMMENTED', '2026-10-05T10:00:00Z'),
          review('bob', 'CHANGES_REQUESTED', '2026-10-05T11:00:00Z'),
          { author: { login: 'carol' } },
        ],
      }),
    );
  },
  draftSuppressesGateAndStall(s) {
    s.poll(pr({ isDraft: true, statusCheckRollup: GATE_GREEN }));
    s.poll(pr({ isDraft: true }), { advance: 2000 });
  },
  stallAndRebaseline(s) {
    s.poll(pr());
    s.poll(pr(), { advance: 1000 });
    s.poll(pr(), { advance: 1000 });
    s.poll(pr({ headRefOid: 'fedcba9876543210' }), {
      advance: 5000,
      rebaseline: true,
    });
    s.poll(pr({ headRefOid: 'fedcba9876543210' }), { advance: 1000 });
  },
  mergeableMissingRendersNone(s) {
    const p = pr({
      statusCheckRollup: withStatus(GATE_GREEN, 'No Merge Conflicts', 'ERROR'),
    });
    delete p.mergeable;
    s.poll(p);
    s.poll(p);
  },
  nullFieldsUsePythonGetSemantics(s) {
    s.poll(
      pr({
        headRefOid: null,
        labels: null,
        latestReviews: null,
        statusCheckRollup: null,
      }),
    );
    s.poll(pr({ state: null, mergeable: null }));
  },
  corruptStateFileResetsToBaseline(s) {
    s.poll(pr({ labels: [label('ci-stuck')] }));
    writeFileSync(s.stateFile, 'not json');
    s.poll(pr({ labels: [label('ci-stuck'), label('CI: Build')] }));
  },
  stateFileReadBack(s) {
    // A second poll must parse the first poll's state file (format round-trip).
    s.poll(
      pr({
        labels: [label('b'), label('a')],
        statusCheckRollup: [run(ROCKET, 'FAILURE', 'x')],
      }),
    );
    s.poll(
      pr({
        labels: [label('b'), label('a')],
        statusCheckRollup: [run(ROCKET, 'FAILURE', 'x')],
      }),
    );
    s.poll(
      pr({
        labels: [label('b'), label('a')],
        statusCheckRollup: [run(ROCKET, 'FAILURE', 'x')],
      }),
    );
  },
};

// Malformed inputs: only rc + line count must match — the diagnostic text
// carries each runtime's own error message.
const malformed = {
  emptyPayload: (s) => s.poll(null, { raw: '' }),
  nonJsonPayload: (s) =>
    s.poll(null, { raw: 'Python was not found; run without arguments' }),
  listPayload: (s) => s.poll(null, { raw: '[1, 2]' }),
  nullAuthorCrashesPollOnly: (s) =>
    s.poll(pr({ latestReviews: [{ author: null }] })),
  nonDictRollupNode: (s) => s.poll(pr({ statusCheckRollup: ['oops'] })),
};

/** Run a scenario on a target and return every poll's observable result. */
function transcript(target, scenario) {
  const s = session(target);
  const polls = [];
  const recorder = {
    get stateFile() {
      return s.stateFile;
    },
    poll: (...args) => {
      const r = s.poll(...args);
      polls.push({
        rc: r.rc,
        stdout: r.stdout,
        state: r.state,
        stderr: r.stderr,
      });
      return r;
    },
  };
  try {
    scenario(recorder);
  } catch (e) {
    polls.push({ threw: e.message });
  } finally {
    s.cleanup();
  }
  return polls;
}

for (const [name, scenario] of Object.entries({
  ...scenarios,
  ...parityOnly,
})) {
  test(
    `watch-pr parity: node port matches python "${name}"`,
    { skip: NO_PYTHON },
    () => {
      const py = transcript(PYTHON_REF, scenario);
      const js = transcript('node', scenario);
      for (const p of py)
        assert.equal(
          p.stderr ?? '',
          '',
          `python reference crashed: ${p.stderr}`,
        );
      const strip = (t) =>
        t.map((p) =>
          Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'stderr')),
        );
      assert.deepEqual(strip(js), strip(py));
    },
  );
}

for (const [name, scenario] of Object.entries(malformed)) {
  test(`watch-pr parity: malformed input "${name}" degrades to one line + exit 2`, () => {
    const [js] = transcript('node', scenario);
    assert.equal(js.rc, 2, JSON.stringify(js));
    assert.equal(js.stdout.split('\n').filter(Boolean).length, 1, js.stdout);
    assert.match(js.stdout, /skipping, will retry next interval\.\n$/);
    assert.equal(js.stderr, '');
    if (PYTHON) {
      const [py] = transcript(PYTHON_REF, scenario);
      assert.equal(js.rc, py.rc);
      assert.equal(js.state, py.state);
    }
  });
}

// ---------------------------------------------------------------------------
// LS-10598: end to end through watch-pr.sh with stubbed binaries.
// ---------------------------------------------------------------------------

const POSIX = process.platform !== 'win32';

/** Stub bin dir: `gh` returns a fixed payload; `python*` mimic the Store alias. */
function stubBin(dir, ghPayload) {
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const write = (name, body) => {
    const p = join(bin, name);
    writeFileSync(p, `#!/bin/sh\n${body}\n`);
    chmodSync(p, 0o755);
  };
  writeFileSync(join(dir, 'payload.json'), JSON.stringify(ghPayload));
  write('gh', `cat '${join(dir, 'payload.json')}'`);
  for (const py of ['python', 'python3']) {
    write(
      py,
      'echo "Python was not found; run without arguments to install from the Microsoft Store, or disable this shortcut from Settings > Apps > Advanced app settings > App execution aliases." >&2\nexit 9009',
    );
  }
  return bin;
}

function runWatch(pathDirs, dir) {
  return spawnSync('/bin/bash', [WATCH, '42', '30'], {
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      PATH: pathDirs.join(delimiter),
      CLAUDE_PROJECT_DIR: dir,
      TMPDIR: dir,
    },
  });
}

test(
  'watch-pr.sh: works when python is only the Windows Store alias (no python dependency)',
  { skip: !POSIX },
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-pr-e2e-'));
    try {
      const bin = stubBin(dir, pr({ number: 42, state: 'MERGED' }));
      const r = runWatch(
        [bin, dirname(process.execPath), '/usr/bin', '/bin'],
        dir,
      );
      assert.equal(r.status, 0, `stdout=${r.stdout} stderr=${r.stderr}`);
      assert.equal(
        r.stdout,
        'PR #42 MERGED — terminal. Proceed to post-merge steps: verify Jira Done, complete tracking tasks, MCP gap audit.\n',
      );
      assert.ok(
        !existsSync(join(dir, '.claude', '.pr-watch-armed-42')),
        'heartbeat removed on exit',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

const nodeOnSystemPath = ['/usr/bin', '/bin'].some((d) =>
  existsSync(join(d, 'node')),
);

test(
  'watch-pr.sh: fails fast on the first line when node is unusable',
  { skip: !POSIX || nodeOnSystemPath },
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-pr-e2e-'));
    try {
      const bin = stubBin(dir, pr({ number: 42 }));
      const started = Date.now();
      const r = runWatch([bin, '/usr/bin', '/bin'], dir);
      assert.equal(r.status, 1, `stdout=${r.stdout} stderr=${r.stderr}`);
      assert.match(
        r.stdout,
        /^watch #42 degraded: no usable JSON runtime — `node` is not on PATH/,
      );
      assert.equal(r.stdout.split('\n').filter(Boolean).length, 1);
      assert.ok(
        Date.now() - started < 10_000,
        'must not wait for a poll interval',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test('watch-pr.sh: no python invocation remains', () => {
  const src = readFileSync(WATCH, 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(src, /\bpython3?\b|PYEOF/);
});
