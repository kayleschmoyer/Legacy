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
 *
 * LS-9899: eslint is invoked via the resolved `eslint` binary directly, NOT
 * via `pnpm exec eslint`. `pnpm exec` silently resets the child process's
 * cwd to the nearest ancestor directory that has its own `package.json` —
 * for a project dir with no `package.json` of its own (apps/web-e2e,
 * lib/codegen, lib/scheduling, apps/cli-e2e, apps/graphql-explorer,
 * tools/mcp/worktree-server — Nx-only projects that rely on the hoisted
 * root node_modules), that silently becomes the repo root instead of
 * `configDir`. The relative file paths built below (relative to `configDir`)
 * then don't exist relative to the repo root, so eslint exits 2 with "No
 * files matching the pattern" for every one of them — and even when a file
 * argument happens to resolve (an absolute path), eslint's own flat-config
 * search re-anchors off the same wrong cwd and can pick up the repo-root
 * config instead of the project's. Invoking the binary directly keeps the
 * real cwd we set and avoids both failure modes, for every project — this
 * is why LS-9869's `usesRootRelativeLintExecutor` special-casing (routing
 * apps/web-e2e, apps/app, apps/app-e2e, lambdas/websocket, lib/scheduling,
 * and lib/ui-abstractions through a different cwd/path convention based on
 * their `project.json` lint executor) was removed here rather than kept
 * alongside this fix: that executor field only matters when Nx itself
 * dispatches the `lint` *target* (`nx run <project>:lint`), which this
 * script never does — it always drives the `eslint` CLI directly, so the
 * executor a project's real lint target happens to use has no bearing on
 * how this script's own eslint invocation resolves files or config.
 * Verified directly: cwd=configDir + config-relative paths, invoked via the
 * resolved eslint binary, autofixes a real violation correctly in all six
 * of LS-9869's "root-relative" projects, not just the ones that also lacked
 * a package.json.
 */

const { execFileSync } = require('child_process');
const { existsSync } = require('fs');
const { dirname, extname, join, relative, resolve } = require('path');

// The eslint bin is a `.cmd` shim on Windows. Since Node's CVE-2024-27980
// fix (backported to 18.19.1/20.11.1/21.6.2+; this repo runs Node 22),
// spawning a `.cmd`/`.bat` file WITHOUT `shell: true` throws EINVAL
// regardless of the explicit extension — the extension alone no longer
// avoids the shell requirement it used to. So `shell: true` is required
// on Windows here, with args escaped against cmd.exe metacharacters
// (same pattern as escapeCmdShellArg() / runCommand() in
// tools/mcp/nx-server/src/{cmd-escape,run-command}.ts) since `shell: true`
// joins argv into a single string that cmd.exe re-parses.
const ESLINT_BIN_NAME = process.platform === 'win32' ? 'eslint.cmd' : 'eslint';
const NEEDS_SHELL = process.platform === 'win32';

/** Escape cmd.exe shell metacharacters in a single argument (Windows-only). */
function escapeCmdShellArg(arg) {
  return /[|<>()\s]/.test(arg) ? `"${arg}"` : arg;
}

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
  const eslintBin = resolve(root, 'node_modules', '.bin', ESLINT_BIN_NAME);
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

  let hadUnexpectedFailure = false;

  for (const [configDir, relFiles] of byConfigDir) {
    const label = relative(root, configDir) || '.';
    process.stdout.write(
      `  Fixing ${relFiles.length} file(s) in ${label}...\n`,
    );
    try {
      const args = [
        '--fix',
        '--fix-type=problem,suggestion,layout',
        ...relFiles,
      ];
      execFileSync(
        eslintBin,
        NEEDS_SHELL ? args.map(escapeCmdShellArg) : args,
        { cwd: configDir, stdio: 'inherit', shell: NEEDS_SHELL },
      );
    } catch (error) {
      // eslint --fix exits 1 when unfixable violations remain — expected.
      // The unscoped `nx affected -t lint` check that follows in the Makefile
      // reports those; this pass's only job is to apply what it safely can.
      //
      // Anything else (exit 2 — a config/glob error like the LS-9899 "No
      // files matching the pattern" bug; a spawn failure; a signal) means
      // eslint never actually ran the autofix for this group. Surface it
      // instead of silently no-op'ing, and fail the script so pc-lint
      // notices instead of reporting a false-clean autofix pass.
      if (error.status !== 1) {
        hadUnexpectedFailure = true;
        process.stderr.write(
          `  eslint --fix failed to run in ${label} (status: ${error.status ?? error.code ?? 'unknown'}) — autofix was skipped for these files.\n`,
        );
      }
    }
  }

  if (hadUnexpectedFailure) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { resolveConfigDir, groupByConfigDir, getChangedFiles };
