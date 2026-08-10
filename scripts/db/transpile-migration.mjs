#!/usr/bin/env node
/**
 * scripts/db/transpile-migration.mjs
 *
 * Emits the exact `{ migrations: [{ name, hash, jsSource }] }` payload the
 * hosted `db_migrate` MCP tool (`mcp__legacy-sports-db-admin__db_migrate`)
 * expects, transpiled from local migration `.ts` files with esbuild (LS-9203).
 *
 * Before this script existed, callers had to hand-run
 * `pnpm exec esbuild <file> --format=cjs`, then hand-paste the output into the
 * tool call as `jsSource` — error-prone (stale output, mangled template-literal
 * SQL in JSON escaping). This script does the transpile and JSON assembly in
 * one step; pipe its stdout straight into the `migrations` argument of
 * `db_migrate`.
 *
 * Reimplements (rather than imports) the transpile step from
 * `tools/mcp/db-admin-server/src/client/migrate-client.ts` — that module is
 * TypeScript run via `tsx`/bundled for the Lambda, and this script needs to run
 * with plain `node` (the convention for everything under `scripts/`, see
 * AGENTS.md). Keep the esbuild options in sync with
 * `transpileMigrationSource` if either changes.
 *
 * Usage:
 *   node scripts/db/transpile-migration.mjs [<migration-file>...]
 *
 * With no arguments, transpiles every migration file in
 * `lib/db-client/migrations/` (db_migrate skips already-applied migrations
 * server-side, so sending the full set is safe). Pass one or more filenames
 * (bare basename or full path) to transpile only those.
 *
 * Output: pretty-printed JSON `{ "migrations": [...] }` on stdout, ordered by
 * filename (timestamp-prefixed, so lexical order is apply order).
 *
 * MIGRATIONS_DIR env var overrides the migrations directory (used by tests).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR =
  process.env['MIGRATIONS_DIR'] ??
  join(__dirname, '..', '..', 'lib', 'db-client', 'migrations');

/** Same migration-filename shape the hosted `db_migrate` tool validates against. */
const MIGRATION_FILE_RE = /^\d{8}_\d{6}_.+\.ts$/;

/** Transpile a single migration's TypeScript source to CommonJS JavaScript. */
export function transpileMigrationSource(tsSource) {
  const { code } = transformSync(tsSource, {
    loader: 'ts',
    format: 'cjs',
    platform: 'node',
    target: 'node20',
  });
  return code;
}

/** Resolve requested filenames (bare or full path) against MIGRATIONS_DIR. */
function resolveRequestedFiles(names) {
  return names.map((name) => {
    const file = basename(name);
    if (!MIGRATION_FILE_RE.test(file)) {
      throw new Error(
        `'${name}' is not a valid migration filename (expected YYYYMMDD_HHMMSS_name.ts).`,
      );
    }
    return file;
  });
}

/** All migration filenames in MIGRATIONS_DIR, sorted (timestamp order). */
function allMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => MIGRATION_FILE_RE.test(f))
    .sort();
}

function main() {
  const requested = process.argv.slice(2);
  const files = (
    requested.length > 0
      ? resolveRequestedFiles(requested)
      : allMigrationFiles()
  ).sort();

  if (files.length === 0) {
    process.stderr.write(`No migration files found in ${MIGRATIONS_DIR}.\n`);
    process.exit(1);
  }

  const migrations = files.map((name) => {
    const source = readFileSync(join(MIGRATIONS_DIR, name), 'utf-8');
    return { name, hash: name, jsSource: transpileMigrationSource(source) };
  });

  process.stdout.write(JSON.stringify({ migrations }, null, 2) + '\n');
}

// Run only when executed directly, never when imported by tests.
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    process.stderr.write(
      `transpile-migration: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}
