/**
 * Tests for the .claude/hooks/check-open-pr.sh stop hook (LS-10612).
 *
 * The hook used to parse `gh pr view` JSON and the Periodic Wake Protocol
 * state file with inline `python -c`. On Windows hosts whose `python` is only
 * the Microsoft Store App Execution Alias, every parse failed silently and the
 * hook allowed every stop — the open-PR guard was simply off. JSON parsing now
 * lives in the dependency-free .claude/hooks/lib/check-open-pr-json.mjs.
 *
 * Coverage:
 *  - unit tests of the helper's two modes (run everywhere);
 *  - end to end through the hook with stubbed `gh` and `python`/`python3`
 *    stubs that mimic the Store alias, across the decision table (terminal,
 *    blocked-label, draft, ready, conflict, watch-flag fresh/stale, CCR
 *    state-file ok/terminal/malformed);
 *  - negative control: the same blocking scenarios against a frozen copy of
 *    the last Python version (fixtures/check-open-pr/python-check-open-pr.sh)
 *    must wrongly allow the stop under the Store stub, so the suite cannot
 *    pass vacuously;
 *  - parity: with a real Python available, the frozen Python hook and the
 *    Node hook must produce identical exit codes and stderr on every scenario.
 *
 * End-to-end tests need a POSIX bash (Git Bash on Windows) and skip otherwise.
 *
 * Run via: node --test scripts/__tests__/check-open-pr.test.mjs
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
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

import {
  classifyState,
  parsePr,
} from '../../.claude/hooks/lib/check-open-pr-json.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const HOOK = join(ROOT, '.claude', 'hooks', 'check-open-pr.sh');
const HELPER = join(ROOT, '.claude', 'hooks', 'lib', 'check-open-pr-json.mjs');
const PYTHON_REF = join(
  import.meta.dirname,
  'fixtures',
  'check-open-pr',
  'python-check-open-pr.sh',
);

const STORE_STUB =
  'echo "Python was not found; run without arguments to install from the Microsoft Store, or disable this shortcut from Settings > Apps > Advanced app settings > App execution aliases." >&2\nexit 9009';

/** A bash that runs POSIX scripts: /bin/bash, or Git Bash on Windows. */
const BASH = [
  '/bin/bash',
  'C:/Program Files/Git/bin/bash.exe',
  'C:/Program Files/Git/usr/bin/bash.exe',
].find((p) => existsSync(p));
const NO_BASH = BASH ? false : 'no POSIX bash available';

/**
 * Absolute path of a real Python 3 (never the Store alias), for the parity
 * test. Absolute because the stub-dir `python` shim exec's it — a bare name
 * would resolve back to the shim itself and recurse forever.
 */
const PYTHON = ['python3', 'python']
  .map((p) =>
    spawnSync(p, ['-c', 'import json, sys; print(sys.executable)'], {
      encoding: 'utf8',
    }),
  )
  .find((r) => r.status === 0 && r.stdout.trim())
  ?.stdout.trim();

const fwd = (p) => p.replace(/\\/g, '/');

// ---------------------------------------------------------------------------
// Helper unit tests
// ---------------------------------------------------------------------------

const PR = {
  number: 42,
  state: 'OPEN',
  isDraft: false,
  labels: [],
  mergeable: 'MERGEABLE',
  headRefOid: 'abcdef0123456789',
};

test('parsePr: pipe-delimited summary matching the python format', () => {
  assert.equal(parsePr(JSON.stringify(PR)), '42|OPEN|false||MERGEABLE|abcdef0');
  assert.equal(
    parsePr(
      JSON.stringify({
        ...PR,
        isDraft: true,
        labels: [{ name: 'a' }, { name: 'CI: Conflicts' }],
        mergeable: null,
        headRefOid: null,
      }),
    ),
    '42|OPEN|true|a,CI: Conflicts|UNKNOWN|',
  );
  assert.equal(
    parsePr(JSON.stringify({ ...PR, mergeable: '' })),
    '42|OPEN|false||UNKNOWN|abcdef0',
  );
});

test('parsePr: emits nothing for empty, malformed or incomplete JSON', () => {
  for (const raw of [
    '',
    'not json',
    '{}',
    'null',
    '[]',
    JSON.stringify({ state: 'OPEN' }),
    JSON.stringify({ number: 1 }),
    JSON.stringify({ ...PR, labels: 'x' }),
    JSON.stringify({ ...PR, labels: [{}] }),
  ]) {
    assert.equal(parsePr(raw), null, raw);
  }
});

