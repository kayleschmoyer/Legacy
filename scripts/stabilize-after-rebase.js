#!/usr/bin/env node
// Post-rebase stabilization: runs the 4-step sequence to catch invisible
// breakages after rebase (type compat, schema alignment, lockfile integrity).
//
// Steps:
//   1. Detect node_modules mode (symlink vs independent) → skip/run install
//   2. Regenerate schema (pnpm exec nx run db:print-schema)
//   3. Run codegen (pnpm exec nx affected -t codegen)
//   4. Run make pc
//
// Usage:
//   node scripts/stabilize-after-rebase.js               # run all steps
//   node scripts/stabilize-after-rebase.js --dry-run      # show what would run
//   node scripts/stabilize-after-rebase.js --json          # JSON output
//
// Exit codes: 0 = all passed, 1 = failures detected

const { execSync, execFileSync } = require('child_process');
const { existsSync, lstatSync } = require('fs');
const { resolve, join } = require('path');

const root = resolve(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const jsonMode = args.includes('--json');

const steps = [];

function log(msg) {
  if (!jsonMode) console.log(msg);
}

function runStep(name, command, opts = {}) {
  const step = { name, command, status: 'pending', output: '' };

  if (dryRun) {
    step.status = 'dry-run';
    log(`  [DRY-RUN] ${name}: ${command}`);
    steps.push(step);
    return true;
  }

  log(`  [->] ${name}...`);
  try {
    const output = execSync(command, {
      cwd: opts.cwd || root,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: opts.timeout || 300000, // 5 min default
    });
    step.status = 'ok';
    step.output = output.slice(-500); // keep last 500 chars
    log(`  [OK] ${name}`);
    steps.push(step);
    return true;
  } catch (e) {
    step.status = 'fail';
    step.output = (e.stderr || e.stdout || e.message || '').slice(-1000);
    log(`  [FAIL] ${name}`);
    if (!jsonMode) {
      console.error(`    ${step.output.split('\n').slice(-5).join('\n    ')}`);
    }
    steps.push(step);
    return false;
  }
}

// --- Main ---
log('🔧 Post-rebase stabilization\n');

// Step 1: Detect node_modules mode and maybe install
const nmPath = join(root, 'node_modules');
let nmMode = 'missing';
if (existsSync(nmPath)) {
  try {
    const stat = lstatSync(nmPath);
    nmMode = stat.isSymbolicLink() ? 'symlink' : 'independent';
  } catch {
    nmMode = 'error';
  }
}

log(`  node_modules: ${nmMode}`);

if (nmMode === 'independent') {
  runStep('Install dependencies', 'make install', {
    timeout: 120000,
  });
} else if (nmMode === 'missing') {
  log('  [WARN] node_modules missing — running make install');
  runStep('Install dependencies', 'make install', { timeout: 120000 });
} else if (nmMode === 'symlink') {
  steps.push({
    name: 'Install dependencies',
    command: 'skipped (symlink)',
    status: 'skipped',
  });
  log('  [SKIP] node_modules is symlinked — using shared install');
} else {
  steps.push({
    name: 'Install dependencies',
    command: 'skipped (error)',
    status: 'skipped',
  });
  log('  [WARN] Could not determine node_modules mode');
}

// Step 2: Schema generation
// Use merge-base to match the diff range used by classify-changes.js and make pc
const hasDbChanges = (() => {
  try {
    const mergeBase = execFileSync(
      'git',
      ['merge-base', 'origin/main', 'HEAD'],
      { cwd: root, encoding: 'utf8' },
    ).trim();
    const output = execFileSync(
      'git',
      ['diff', '--name-only', `${mergeBase}..HEAD`],
      { cwd: root, encoding: 'utf8' },
    );
    return output.includes('lambdas/db/') || output.includes('lib/db-client/');
  } catch {
    return true; // assume yes on error
  }
})();

if (hasDbChanges) {
  runStep('Schema generation', 'pnpm exec nx run db:print-schema', {
    timeout: 60000,
  });
} else {
  steps.push({
    name: 'Schema generation',
    command: 'skipped (no DB changes)',
    status: 'skipped',
  });
  log('  [SKIP] No DB changes — skipping schema generation');
}

// Step 3: Codegen
if (hasDbChanges) {
  runStep(
    'Code generation',
    'pnpm exec nx affected -t codegen --base=origin/main',
    { timeout: 120000 },
  );
} else {
  steps.push({
    name: 'Code generation',
    command: 'skipped (no DB changes)',
    status: 'skipped',
  });
  log('  [SKIP] No DB changes — skipping codegen');
}

// Step 4: Pre-commit checks
runStep('Pre-commit checks', 'make pc', { timeout: 600000 });

// --- Output ---
if (jsonMode) {
  const summary = {
    steps,
    nodeModulesMode: nmMode,
    hasDbChanges,
    allPassed: steps.every(
      (s) =>
        s.status === 'ok' || s.status === 'skipped' || s.status === 'dry-run',
    ),
    pcPassed:
      steps.find((s) => s.name === 'Pre-commit checks')?.status === 'ok',
  };
  console.log(JSON.stringify(summary, null, 2));
} else {
  log('\n📋 Summary:');
  for (const s of steps) {
    const icon =
      s.status === 'ok'
        ? '✅'
        : s.status === 'skipped'
          ? '⏭️'
          : s.status === 'fail'
            ? '❌'
            : '🔍';
    log(`  ${icon} ${s.name}: ${s.status}`);
  }

  const allPassed = steps.every(
    (s) =>
      s.status === 'ok' || s.status === 'skipped' || s.status === 'dry-run',
  );
  if (allPassed) {
    log('\n🎉 Stabilization complete — safe to push!');
  } else {
    log('\n⚠️  Fix failures above, commit, and re-run.');
  }
}

const hasFails = steps.some((s) => s.status === 'fail');
process.exit(hasFails ? 1 : 0);
