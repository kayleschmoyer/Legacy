#!/usr/bin/env node
// Dev environment health check: validates all prerequisites before starting dev.
// Checks node_modules, .env files, Docker, database, migrations, and ports.
//
// Usage:
//   node scripts/dev-env-health-check.js          # human-readable output
//   node scripts/dev-env-health-check.js --json    # structured JSON for agents
//
// Exit codes: 0 = no critical failures, 1 = critical failures found

const { execFileSync, execSync } = require('child_process');
const { existsSync, lstatSync, readFileSync } = require('fs');
const { resolve, join, basename } = require('path');
const net = require('net');

const root = resolve(__dirname, '..');
const jsonMode = process.argv.includes('--json');

const checks = [];

function addCheck(name, status, detail) {
  checks.push({ name, status, detail });
}

// --- Check 1: node_modules ---
function checkNodeModules() {
  const nmPath = join(root, 'node_modules');
  if (!existsSync(nmPath)) {
    return addCheck('node_modules', 'fail', 'Missing. Run: make install');
  }
  try {
    const stat = lstatSync(nmPath);
    if (stat.isSymbolicLink()) {
      addCheck('node_modules', 'ok', 'Symlinked (worktree mode)');
    } else {
      addCheck('node_modules', 'ok', 'Independent install');
    }
  } catch {
    addCheck('node_modules', 'fail', 'Cannot stat node_modules');
  }
}

// --- Check 2: .env file ---
function checkEnvFile() {
  const envPath = join(root, '.env');
  const envLocalPath = join(root, '.env.local');
  if (!existsSync(envPath) && !existsSync(envLocalPath)) {
    return addCheck(
      'env-files',
      'fail',
      'No .env or .env.local found. Run: make sync-env or copy from main repo',
    );
  }

  // Check both files — .env.local overrides .env
  let hasDbUrl = false;
  let checkedFile = null;
  for (const fp of [envLocalPath, envPath]) {
    if (existsSync(fp)) {
      const content = readFileSync(fp, 'utf8');
      // Match uncommented DATABASE_URL= lines (ignore lines starting with #)
      if (/^\s*DATABASE_URL\s*=/m.test(content)) {
        hasDbUrl = true;
        checkedFile = fp;
        break;
      }
    }
  }

  if (!hasDbUrl) {
    return addCheck(
      'env-files',
      'warn',
      'DATABASE_URL not set in .env or .env.local (commented-out lines ignored)',
    );
  }

  addCheck('env-files', 'ok', `Found DATABASE_URL in ${basename(checkedFile)}`);
}

// --- Check 3: Docker ---
function checkDocker() {
  try {
    execFileSync('docker', ['info'], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch {
    return addCheck(
      'docker',
      'fail',
      'Docker is not running. Start Docker Desktop.',
    );
  }

  try {
    const output = execFileSync(
      'docker',
      ['compose', 'ps', '--format', 'json'],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' },
    );
    const hasPostgres = output.includes('postgres');
    if (hasPostgres) {
      addCheck('docker', 'ok', 'Docker running, postgres container found');
    } else {
      addCheck(
        'docker',
        'warn',
        'Docker running but no postgres container. Run: docker compose up -d postgres',
      );
    }
  } catch {
    addCheck('docker', 'warn', 'Docker running but could not check containers');
  }
}

// --- Check 4: Port availability ---
function checkPort(port, serviceName) {
  return new Promise((resolvePromise) => {
    const server = net.createServer();
    server.listen(port, '127.0.0.1');
    server.on('listening', () => {
      server.close();
      addCheck(
        `port-${port}`,
        'ok',
        `Port ${port} (${serviceName}) is available`,
      );
      resolvePromise();
    });
    server.on('error', () => {
      addCheck(
        `port-${port}`,
        'warn',
        `Port ${port} (${serviceName}) is in use. Run: make kill-stale`,
      );
      resolvePromise();
    });
  });
}

// --- Check 5: pnpm version ---
function checkPnpm() {
  try {
    const version = execFileSync('pnpm', ['--version'], {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
    if (version.startsWith('9.')) {
      addCheck('pnpm', 'ok', `pnpm ${version}`);
    } else {
      addCheck(
        'pnpm',
        'warn',
        `pnpm ${version} — expected 9.x. Run: corepack enable`,
      );
    }
  } catch {
    addCheck('pnpm', 'fail', 'pnpm not found. Run: corepack enable');
  }
}

// --- Check 6: Nx daemon ---
function checkNx() {
  try {
    execFileSync('pnpm', ['exec', 'nx', '--version'], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    addCheck('nx', 'ok', 'Nx CLI available');
  } catch {
    addCheck('nx', 'fail', 'Nx CLI not available. Run: pnpm install');
  }
}

// --- Check 7: Migration status ---
function checkMigrations() {
  try {
    const output = execSync('cd lib/db-client && pnpm run db:status 2>&1', {
      cwd: root,
      encoding: 'utf8',
      timeout: 15000,
      stdio: 'pipe',
    });
    // Success indicators vary by db tooling; check for explicit "up to date" / "no pending"
    const lowerOut = output.toLowerCase();
    if (
      lowerOut.includes('up to date') ||
      lowerOut.includes('no pending') ||
      lowerOut.includes('already applied')
    ) {
      addCheck('migrations', 'ok', 'All migrations applied');
    } else if (
      lowerOut.includes('needsmigration') ||
      lowerOut.includes('not applied')
    ) {
      addCheck(
        'migrations',
        'warn',
        'Pending migrations. Run: make db-migrate',
      );
    } else {
      addCheck(
        'migrations',
        'ok',
        'Migration status check completed (no pending indicators found)',
      );
    }
  } catch {
    addCheck(
      'migrations',
      'warn',
      'Could not check migration status (DB may be down)',
    );
  }
}

// --- Main ---
async function main() {
  checkNodeModules();
  checkEnvFile();
  checkPnpm();
  checkNx();
  checkDocker();
  await Promise.all([
    checkPort(3000, 'Next.js dev'),
    checkPort(4200, 'Nx serve'),
    checkPort(4280, 'E2E serve'),
    checkPort(5000, 'GraphQL API'),
    checkPort(5432, 'PostgreSQL'),
  ]);
  // Skip migration check if Docker/DB is down
  const dockerCheck = checks.find((c) => c.name === 'docker');
  if (dockerCheck && dockerCheck.status === 'ok') {
    checkMigrations();
  }

  if (jsonMode) {
    const summary = {
      checks,
      healthy: checks.filter((c) => c.status === 'ok').length,
      warnings: checks.filter((c) => c.status === 'warn').length,
      failures: checks.filter((c) => c.status === 'fail').length,
      allHealthy: checks.every((c) => c.status === 'ok'),
    };
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('🏥 Dev Environment Health Check\n');
    for (const c of checks) {
      const icon = c.status === 'ok' ? '✅' : c.status === 'warn' ? '⚠️' : '❌';
      console.log(`${icon} ${c.name}: ${c.detail}`);
    }
    const fails = checks.filter((c) => c.status === 'fail');
    const warns = checks.filter((c) => c.status === 'warn');
    console.log(
      `\n${fails.length === 0 && warns.length === 0 ? '🎉 All checks passed!' : `${fails.length} failure(s), ${warns.length} warning(s)`}`,
    );
  }

  const hasFails = checks.some((c) => c.status === 'fail');
  process.exit(hasFails ? 1 : 0);
}

main();