test('classifyState: Periodic Wake Protocol thresholds', () => {
  assert.equal(classifyState('{}'), 'ok');
  assert.equal(classifyState('{"idleCount":5,"cycleCount":11}'), 'ok');
  assert.equal(classifyState('{"idleCount":null}'), 'ok');
  assert.equal(classifyState('{"idleCount":6}'), 'terminal');
  assert.equal(classifyState('{"cycleCount":12}'), 'terminal');
  for (const raw of ['', 'nope', '[]', '3', '{"idleCount":"7"}']) {
    assert.equal(classifyState(raw), 'unknown', raw);
  }
});

test('helper CLI: prints the summary / classification', () => {
  const pr = spawnSync(process.execPath, [HELPER, 'pr'], {
    encoding: 'utf8',
    env: { ...process.env, PR_JSON: JSON.stringify(PR) },
  });
  assert.equal(pr.status, 0);
  assert.equal(pr.stdout, '42|OPEN|false||MERGEABLE|abcdef0\n');

  const missing = spawnSync(process.execPath, [HELPER, 'state', 'nope.json'], {
    encoding: 'utf8',
  });
  assert.equal(missing.status, 0);
  assert.equal(missing.stdout, 'unknown\n');
});

test('check-open-pr.sh: no python invocation remains', () => {
  const src = readFileSync(HOOK, 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(src, /\bpython3?\b/);
});

// ---------------------------------------------------------------------------
// End to end through the hook with stubbed binaries
// ---------------------------------------------------------------------------

const MIN = 60 * 1000;

/**
 * Scenarios: PR payload (null = gh prints nothing), optional setup of the
 * worktree, and the expected exit code + stderr pattern.
 */
const SCENARIOS = [
  { name: 'merged', pr: { ...PR, state: 'MERGED' }, rc: 0, err: /^$/ },
  { name: 'closed', pr: { ...PR, state: 'CLOSED' }, rc: 0, err: /^$/ },
  { name: 'no PR', pr: null, rc: 0, err: /^$/ },
  {
    name: 'not a claude/ branch',
    pr: PR,
    branch: 'feature/x',
    rc: 0,
    err: /^$/,
  },
  {
    name: 'legitimately blocked label',
    pr: { ...PR, labels: [{ name: 'needs-human-arbitration' }] },
    rc: 0,
    err: /^$/,
  },
  {
    name: 'open + ready, nothing armed',
    pr: PR,
    rc: 2,
    err: /STOP BLOCKED — open PR not driven to merge[\s\S]*PR #42 is open and ready/,
  },
  {
    name: 'draft',
    pr: { ...PR, isDraft: true },
    rc: 2,
    err: /Draft PR #42 is not a terminal state/,
  },
  {
    name: 'merge conflict',
    pr: { ...PR, mergeable: 'CONFLICTING' },
    rc: 2,
    err: /PR #42 has merge conflicts with main/,
  },
  {
    name: 'fresh watch flag',
    pr: PR,
    setup: (wt) => writeFileSync(join(wt, '.claude', '.pr-watch-armed-42'), ''),
    rc: 0,
    err: /PR #42 watch is armed/,
  },
  {
    name: 'stale watch flag',
    pr: PR,
    setup: (wt) => touchAged(join(wt, '.claude', '.pr-watch-armed-42'), '', 10),
    rc: 2,
    err: /Watch flag for PR #42 is STALE[\s\S]*STOP BLOCKED/,
  },
  {
    name: 'CCR state file fresh + ok',
    pr: PR,
    setup: (wt) =>
      writeFileSync(
        join(wt, '.claude', '.pr-state-42.json'),
        '{"idleCount":1,"cycleCount":3}',
      ),
    rc: 0,
    err: /PR #42 periodic-wake state \(\.claude\/\.pr-state-42\.json/,
  },
  {
    name: 'CCR state file terminal',
    pr: PR,
    setup: (wt) =>
      writeFileSync(
        join(wt, '.claude', '.pr-state-42.json'),
        '{"idleCount":6}',
      ),
    rc: 2,
    err: /STOP BLOCKED/,
  },
  {
    name: 'CCR state file malformed',
    pr: PR,
    setup: (wt) =>
      writeFileSync(join(wt, '.claude', '.pr-state-42.json'), '{oops'),
    rc: 2,
    err: /STOP BLOCKED/,
  },
  {
    name: 'CCR state file stale',
    pr: PR,
    setup: (wt) =>
      touchAged(join(wt, '.claude', '.pr-state-42.json'), '{}', 40),
    rc: 2,
    err: /STOP BLOCKED/,
  },
];

function touchAged(path, content, minutes) {
  writeFileSync(path, content);
  const t = new Date(Date.now() - minutes * MIN);
  utimesSync(path, t, t);
}

/**
 * Fresh worktree (git repo on `branch`) + stub bin dir. `python` is either the
 * Store-alias stub or a shim to a real interpreter.
 */
function sandbox({ pr, branch = 'claude/test', setup }, { realPython } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'check-open-pr-'));
  const wt = join(dir, 'wt');
  const bin = join(dir, 'bin');
  const tmp = join(dir, 'tmp');
  for (const d of [wt, bin, tmp]) mkdirSync(d);
  mkdirSync(join(wt, '.claude'));

  const git = (...args) =>
    spawnSync('git', ['-C', wt, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', branch);
  git(
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  );
  setup?.(wt);

  const write = (name, body) => {
    const p = join(bin, name);
    writeFileSync(p, `#!/bin/sh\n${body}\n`);
    chmodSync(p, 0o755);
  };
  const payload = join(dir, 'payload.json');
  writeFileSync(payload, pr === null ? '' : JSON.stringify(pr));
  write('gh', `cat '${fwd(payload)}'`);
  for (const py of ['python', 'python3']) {
    write(py, realPython ? `exec '${fwd(realPython)}' "$@"` : STORE_STUB);
  }
  return { dir, wt, bin, tmp };
}

function runHook(script, box, pathDirs) {
  const r = spawnSync(BASH, [script], {
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      PATH: pathDirs.join(delimiter),
      CLAUDE_PROJECT_DIR: box.wt,
      TMPDIR: box.tmp,
    },
  });
  return {
    rc: r.status,
    // Normalise the per-sandbox worktree path and wall-clock file ages
    // ("(12s old)") for cross-run comparison — two runs can straddle a second.
    stderr: r.stderr
      .split(fwd(box.wt))
      .join('<WT>')
      .replace(/\b\d+s old\b/g, 'Ns old'),
    stdout: r.stdout,
  };
}

