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
 *   1  One or more migration files are not yet applied, or an error occurred
 */

'use strict';

const { Client } = require('pg');
const { readdirSync } = require('fs');
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

  const client = new Client({
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
  });

  try {
    console.log(`🔌 Connecting to ${host}:${port}/${database} as ${user}...`);
    await client.connect();
    console.log('✅ Connected');

    // Query applied migrations
    const result = await client.query(
      'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at ASC',
    );
    const appliedHashes = new Set(result.rows.map((r) => r.hash));

    // Compare against migration files on disk
    const migrationFiles = getMigrationFilenames();
    const missing = migrationFiles.filter((f) => !appliedHashes.has(f));
    const extra = [...appliedHashes].filter((h) => !migrationFiles.includes(h));

    console.log(
      `\n📊 Migration summary: ${appliedHashes.size} applied in DB, ${migrationFiles.length} files on disk`,
    );

    if (extra.length > 0) {
      console.warn(
        `\n⚠️  ${extra.length} hash(es) in DB not found on disk (may be from another branch):`,
      );
      extra.forEach((h) => console.warn(`   • ${h}`));
    }

    if (missing.length > 0) {
      console.error(
        `\n❌ ${missing.length} migration file(s) have NOT been applied:`,
      );
      missing.forEach((f) => console.error(`   • ${f}`));
      console.error(
        '\nRun `pnpm exec nx run db:migrate` to apply pending migrations.',
      );
      process.exit(1);
    }

    console.log('\n✅ All migration files are applied to the database.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error checking migration state:', err.message ?? err);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
