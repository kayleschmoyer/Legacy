#!/usr/bin/env node
/**
 * Migration Immutability Check
 *
 * Prevents modification or deletion of migration files that have already been
 * merged into main. Migrations are append-only to protect database integrity
 * in production environments.
 *
 * Usage:
 *   node scripts/check-migration-immutability.js           # staged files only (git hook)
 *   node scripts/check-migration-immutability.js --branch  # branch vs origin/main (make pc / CI)
 */

const { execSync } = require('child_process');

const MIGRATIONS_DIR = 'lib/db-client/migrations';
const BRANCH_MODE = process.argv.includes('--branch');

/**
 * Run a git command and return trimmed stdout.
 * Returns an empty string on failure rather than throwing.
 */
function git(cmd) {
  try {
    return execSync(`git ${cmd}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * In branch mode: list migration files that were Modified (M) or Deleted (D)
 * between origin/main and HEAD. Newly added migrations (A) are allowed.
 *
 * In staged mode (git hook): list migration files staged as Modified (M) or
 * Deleted (D). Newly staged additions are allowed.
 */
function getViolatingFiles() {
  if (BRANCH_MODE) {
    // Ensure we have origin/main to compare against
    const baseRef = git('rev-parse --verify origin/main')
      ? 'origin/main'
      : 'main';
    const output = git(
      `diff --name-only --diff-filter=MD ${baseRef}...HEAD -- ${MIGRATIONS_DIR}`,
    );
    return output ? output.split('\n').filter(Boolean) : [];
  } else {
    // Pre-commit hook: inspect the index (staged changes only)
    const output = git(
      `diff --cached --name-only --diff-filter=MD -- ${MIGRATIONS_DIR}`,
    );
    return output ? output.split('\n').filter(Boolean) : [];
  }
}

function main() {
  const mode = BRANCH_MODE ? 'branch vs origin/main' : 'staged files';
  console.log(`🔒 Checking migration immutability (${mode})...\n`);

  const violations = getViolatingFiles();

  if (violations.length === 0) {
    console.log('✅ Migration immutability check passed!\n');
    process.exit(0);
  }

  console.error('❌ MIGRATION IMMUTABILITY VIOLATION\n');
  console.error(
    'The following migration file(s) already exist in main and must NOT be modified or deleted:\n',
  );
  violations.forEach((file) => console.error(`  • ${file}`));
  console.error(
    '\nMigrations are append-only to preserve database integrity across all environments.',
  );
  console.error(
    'To change a previously applied schema, create a NEW migration file instead.\n',
  );
  console.error('See: .agents/skills/db-migration-write/SKILL.md\n');
  process.exit(1);
}

main();