/** PATH with the stubs first, then the real environment (node, git, coreutils). */
const fullPath = (box) => [box.bin, ...process.env.PATH.split(delimiter)];

function withBox(scenario, opts, fn) {
  const box = sandbox(scenario, opts);
  try {
    return fn(box);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
}

for (const s of SCENARIOS) {
  test(
    `check-open-pr.sh under the Windows Store python stub: ${s.name}`,
    { skip: NO_BASH },
    () =>
      withBox(s, {}, (box) => {
        const r = runHook(HOOK, box, fullPath(box));
        assert.equal(r.rc, s.rc, `stderr=${r.stderr}`);
        assert.match(r.stderr, s.err);
        assert.doesNotMatch(r.stderr, /Python was not found/);
      }),
  );
}

test(
  'negative control: the python hook wrongly allows every blocking stop under the Store stub',
  { skip: NO_BASH },
  () => {
    const blocking = SCENARIOS.filter((s) => s.rc === 2);
    assert.ok(blocking.length >= 5);
    for (const s of blocking) {
      withBox(s, {}, (box) => {
        const r = runHook(PYTHON_REF, box, fullPath(box));
        assert.equal(r.rc, 0, `${s.name}: stderr=${r.stderr}`);
      });
    }
  },
);

test(
  'parity: node hook matches the python hook on every scenario',
  { skip: NO_BASH || (PYTHON ? false : 'no real python on PATH') },
  () => {
    for (const s of SCENARIOS) {
      const ref = withBox(s, { realPython: PYTHON }, (box) =>
        runHook(PYTHON_REF, box, fullPath(box)),
      );
      const cur = withBox(s, { realPython: PYTHON }, (box) =>
        runHook(HOOK, box, fullPath(box)),
      );
      assert.equal(cur.rc, ref.rc, `${s.name}: exit code`);
      assert.equal(cur.stderr, ref.stderr, `${s.name}: stderr`);
    }
  },
);

const nodeOnSystemPath = ['/usr/bin', '/bin'].some((d) =>
  existsSync(join(d, 'node')),
);

test(
  'check-open-pr.sh: fails open with a reason when node is unusable',
  { skip: NO_BASH || process.platform === 'win32' || nodeOnSystemPath },
  () =>
    withBox({ pr: PR }, {}, (box) => {
      const r = runHook(HOOK, box, [box.bin, '/usr/bin', '/bin']);
      assert.equal(r.rc, 0, `stderr=${r.stderr}`);
      assert.match(r.stderr, /check-open-pr: skipped — node is not runnable/);
    }),
);

test(
  'check-open-pr.sh: resolves its helper from its own path, not the cwd',
  { skip: NO_BASH },
  () =>
    withBox({ pr: PR }, {}, (box) => {
      const r = spawnSync(BASH, [HOOK], {
        encoding: 'utf8',
        cwd: dirname(box.dir),
        env: {
          ...process.env,
          PATH: fullPath(box).join(delimiter),
          CLAUDE_PROJECT_DIR: box.wt,
          TMPDIR: box.tmp,
        },
      });
      assert.equal(r.status, 2, r.stderr);
    }),
);
