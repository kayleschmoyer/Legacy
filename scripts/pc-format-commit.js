#!/usr/bin/env node
/**
 * Formatting step for `make pc` / `make pc-format` (LS-8367, LS-9598).
 *
 * Runs prettier, then commits ONLY the files prettier itself reported as
 * needing formatting, as a new "style: apply formatting" commit.
 *
 * Why not `git add -A` (the previous implementation, LS-9598): `pc-format`
 * is routinely run with `run_in_background: true` in cloud/degraded
 * sessions (per AGENTS.md), and prettier's full-repo `--write` pass can
 * take minutes. If the calling agent keeps editing other files while it
 * runs -- exactly what the backgrounding guidance encourages -- those
 * unrelated edits were indistinguishable from prettier's own rewrites once
 * the recipe fell back to "commit whatever is dirty", and got swept into
 * a commit mislabeled "style: apply formatting" (observed live in LS-9585).
 *
 * Fix: ask prettier which files it would rewrite BEFORE writing anything
 * (`--list-different`), write only that exact file list, and `git add`
 * only that exact file list. Any file outside that list -- whatever else
 * is dirty in the working tree, however it got that way -- is never
 * staged or committed here.
 *
 * A single cross-platform Node script replaces the previous separate
 * bash/PowerShell recipes so there is exactly one implementation to keep
 * correct.
 */

'use strict';

const { spawnSync } = require('node:child_process');

const IS_WINDOWS = process.platform === 'win32';

// Overridable for tests -- production always uses the hardcoded
// `pnpm exec prettier` below. The override is a JSON array of argv
// (e.g. `["node","/path/to/stub.js"]`), never a shell string: this keeps
// the test hook from ever needing `shell: true` or space-splitting, which
// would otherwise make argument parsing fragile and -- on Windows, where
// `shell: true` invokes `cmd.exe` -- a command-injection risk if this
// variable were ever attacker-influenced.
function resolvePrettierCommand() {
  const override = process.env.PC_FORMAT_PRETTIER_ARGV;
  if (!override) {
    return { argv: ['pnpm', 'exec', 'prettier'], useShell: IS_WINDOWS };
  }
  let argv;
  try {
    argv = JSON.parse(override);
  } catch (err) {
    throw new Error(
      `PC_FORMAT_PRETTIER_ARGV must be a JSON array of strings: ${err.message}`,
    );
  }
  if (!Array.isArray(argv) || !argv.every((a) => typeof a === 'string')) {
    throw new Error('PC_FORMAT_PRETTIER_ARGV must be a JSON array of strings');
  }
  return { argv, useShell: false };
}

const { argv: PRETTIER_CMD, useShell: PRETTIER_USE_SHELL } =
  resolvePrettierCommand();

function runPrettier(args) {
  const [cmd, ...rest] = PRETTIER_CMD;
  const result = spawnSync(cmd, [...rest, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: PRETTIER_USE_SHELL,
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function git(args) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed (exit ${result.status}): ${result.stderr}`,
    );
  }
  return result.stdout;
}

/** Parse prettier's `--list-different` stdout into a file list. */
function parseFileList(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  // 1. Dry run: which files does prettier actually want to rewrite?
  //    Exit code 1 just means "found differing files" -- not a failure.
  const listResult = runPrettier(['--list-different', '--ignore-unknown', '.']);
  if (listResult.status !== 0 && listResult.status !== 1) {
    process.stderr.write(listResult.stderr || listResult.stdout || '');
    process.exitCode = listResult.status ?? 1;
    return;
  }
  const files = parseFileList(listResult.stdout);

  if (files.length === 0) {
    console.log('  No formatting changes needed.');
    return;
  }

  // 2. Refuse only when one of THOSE specific files is already dirty --
  //    we can't tell a pre-existing hand edit apart from a format fix on
  //    the same file. Dirty files elsewhere in the tree are none of this
  //    step's business and are left alone.
  const preStatus = git(['status', '--porcelain', '--', ...files]);
  if (preStatus.trim()) {
    console.error('');
    console.error(
      'ERROR: The following files need formatting but already have uncommitted changes:',
    );
    console.error(
      preStatus
        .trim()
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n'),
    );
    console.error('');
    console.error('Commit or stash them first, then re-run make pc.');
    process.exitCode = 1;
    return;
  }

  // 3. Format exactly those files -- not the whole repo.
  console.log('  Formatting changed files; committing as a new commit...');
  const writeResult = runPrettier(['--write', '--ignore-unknown', ...files]);
  if (writeResult.status !== 0) {
    process.stderr.write(writeResult.stderr || writeResult.stdout || '');
    process.exitCode = writeResult.status ?? 1;
    return;
  }

  // 4. Stage and commit ONLY the files prettier was told to rewrite.
  //    Never `git add -A`: whatever else became dirty while this ran --
  //    including edits made by an agent that kept working while pc-format
  //    was backgrounded -- stays out of this commit.
  git(['add', '--', ...files]);
  const staged = git(['diff', '--cached', '--name-only']);
  if (!staged.trim()) {
    console.log('  No formatting changes to commit.');
    return;
  }
  git(['commit', '-m', 'style: apply formatting']);
  console.log('  ✓ Format fixes committed as a new commit.');
}

if (require.main === module) {
  main();
}

module.exports = { parseFileList, main };
