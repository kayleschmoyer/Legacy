#!/usr/bin/env node
/**
 * Check Migration Applied State
 *
 * Connects to the database as the read-only ci_readonly role and verifies that
 * every migration file in lib/db-client/migrations/ has been applied.
 *
 * Usage (in CI – credentials are resolved from Secrets Manager):
 *   node scripts/check-migrations-applied.js
 *
 * Environment variables (all provided automatically by the CI workflow):
 *   CI_READONLY_DB_HOST       RDS endpoint
 *   CI_READONLY_DB_PORT       PostgreSQL port (default 5432)
 *   CI_READONLY_DB_USER       PostgreSQL username (ci_readonly)
 *   CI_READONLY_DB_PASSWORD   Password for ci_readonly
 *   CI_READONLY_DB_NAME       Database name (default postgres)
 *   CI_READONLY_DB_SSL        Set to "true" to require SSL (default true)
 *   DB_SSL_SELF_SIGNED        Set to "true" to disable SSL cert validation
 *                             (rejectUnauthorized: false) — last-resort escape
 *                             hatch for legacy RDS certificate chains only
 *
 * Exit codes:
 *   0  All migration files are applied
 *   1  One or more migration files are not yet applied, or the check could
 *      not determine migration state (connect/auth/timeout/other error)
 *
 * Failure classification (LS-9599):
 *   A non-zero exit does NOT always mean "unapplied migrations". A connect,
 *   auth, or timeout failure means the script never reached the database and
 *   has no basis for any claim about migration state — it is an infra
 *   failure, not a migration failure. `migration_status` is written to
 *   $GITHUB_OUTPUT (when set) so the CI workflow's sticky-comment renderer
 *   can tell the two apart instead of labeling every failure "unapplied
 *   migrations" (see .github/workflows/check-migrations-applied.yml).
 */

'use strict';

const { Client } = require('pg');
const { readdirSync, appendFileSync } = require('fs');
const { join } = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse migration filename → { timestamp, name } or null if not a migration */
function parseMigrationFilename(filename) {
  const match = /^(\d{8}_\d{6})_(.+)\.ts$/.exec(filename);
  if (!match) return null;
  return { timestamp: match[1], name: match[2], filename };
}

/** Return all migration filenames sorted by timestamp */
function getMigrationFilenames() {
  const dir = join(__dirname, '..', 'lib', 'db-client', 'migrations');
  return readdirSync(dir)
    .filter(
      (f) =>
        f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.endsWith('.spec.ts'),
    )
    .filter((f) => parseMigrationFilename(f) !== null)
    .sort();
}

/**
 * Compare applied hashes (from drizzle.__drizzle_migrations) against the
 * migration files on disk.
 *
 * @param {object} p
 * @param {Set<string>|string[]} p.appliedHashes
 * @param {string[]} p.migrationFiles
 * @returns {{ missing: string[], extra: string[] }}
 */
function diffMigrations({ appliedHashes, migrationFiles }) {
  const applied =
    appliedHashes instanceof Set ? appliedHashes : new Set(appliedHashes);
  const missing = migrationFiles.filter((f) => !applied.has(f));
  const extra = [...applied].filter((h) => !migrationFiles.includes(h));
  return { missing, extra };
}

/**
 * A connect/auth/timeout error means we never reached the database (or never
 * got a usable connection) and so have no basis for any claim about
 * migration state — it must never be reported as "unapplied migrations".
 *
 * @param {Error|unknown} err
 * @returns {boolean}
 */
function isInfraError(err) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  const msg = String((err && err.message) ?? err ?? '');

  const INFRA_CODES = new Set([
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'EAI_AGAIN',
    // PostgreSQL auth failure SQLSTATE codes.
    '28P01', // invalid_password
    '28000', // invalid_authorization_specification
  ]);
  if (code && INFRA_CODES.has(code)) return true;

  return /timeout expired|connection terminated|connect(?:ion)? timeout|password authentication failed|could not connect|getaddrinfo|server closed the connection/i.test(
    msg,
  );
}

/**
 * Classify the outcome of a check attempt for the sticky-comment renderer.
 *
 * @param {object} p
 * @param {Error|unknown} [p.err]  the caught error, if the check threw
 * @param {string[]} [p.missing]  missing migration filenames, if the check
 *   connected and compared successfully
 * @returns {{ status: 'ok'|'pending'|'infra'|'error', missing?: string[], message?: string }}
 */
function classifyOutcome({ err, missing }) {
  if (err) {
    const message = String((err && err.message) ?? err);
    return { status: isInfraError(err) ? 'infra' : 'error', message };
  }
  if (missing && missing.length > 0) return { status: 'pending', missing };
  return { status: 'ok' };
}

