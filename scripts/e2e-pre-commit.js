#!/usr/bin/env node
// E2E pre-commit validator: detects changed E2E files and determines the
// minimum test scope needed. Returns the appropriate Playwright command.
//
// Usage:
//   node scripts/e2e-pre-commit.js              # human-readable
//   node scripts/e2e-pre-commit.js --json        # JSON for agents
//   node scripts/e2e-pre-commit.js --run          # run the tests directly
//
// Exit codes: 0 = no E2E changes or suggested-only (non-blocking),
//             1 = targeted or critical E2E changes (action needed)

const { execFileSync, execSync } = require('child_process');
const { resolve } = require('path');

const root = resolve(__dirname, '..');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const runMode = args.includes('--run');
const base = (
  args.find((a) => a.startsWith('--base=')) || '--base=origin/main'
).split('=')[1];

function getChangedFiles() {
  try {
    const output = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`],
      { cwd: root, encoding: 'utf8' },
    );
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function classifyE2EChanges(files) {
  const e2eTestFiles = [];
  const e2eFixtureFiles = [];
  const e2eHelperFiles = [];
  const appSourceFiles = [];

  for (const f of files) {
    if (f.includes('e2e/') && f.endsWith('.spec.ts')) {
      e2eTestFiles.push(f);
    } else if (
      f.includes('e2e/') &&
      (f.includes('fixture') || f.includes('mock'))
    ) {
      e2eFixtureFiles.push(f);
    } else if (
      f.includes('e2e/') &&
      (f.includes('helper') || f.includes('util') || f.includes('setup'))
    ) {
      e2eHelperFiles.push(f);
    } else if (f.startsWith('apps/web/src/')) {
      appSourceFiles.push(f);
    }
  }

  return { e2eTestFiles, e2eFixtureFiles, e2eHelperFiles, appSourceFiles };
}

function determineScope(changes) {
  const { e2eTestFiles, e2eFixtureFiles, e2eHelperFiles, appSourceFiles } =
    changes;
  const hasE2EChanges =
    e2eTestFiles.length > 0 ||
    e2eFixtureFiles.length > 0 ||
    e2eHelperFiles.length > 0;

  if (!hasE2EChanges && appSourceFiles.length === 0) {
    return {
      scope: 'none',
      reason: 'No E2E or app source changes',
      command: null,
    };
  }

  // If only specific test files changed, run just those
  if (
    e2eTestFiles.length > 0 &&
    e2eFixtureFiles.length === 0 &&
    e2eHelperFiles.length === 0
  ) {
    const specPaths = e2eTestFiles.join(' ');
    return {
      scope: 'targeted',
      reason: `${e2eTestFiles.length} test file(s) changed`,
      files: e2eTestFiles,
      command: `pnpm exec nx run web-e2e:e2e -- ${specPaths}`,
    };
  }

  // If fixtures/helpers changed, run critical suite
  if (e2eFixtureFiles.length > 0 || e2eHelperFiles.length > 0) {
    return {
      scope: 'critical',
      reason: 'Shared fixture/helper files changed — run @critical suite',
      files: [...e2eFixtureFiles, ...e2eHelperFiles],
      command: 'pnpm exec nx run web-e2e:e2e -- --grep @critical',
    };
  }

  // App source changes — suggest but don't require E2E
  if (appSourceFiles.length > 0) {
    return {
      scope: 'suggested',
      reason: `${appSourceFiles.length} app source file(s) changed — E2E run recommended`,
      files: appSourceFiles.slice(0, 10),
      command: 'pnpm exec nx run web-e2e:e2e -- --grep @critical',
    };
  }

  return { scope: 'none', reason: 'No relevant changes', command: null };
}

// --- Main ---
const changedFiles = getChangedFiles();
const changes = classifyE2EChanges(changedFiles);
const result = determineScope(changes);

if (jsonMode) {
  console.log(JSON.stringify({ ...result, changes }, null, 2));
} else {
  if (result.scope === 'none') {
    console.log('✓ No E2E-relevant changes detected');
  } else {
    const icon =
      result.scope === 'targeted'
        ? '🎯'
        : result.scope === 'critical'
          ? '🔴'
          : '💡';
    console.log(`${icon} E2E scope: ${result.scope}`);
    console.log(`   Reason: ${result.reason}`);
    if (result.command) {
      console.log(`   Command: ${result.command}`);
    }
    if (result.files) {
      console.log(`   Files:`);
      for (const f of result.files.slice(0, 5)) {
        console.log(`     - ${f}`);
      }
      if (result.files.length > 5) {
        console.log(`     ... and ${result.files.length - 5} more`);
      }
    }
  }
}

if (runMode && result.command) {
  console.log(`\nRunning: ${result.command}\n`);
  try {
    execSync(result.command, { cwd: root, stdio: 'inherit' });
  } catch (e) {
    process.exit(e.status || 1);
  }
}

process.exit(result.scope === 'none' || result.scope === 'suggested' ? 0 : 1);
