#!/usr/bin/env node
/**
 * Classify changed files for make pc optimization.
 *
 * Compares the current branch (committed history plus uncommitted working-tree
 * changes and untracked files, LS-10202) against a base ref (default: origin/main) and outputs
 * Make-compatible variable assignments that the pre-commit target uses to skip
 * irrelevant steps.
 *
 * Usage: node scripts/classify-changes.js [--print-summary] [--base <ref>]
 *
 * Output (stdout): space-separated KEY=VALUE pairs, e.g.:
 *   PC_HAS_DB=1 PC_HAS_WORKFLOWS=0 PC_HAS_GH_SCRIPTS=0 PC_HAS_PS1=0 PC_HAS_ROOT_SCRIPTS=0 PC_DOCS_ONLY=0
 *
 * Flags:
 *   PC_HAS_DB          — files in lib/db-client/ or lambdas/db/. Gates only the
 *                         migration immutability check (pc step 1) — schema
 *                         generation and codegen (steps 2-3) always run
 *                         regardless of this flag (LS-9276), so generated-file
 *                         staleness is caught independent of what the current
 *                         branch's diff touches.
 *   PC_HAS_WORKFLOWS   — files in .github/workflows/ or .github/actions/ (LS-10351:
 *                         validate-workflows.js also validates composite actions)
 *   PC_HAS_GH_SCRIPTS  — files in .github/scripts/ (LS-9964)
 *   PC_HAS_PS1         — files matching scripts/**\/*.ps1 (LS-8729)
 *   PC_HAS_ROOT_SCRIPTS — files in scripts/ (LS-10178). scripts/ has no nx
 *                         project.json either, so `nx affected -t test` is
 *                         just as blind to scripts/__tests__/*.test.mjs as it
 *                         is to .github/scripts/'s suites.
 *   PC_DOCS_ONLY       — ALL changed files are docs (.md, .agents/skills/, docs/)
 *
 * Fail-safe: if git fails or no changes (committed or not) are detected, all flags default to
 * "run everything" so nothing is accidentally skipped.
 */

const { execFileSync } = require('child_process');

function parseBaseRef(argv) {
  const idx = argv.indexOf('--base');
  if (idx !== -1 && idx + 1 < argv.length) {
    return argv[idx + 1];
  }
  return 'origin/main';
}

// LS-8718: a cached `origin/main` ref can be stale-but-still-an-ancestor of
// HEAD, which lets `git merge-base` resolve successfully against the wrong
// (older) commit instead of failing outright like the no-merge-base case
// LS-3041 handled. Refresh the remote-tracking ref before diffing so the
// classification reflects current origin/main. Best-effort: if the fetch
// fails (offline, no network), fall back to whatever ref is already cached
// rather than erroring out.
function refreshBaseRef(baseRef) {
  const match = /^origin\/(.+)$/.exec(baseRef);
  if (!match) {
    return;
  }
  try {
    execFileSync('git', ['fetch', 'origin', match[1], '--quiet'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    });
  } catch {
    // Offline or fetch failed — proceed with the existing cached ref.
  }
}