/**
 * Connect with a bounded number of attempts, retrying only on infra-shaped
 * errors (a 10s connect timeout against a cold self-hosted runner is a thin
 * budget — see LS-9599). Each attempt uses a fresh Client; a Client that has
 * already failed to connect cannot be reused.
 *
 * @param {object} clientConfig  passed to `new Client(...)`
 * @param {object} [opts]
 * @param {number} [opts.retries=3]
 * @param {number} [opts.baseDelayMs=2000]
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 * @param {(config: object) => import('pg').Client} [opts.createClient]
 *   injectable for tests; defaults to `new Client(config)`
 * @returns {Promise<import('pg').Client>} a connected client
 */
async function connectWithRetry(
  clientConfig,
  { retries = 3, baseDelayMs = 2000, sleep, createClient } = {},
) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const makeClient = createClient || ((config) => new Client(config));
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const client = makeClient(clientConfig);
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastErr = err;
      await client.end().catch(() => {});
      if (attempt < retries && isInfraError(err)) {
        const delay = baseDelayMs * attempt;
        console.warn(
          `⚠️  Connect attempt ${attempt}/${retries} failed (${err.message ?? err}); retrying in ${delay}ms...`,
        );
        await wait(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** Write the classification to $GITHUB_OUTPUT, if set, for the CI workflow. */
function writeGithubOutput(outcome) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = [`migration_status=${outcome.status}`];
  if (outcome.status === 'pending') {
    lines.push(`pending_count=${outcome.missing.length}`);
    lines.push(`pending_migrations=${outcome.missing.join(',')}`);
  }
  if (outcome.message) {
    lines.push(`migration_error=${outcome.message.replace(/\r?\n/g, ' ')}`);
  }
  try {
    appendFileSync(outputPath, lines.join('\n') + '\n');
  } catch {
    // best effort — a failed output write should not mask the real result
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const host = process.env['CI_READONLY_DB_HOST'];
  const port = parseInt(process.env['CI_READONLY_DB_PORT'] ?? '5432', 10);
  const user = process.env['CI_READONLY_DB_USER'] ?? 'ci_readonly';
  const password = process.env['CI_READONLY_DB_PASSWORD'];
  const database = process.env['CI_READONLY_DB_NAME'] ?? 'postgres';
  const useSsl = (process.env['CI_READONLY_DB_SSL'] ?? 'true') !== 'false';

  if (!host) {
    console.error('❌ CI_READONLY_DB_HOST is not set');
    process.exit(1);
  }
  if (!password) {
    console.error('❌ CI_READONLY_DB_PASSWORD is not set');
    process.exit(1);
  }

  const clientConfig = {
    host,
    port,
    user,
    password,
    database,
    ssl: useSsl
      ? { rejectUnauthorized: process.env.DB_SSL_SELF_SIGNED !== 'true' }
      : false,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
  };

  let client;
  let outcome;

  try {
    console.log(`🔌 Connecting to ${host}:${port}/${database} as ${user}...`);
    client = await connectWithRetry(clientConfig);
    console.log('✅ Connected');

    // Query applied migrations
    const result = await client.query(
      'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at ASC',
    );
    const appliedHashes = new Set(result.rows.map((r) => r.hash));

    // Compare against migration files on disk
    const migrationFiles = getMigrationFilenames();
    const { missing, extra } = diffMigrations({
      appliedHashes,
      migrationFiles,
    });

    console.log(
      `\n📊 Migration summary: ${appliedHashes.size} applied in DB, ${migrationFiles.length} files on disk`,
    );

    if (extra.length > 0) {
      console.warn(
        `\n⚠️  ${extra.length} hash(es) in DB not found on disk (may be from another branch):`,
      );
      extra.forEach((h) => console.warn(`   • ${h}`));
    }

    outcome = classifyOutcome({ missing });

    if (outcome.status === 'pending') {
      console.error(
        `\n❌ ${missing.length} migration file(s) have NOT been applied:`,
      );
      missing.forEach((f) => console.error(`   • ${f}`));
      console.error(
        '\nRun `pnpm exec nx run db:migrate` to apply pending migrations.',
      );
    } else {
      console.log('\n✅ All migration files are applied to the database.');
    }
  } catch (err) {
    outcome = classifyOutcome({ err });
    if (outcome.status === 'infra') {
      console.error(
        '❌ Could not determine migration state — connection failure:',
        outcome.message,
      );
      console.error(
        'This is an infrastructure issue (connect/auth/timeout), not evidence of unapplied migrations. Re-run; check RDS reachability from the runner.',
      );
    } else {
      console.error('❌ Error checking migration state:', outcome.message);
    }
  } finally {
    if (client) await client.end().catch(() => {});
  }

  writeGithubOutput(outcome);
  process.exit(outcome.status === 'ok' ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseMigrationFilename,
  getMigrationFilenames,
  diffMigrations,
  isInfraError,
  classifyOutcome,
  connectWithRetry,
};
