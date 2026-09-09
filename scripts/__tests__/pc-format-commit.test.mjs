import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFileList } from '../pc-format-commit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '..', 'pc-format-commit.js');
const STUB_PRETTIER = path.join(__dirname, '..', 'pc-format-stub-prettier.js');
const STUB_PRETTIER_TWO_PASS = path.join(
  __dirname,
  '..',
  'pc-format-stub-prettier-two-pass.js',
);
const STUB_PRETTIER_NEVER_CONVERGES = path.join(
  __dirname,
  '..',
  'pc-format-stub-prettier-never-converges.js',
);

test('parseFileList', () => {
  assert.deepEqual(parseFileList('a.js\nb.js\n'), ['a.js', 'b.js']);
  assert.deepEqual(parseFileList('  a.js  \n\n b.js\n'), ['a.js', 'b.js']);
  assert.deepEqual(parseFileList(''), []);
  assert.deepEqual(parseFileList('\n\n'), []);
});

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function makeTempRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'pc-format-commit-'));
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  return dir;
}

test('an unrelated working-tree edit made while pc-format runs is left uncommitted', () => {
  const dir = makeTempRepo();
  try {
    // Baseline committed state: the file prettier will "reformat", plus an
    // unrelated tracked file that will be edited mid-run.
    writeFileSync(path.join(dir, 'needs-format.js'), 'unformatted-content\n');
    writeFileSync(path.join(dir, 'unrelated.txt'), 'original\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'baseline']);

    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PC_FORMAT_PRETTIER_ARGV: JSON.stringify([
          process.execPath,
          STUB_PRETTIER,
        ]),
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    // The formatter commit exists, and stages ONLY the file prettier
    // reported -- never the concurrently-edited unrelated file.
    const log = git(dir, ['log', '--format=%s']);
    assert.match(log, /^style: apply formatting/);

    const committedFiles = git(dir, [
      'show',
      '--name-only',
      '--format=',
      'HEAD',
    ])
      .trim()
      .split('\n')
      .filter(Boolean);
    assert.deepEqual(committedFiles, ['needs-format.js']);

    // The unrelated edit is real (the "agent's" in-flight work survived)
    // but was left uncommitted and unstaged, exactly as it should be.
    const status = git(dir, ['status', '--porcelain']);
    assert.match(status, /^ M unrelated\.txt$/m);

    const staged = git(dir, ['diff', '--cached', '--name-only']);
    assert.equal(staged.trim(), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no formatting changes needed leaves the tree untouched', () => {
  const dir = makeTempRepo();
  try {
    writeFileSync(path.join(dir, 'already-formatted.js'), 'fine\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'baseline']);

    const noopStub = path.join(dir, 'noop-prettier.js');
    writeFileSync(
      noopStub,
      "process.exit(process.argv.includes('--list-different') ? 0 : 0);\n",
    );

    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PC_FORMAT_PRETTIER_ARGV: JSON.stringify([process.execPath, noopStub]),
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /No formatting changes needed/);

    const log = git(dir, ['log', '--format=%s']);
    assert.equal(log.trim(), 'baseline');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a file needing two write passes to converge is re-written until prettier --list-different agrees (LS-9894)', () => {
  const dir = makeTempRepo();
  try {
    writeFileSync(path.join(dir, 'needs-format.md'), 'original-content\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'baseline']);

    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PC_FORMAT_PRETTIER_ARGV: JSON.stringify([
          process.execPath,
          STUB_PRETTIER_TWO_PASS,
        ]),
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Format fixes committed/);

    // The committed content is from the SECOND write pass -- the first
    // pass's output was never accepted because --list-different still
    // flagged it.
    const committed = git(dir, ['show', 'HEAD:needs-format.md']);
    assert.equal(committed, 'formatted-content-pass-2\n');

    const status = git(dir, ['status', '--porcelain', '--', 'needs-format.md']);
    assert.equal(status.trim(), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a file that never converges fails loudly instead of committing non-canonical output (LS-9894)', () => {
  const dir = makeTempRepo();
  try {
    writeFileSync(path.join(dir, 'needs-format.md'), 'original-content\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'baseline']);

    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PC_FORMAT_PRETTIER_ARGV: JSON.stringify([
          process.execPath,
          STUB_PRETTIER_NEVER_CONVERGES,
        ]),
      },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /did not converge/);

    // Nothing was committed -- the working tree is left dirty rather than
    // silently accepting non-canonical formatting.
    const log = git(dir, ['log', '--format=%s']);
    assert.equal(log.trim(), 'baseline');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