function classify(baseRef) {
  refreshBaseRef(baseRef);
  const FAIL_SAFE = {
    hasDb: true,
    hasWorkflows: true,
    hasGithubScripts: true,
    hasPs1: true,
    hasRootScripts: true,
    docsOnly: false,
    reason: null,
  };

  let files;
  try {
    // LS-10202: classify committed history (<base>...HEAD) plus the working
    // tree (staged + unstaged tracked changes vs HEAD, and untracked files),
    // so validating before the first commit doesn't look like "no changes".
    const gitLines = (args) =>
      execFileSync('git', args, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    files = [
      ...new Set([
        ...gitLines(['diff', '--name-only', `${baseRef}...HEAD`]),
        ...gitLines(['diff', '--name-only', 'HEAD']),
        ...gitLines(['ls-files', '--others', '--exclude-standard']),
      ]),
    ];

    if (files.length === 0) {
      // Nothing committed, staged, modified, or untracked — run everything (fail-safe)
      return { ...FAIL_SAFE, reason: 'no-changes' };
    }
  } catch {
    // git failed — run everything (fail-safe)
    return { ...FAIL_SAFE, reason: 'git-diff-failed' };
  }

  let hasDb = false;
  let hasWorkflows = false;
  let hasGithubScripts = false;
  let hasPs1 = false;
  let hasRootScripts = false;
  let allDocs = true;

  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');

    // Database changes
    if (
      normalized.startsWith('lib/db-client/') ||
      normalized.startsWith('lambdas/db/')
    ) {
      hasDb = true;
    }

    // Workflow changes
    if (
      normalized.startsWith('.github/workflows/') ||
      normalized.startsWith('.github/actions/')
    ) {
      hasWorkflows = true;
    }

    // GitHub automation script changes (LS-9964) — .github/scripts/ has no nx
    // project.json, so `nx affected -t test` can never reach its unit suites.
    // Flag it so pc-workflows can run them directly via `node --test`.
    if (normalized.startsWith('.github/scripts/')) {
      hasGithubScripts = true;
    }

    // PowerShell script changes (LS-8729) — scripts/*.ps1 and scripts/**/*.ps1
    if (normalized.startsWith('scripts/') && /\.ps1$/i.test(normalized)) {
      hasPs1 = true;
    }

    // Root script changes (LS-10178) — scripts/ has no nx project.json, so
    // `nx affected -t test` can never reach scripts/__tests__/*.test.mjs.
    // Flag it so pc-test can run that suite directly.
    if (normalized.startsWith('scripts/')) {
      hasRootScripts = true;
    }

    // Docs-only detection: file must be in a docs area OR be a markdown file
    const isDocsArea =
      normalized.startsWith('docs/') ||
      normalized.startsWith('.agents/skills/');
    const isDocFile = /\.md$/i.test(normalized) || isDocsArea;
    if (!isDocFile) {
      allDocs = false;
    }
  }

  // If we have code changes (non-doc), it's definitely not docs-only.
  // DB and workflow changes in non-doc files already set allDocs = false
  // via the loop above, so no extra override is needed here.

  return {
    hasDb,
    hasWorkflows,
    hasGithubScripts,
    hasPs1,
    hasRootScripts,
    docsOnly: allDocs,
    reason: null,
  };
}

function main() {
  const baseRef = parseBaseRef(process.argv);
  const result = classify(baseRef);
  const flags = {
    PC_HAS_DB: result.hasDb ? '1' : '0',
    PC_HAS_WORKFLOWS: result.hasWorkflows ? '1' : '0',
    PC_HAS_GH_SCRIPTS: result.hasGithubScripts ? '1' : '0',
    PC_HAS_PS1: result.hasPs1 ? '1' : '0',
    PC_HAS_ROOT_SCRIPTS: result.hasRootScripts ? '1' : '0',
    PC_DOCS_ONLY: result.docsOnly ? '1' : '0',
  };

  const printSummary = process.argv.includes('--print-summary');

  if (printSummary) {
    // Human-readable output for the recipe log
    if (result.reason === 'no-changes') {
      process.stdout.write(
        '  No changes detected vs base — running all steps (fail-safe)\n',
      );
    } else if (result.reason === 'git-diff-failed') {
      process.stdout.write(
        '  git diff failed — running all steps (fail-safe)\n',
      );
    } else {
      const skips = [];
      if (flags.PC_DOCS_ONLY === '1') {
        skips.push(
          'docs-only changes detected — skipping typecheck, lint, test, build',
        );
      }
      if (flags.PC_HAS_DB === '0') {
        skips.push(
          // LS-9276: schema gen + codegen always run regardless of PC_HAS_DB
          // (they verify freshness independent of what the branch touches) —
          // only the migration immutability check is actually skipped here.
          'no db changes — skipping migration immutability check',
        );
      }
      if (flags.PC_HAS_WORKFLOWS === '0') {
        skips.push('no workflow changes — skipping workflow validation');
      }
      if (flags.PC_HAS_GH_SCRIPTS === '0') {
        skips.push(
          'no .github/scripts changes — skipping GitHub script unit tests',
        );
      }
      if (flags.PC_HAS_PS1 === '0') {
        skips.push(
          'no scripts/*.ps1 changes — skipping PowerShell script tests',
        );
      }
      if (flags.PC_HAS_ROOT_SCRIPTS === '0') {
        skips.push('no scripts/ changes — skipping root script unit tests');
      }
      if (skips.length === 0) {
        process.stdout.write(
          '  All change types detected — running all steps\n',
        );
      } else {
        for (const skip of skips) {
          process.stdout.write(`  ${skip}\n`);
        }
      }
    }
  } else {
    // Machine-readable output for Make $(shell) evaluation
    const output = Object.entries(flags)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    process.stdout.write(output);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseBaseRef, refreshBaseRef, classify };
