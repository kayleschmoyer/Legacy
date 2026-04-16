#!/usr/bin/env node
/**
 * Classify changed files for make pc optimization.
 *
 * Compares the current branch against a base ref (default: origin/main) and outputs
 * Make-compatible variable assignments that the pre-commit target uses to skip
 * irrelevant steps.
 *
 * Usage: node scripts/classify-changes.js [--print-summary] [--base <ref>]
 *
 * Output (stdout): space-separated KEY=VALUE pairs, e.g.:
 *   PC_HAS_DB=1 PC_HAS_WORKFLOWS=0 PC_DOCS_ONLY=0
 *
 * Flags:
 *   PC_HAS_DB        — files in lib/db-client/ or lambdas/db/
 *   PC_HAS_WORKFLOWS — files in .github/workflows/
 *   PC_DOCS_ONLY     — ALL changed files are docs (.md, .agents/skills/, docs/)
 *
 * Fail-safe: if git diff fails or no changes detected, all flags default to
 * "run everything" so nothing is accidentally skipped.
 */

const { execSync } = require('child_process');

function parseBaseRef(argv) {
  const idx = argv.indexOf('--base');
  if (idx !== -1 && idx + 1 < argv.length) {
    return argv[idx + 1];
  }
  return 'origin/main';
}

function classify(baseRef) {
  const FAIL_SAFE = {
    hasDb: true,
    hasWorkflows: true,
    docsOnly: false,
    reason: null,
  };

  let files;
  try {
    const output = execSync(`git diff --name-only ${baseRef}...HEAD`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!output) {
      // No changes detected — run everything (fail-safe)
      return { ...FAIL_SAFE, reason: 'no-changes' };
    }

    files = output.split('\n').filter(Boolean);
  } catch {
    // git diff failed — run everything (fail-safe)
    return { ...FAIL_SAFE, reason: 'git-diff-failed' };
  }

  let hasDb = false;
  let hasWorkflows = false;
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
    if (normalized.startsWith('.github/workflows/')) {
      hasWorkflows = true;
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

  return { hasDb, hasWorkflows, docsOnly: allDocs, reason: null };
}

const baseRef = parseBaseRef(process.argv);
const result = classify(baseRef);
const flags = {
  PC_HAS_DB: result.hasDb ? '1' : '0',
  PC_HAS_WORKFLOWS: result.hasWorkflows ? '1' : '0',
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
    process.stdout.write('  git diff failed — running all steps (fail-safe)\n');
  } else {
    const skips = [];
    if (flags.PC_DOCS_ONLY === '1') {
      skips.push(
        'docs-only changes detected — skipping typecheck, lint, test, build',
      );
    }
    if (flags.PC_HAS_DB === '0') {
      skips.push(
        'no db changes — skipping migration check, schema gen, codegen',
      );
    }
    if (flags.PC_HAS_WORKFLOWS === '0') {
      skips.push('no workflow changes — skipping workflow validation');
    }
    if (skips.length === 0) {
      process.stdout.write('  All change types detected — running all steps\n');
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
