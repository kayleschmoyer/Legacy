#!/usr/bin/env node
/**
 * Run a node:test suite (whole or one file) with compact, head-first output
 * (LS-10358). Backs `make test-github-scripts` / `make test-root-scripts`.
 *
 * Usage: node scripts/run-node-tests.mjs <github|root> [FILE]
 *
 * - `github` → .github/scripts/**\/__tests__/*.test.mjs
 * - `root`   → scripts/__tests__/*.test.mjs
 * - FILE, when given, must be a repo-relative path to a *.test.mjs file under
 *   that suite's allowed directory; anything else (shell metacharacters, `..`,
 *   absolute paths, other directories) is refused.
 *
 * Globs are expanded here rather than by `node --test` so the suites also run
 * on Node 20, which does not expand glob arguments. Output is the TAP summary
 * counts plus every `not ok` line, so failures are never lost to tail-only
 * truncation.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const SUITES = {
  github: { root: '.github/scripts', nested: true },
  root: { root: 'scripts', nested: false },
};

const SAFE_PATH = /^[A-Za-z0-9_./-]+$/;

/** Return a refusal reason for `file`, or null when it is allowed. */
export function validateFile(suite, file) {
  const cfg = SUITES[suite];
  if (!cfg) return `unknown suite "${suite}" (expected github or root)`;
  if (!SAFE_PATH.test(file)) {
    return `FILE "${file}" contains characters outside [A-Za-z0-9_./-]`;
  }
  if (file.split('/').includes('..') || file.startsWith('/')) {
    return `FILE "${file}" must be a repo-relative path without ".."`;
  }
  if (!file.endsWith('.test.mjs'))
    return `FILE "${file}" must end in .test.mjs`;
  const parts = file.split('/');
  const underRoot = file.startsWith(`${cfg.root}/`);
  const inTests = parts[parts.length - 2] === '__tests__';
  const depthOk = cfg.nested || parts.length === cfg.root.split('/').length + 2;
  if (!underRoot || !inTests || !depthOk) {
    return `FILE "${file}" must live under ${cfg.root}/${cfg.nested ? '**/' : ''}__tests__/`;
  }
  return null;
}

function collect(dir, nested, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      if (entry.name === '__tests__') {
        for (const f of readdirSync(full)) {
          if (f.endsWith('.test.mjs')) out.push(path.join(full, f));
        }
      } else if (nested) {
        collect(full, nested, out);
      }
    }
  }
  return out;
}

/** Pick the lines worth showing from TAP output: failures, then summary. */
export function summarizeTap(tap) {
  const lines = tap.split('\n');
  const failures = lines.filter((l) => /^\s*not ok\b/.test(l));
  const summary = lines.filter((l) =>
    /^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(l),
  );
  return { failures, summary };
}

function main(argv) {
  const [suite, file] = argv;
  const cfg = SUITES[suite];
  if (!cfg) {
    process.stderr.write(`Usage: run-node-tests.mjs <github|root> [FILE]\n`);
    return 2;
  }
  let files;
  if (file) {
    const reason = validateFile(suite, file);
    if (reason) {
      process.stderr.write(`Refused: ${reason}\n`);
      return 2;
    }
    const abs = path.join(REPO_ROOT, file);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      process.stderr.write(`Refused: FILE "${file}" does not exist\n`);
      return 2;
    }
    files = [abs];
  } else {
    files = collect(path.join(REPO_ROOT, cfg.root), cfg.nested, []).sort();
    if (files.length === 0) {
      process.stderr.write(`No test files found under ${cfg.root}\n`);
      return 2;
    }
  }

  // Drop NODE_TEST_CONTEXT so this also works when launched from inside a
  // running node:test process (the child would otherwise emit no TAP).
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const res = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=tap', ...files],
    { cwd: REPO_ROOT, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  const { failures, summary } = summarizeTap(res.stdout ?? '');
  if (failures.length > 0) {
    process.stdout.write(
      `FAILED TESTS (${failures.length}):\n${failures.join('\n')}\n\n`,
    );
  }
  process.stdout.write(`${summary.join('\n')}\n`);
  if (res.status !== 0 && failures.length === 0) {
    process.stdout.write(`${(res.stderr ?? '').slice(0, 4000)}\n`);
  }
  return res.status ?? 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(main(process.argv.slice(2)));
}
