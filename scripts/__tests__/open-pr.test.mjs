/**
 * Tests for scripts/open-pr.mjs and .claude/hooks/guard-gh-pr-marker.mjs
 * (LS-10110) — the guard on the raw `gh pr create` fallback that keeps
 * dropping the jira-link marker.
 *
 * Run via: node --test scripts/__tests__/open-pr.test.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildCreateArgs, checkPrBody, prepareBody } from '../open-pr.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const HOOK = join(ROOT, '.claude', 'hooks', 'guard-gh-pr-marker.mjs');
const CLI = join(ROOT, 'scripts', 'open-pr.mjs');

const GOOD = '<!-- jira-link\nprimary: LS-10110\n-->\n\n## Context\nbody\n';
const PROSE_ONLY = '## Context\nJira: LS-10110\n';
const SINGLE_LINE = '<!-- jira-link: LS-10110 -->\n\nbody\n';

function runHook(command, cwd) {
  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify({
      session_id: 'open-pr-test',
      tool_name: 'Bash',
      cwd,
      tool_input: { command },
    }),
    encoding: 'utf8',
  });
  return { code: result.status, stderr: result.stderr };
}

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'open-pr-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('checkPrBody accepts the structured marker', () => {
  assert.equal(checkPrBody(GOOD, 'LS-10110 fix(x): y').ok, true);
});

test('checkPrBody rejects a prose Jira line, single-line marker, and title mismatch', () => {
  assert.equal(checkPrBody(PROSE_ONLY).ok, false);
  assert.equal(checkPrBody(SINGLE_LINE).ok, false);
  const mismatch = checkPrBody(GOOD, 'LS-999 fix(x): y');
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.errors[0], /title does not contain/);
});

test('prepareBody injects exactly one marker and replaces a malformed one', () => {
  for (const source of [PROSE_ONLY, SINGLE_LINE, GOOD]) {
    const prepared = prepareBody(source, { ticket: 'LS-10110' });
    assert.equal(checkPrBody(prepared, 'LS-10110 x').ok, true);
    assert.equal(prepared.match(/jira-link/g).length, 1);
  }
});

test('buildCreateArgs always passes explicit --head and --base', () => {
  const args = buildCreateArgs({
    title: 't',
    bodyFile: 'f',
    head: 'br',
    base: 'main',
    draft: true,
  });
  assert.deepEqual(args.slice(args.indexOf('--head')), [
    '--head',
    'br',
    '--base',
    'main',
    '--draft',
  ]);
});

test('hook blocks gh pr create when the body file has no marker', () =>
  withDir((dir) => {
    writeFileSync(join(dir, 'body.md'), PROSE_ONLY);
    const r = runHook(
      'gh pr create --title "LS-1 x" --body-file body.md --head b',
      dir,
    );
    assert.equal(r.code, 2);
    assert.match(r.stderr, /open-pr\.mjs --ticket/);
  }));

test('hook blocks gh pr edit --body-file without a marker', () =>
  withDir((dir) => {
    writeFileSync(join(dir, 'body.md'), SINGLE_LINE);
    assert.equal(runHook('gh pr edit 12 --body-file body.md', dir).code, 2);
  }));

test('hook allows a body file that carries the marker', () =>
  withDir((dir) => {
    writeFileSync(join(dir, 'body.md'), GOOD);
    assert.equal(
      runHook('gh pr create --draft --body-file body.md', dir).code,
      0,
    );
  }));

test('hook uses the command text when the body is written by a heredoc in the same command', () =>
  withDir((dir) => {
    const withMarker = `cat > b.md <<'EOF'\n${GOOD}EOF\ngh pr create --body-file b.md --head x`;
    const without = `cat > b.md <<'EOF'\n${PROSE_ONLY}EOF\ngh pr create --body-file b.md --head x`;
    assert.equal(runHook(withMarker, dir).code, 0);
    assert.equal(runHook(without, dir).code, 2);
  }));

test('hook blocks gh pr create with --fill / no body flag, allows body-less gh pr edit', () => {
  assert.equal(runHook('gh pr create --fill', process.cwd()).code, 2);
  assert.equal(runHook('gh pr create --title t', process.cwd()).code, 2);
  assert.equal(
    runHook('gh pr edit 5 --add-label bot:ready-for-review', process.cwd())
      .code,
    0,
  );
  assert.equal(runHook('gh pr ready 5', process.cwd()).code, 0);
});

test('hook ignores prose that merely mentions the command, and the wrapper itself', () => {
  assert.equal(
    runHook(
      'git commit -m "docs: never run gh pr create --body-file raw"',
      process.cwd(),
    ).code,
    0,
  );
  assert.equal(
    runHook(
      'node scripts/open-pr.mjs --ticket LS-1 --title t --body-file f --head b',
      process.cwd(),
    ).code,
    0,
  );
});

test('hook honours the # marker-ok bypass and fails open on garbage input', () => {
  assert.equal(
    runHook('gh pr create --fill # marker-ok: bot PR', process.cwd()).code,
    0,
  );
  const garbage = spawnSync('node', [HOOK], {
    input: 'not json',
    encoding: 'utf8',
  });
  assert.equal(garbage.status, 0);
});

test('CLI --check exits non-zero with a fix block, zero on a valid body', () =>
  withDir((dir) => {
    writeFileSync(join(dir, 'bad.md'), PROSE_ONLY);
    writeFileSync(join(dir, 'good.md'), GOOD);
    const bad = spawnSync('node', [CLI, '--check', join(dir, 'bad.md')], {
      encoding: 'utf8',
    });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /primary: LS-10110/);
    const good = spawnSync('node', [CLI, '--check', join(dir, 'good.md')], {
      encoding: 'utf8',
    });
    assert.equal(good.status, 0);
  }));

test('CLI --dry-run injects the marker and refuses a title without the ticket key', () =>
  withDir((dir) => {
    writeFileSync(join(dir, 'body.md'), PROSE_ONLY);
    const base = [
      '--ticket',
      'LS-10110',
      '--body-file',
      join(dir, 'body.md'),
      '--head',
      'b',
      '--dry-run',
    ];
    const ok = spawnSync(
      'node',
      [CLI, ...base, '--title', 'LS-10110 fix(x): y'],
      { encoding: 'utf8' },
    );
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /primary: LS-10110/);
    const bad = spawnSync('node', [CLI, ...base, '--title', 'fix(x): no key'], {
      encoding: 'utf8',
    });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /title does not contain/);
  }));
