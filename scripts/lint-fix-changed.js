#!/usr/bin/env node
/**
 * Scope `eslint --fix` to files actually changed on this branch (LS-8777).
 *
 * `pc-lint` used to run `nx affected -t lint --fix`, which invokes each
 * affected *project's* lint target (`eslint .`) — fixing every file in the
 * project, not just the ones the agent touched. That silently strips BOMs
 * and removes `eslint-disable` directives from unrelated files, widening
 * the PR's diff beyond its scope (git status showed files nobody edited).
 *
 * This script fixes only files changed vs the merge-base, grouped by the
 * nearest eslint.config.* directory (ESLint 9 resolves flat config from cwd,
 * so a mixed-project file list would apply the wrong rules — same
 * constraint as tools/mcp/nx-server/src/tools/run-eslint.ts). The Makefile
 * follows this with an unscoped `nx affected -t lint` (no --fix) so
 * violations this pass can't autofix still fail pc-lint and get reported.
 *
 * Usage: node scripts/lint-fix-changed.js --base <ref>
 *
 * Fail-safe: if git diff fails or nothing changed, exits 0 without fixing
 * anything — the unscoped check step still catches real violations.
 */

const { execFileSync } = require('child_process');
const { existsSync } = require('fs');
const { dirname, extname, join, relative, resolve } = require('path');

// pnpm is a `.cmd` shim on Windows — execFileSync needs the explicit
// extension to run it without `shell: true` (which would otherwise re-parse
// the command through cmd.exe and risk shell metacharacter injection from
// file paths). Same pattern as resolveCommand() in
// tools/mcp/nx-server/src/run-command.ts.
const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const LINTABLE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);

// ESLint 9 flat-config filenames, in the order ESLint itself probes them.
const ESLINT_CONFIG_FILENAMES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
];

function parseBaseRef(argv) {
  const idx = argv.indexOf('--base');
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : 'origin/main';
}

/** Find the directory whose flat config governs `absFile`, bounded by `root`. */
function resolveConfigDir(absFile, root) {
  let dir = dirname(absFile);
  for (;;) {
    if (ESLINT_CONFIG_FILENAMES.some((name) => existsSync(join(dir, name)))) {
      return dir;
    }
    if (dir === root) return root;
    const parent = dirname(dir);
    if (parent === dir) return root;
    dir = parent;
  }
}

/**
 * Changed files vs the merge-base, including uncommitted and untracked work
 * — matches what `nx affected` itself considers "affected" (committed +
 * staged + unstaged + new files). `git diff` alone omits untracked files
 * (they're outside the index), so new files are picked up separately via
 * `git status`. Returns null on failure so the caller can fail safe.
 */
function getChangedFiles(baseRef, root) {
  try {
    const mergeBase = execFileSync('git', ['merge-base', baseRef, 'HEAD'], {
      cwd: root,
      encoding: 'utf-8',
    }).trim();
    const diffOutput = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=ACMR', mergeBase],
      { cwd: root, encoding: 'utf-8' },
    ).trim();
    const untrackedOutput = execFileSync(
      'git',
      ['ls-files', '--others', '--exclude-standard'],
      { cwd: root, encoding: 'utf-8' },
    ).trim();
    const files = new Set([
      ...(diffOutput ? diffOutput.split('\n').filter(Boolean) : []),
      ...(untrackedOutput ? untrackedOutput.split('\n').filter(Boolean) : []),
    ]);
    return [...files];
  } catch {
    return null;
  }
}

/** Group lintable changed files by the eslint config directory that governs them. */
function groupByConfigDir(files, root) {
  const byConfigDir = new Map();
  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');
    if (!LINTABLE_EXTENSIONS.has(extname(normalized))) continue;

    const absFile = resolve(root, normalized);
    if (!existsSync(absFile)) continue; // deleted/renamed-away files

    const configDir = resolveConfigDir(absFile, root);
    const relFile = relative(configDir, absFile).replace(/\\/g, '/');
    const group = byConfigDir.get(configDir);
    if (group) group.push(relFile);
    else byConfigDir.set(configDir, [relFile]);
  }
  return byConfigDir;
}

function main() {
  const root = resolve(__dirname, '..');
  const baseRef = parseBaseRef(process.argv);

  const files = getChangedFiles(baseRef, root);
  if (files === null) {
    process.stdout.write(
      '  git diff failed — skipping scoped autofix (unscoped lint check still runs)\n',
    );
    return;
  }
  if (files.length === 0) {
    process.stdout.write('  No changes vs base — skipping autofix\n');
    return;
  }

  const byConfigDir = groupByConfigDir(files, root);
  if (byConfigDir.size === 0) {
    process.stdout.write(
      '  No changed lintable files vs base — skipping autofix\n',
    );
    return;
  }

  for (const [configDir, relFiles] of byConfigDir) {
    const label = relative(root, configDir) || '.';
    process.stdout.write(
      `  Fixing ${relFiles.length} file(s) in ${label}...\n`,
    );
    try {
      execFileSync(
        PNPM_COMMAND,
        [
          'exec',
          'eslint',
          '--fix',
          '--fix-type=problem,suggestion,layout',
          ...relFiles,
        ],
        { cwd: configDir, stdio: 'inherit' },
      );
    } catch {
      // eslint --fix exits non-zero when unfixable violations remain — expected.
      // The unscoped `nx affected -t lint` check that follows in the Makefile
      // reports those; this pass's only job is to apply what it safely can.
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { resolveConfigDir, groupByConfigDir, getChangedFiles };
