#!/usr/bin/env node
/**
 * scripts/db/verify-migration.mjs
 *
 * Verifies a candidate migration against an ephemeral, in-process Postgres
 * (PGlite — real Postgres compiled to WASM) before it is ever applied to the
 * single shared dev RDS (LS-10088).
 *
 * There is exactly one database: `db_migrate` and `pnpm --prefix lib/db-client
 * run db:up` both write straight to the shared dev RDS, so before this script
 * the only pre-apply verification available was reading the SQL. This harness
 * answers the three questions reading cannot:
 *
 *   1. does the migration apply cleanly against the REAL current schema?
 *   2. is it re-runnable (idempotent)?
 *   3. does down() then up() round-trip?
 *
 * It applies the real migration chain — every migration in the migrations
 * directory sorting before the candidate — rather than a hand-written replica
 * of the affected tables. That distinction is the whole point: a hand-written
 * replica only models the columns its author thought about, which is how the
 * draft_mode/selection_method NOT NULL break in LS-10085 slipped past the
 * scratch harness that motivated this script.
 *
 * No Docker, no AWS credentials, no network, no DATABASE_URL. PGlite is WASM,
 * so this runs identically on a cloud agent and on local Windows (the DB
 * integration suite, by contrast, hard-requires a Docker/CI-service Postgres
 * via TEST_DATABASE_URL — see lambdas/db/integration-test-setup.ts).
 *
 * Usage:
 *   node scripts/db/verify-migration.mjs <migration-file>
 *   make verify-migration MIGRATION=lib/db-client/migrations/<file>.ts
 *
 * <migration-file> may be a bare basename or any path ending in one; it is
 * resolved against the migrations directory.
 *
 * MIGRATIONS_DIR env var overrides the migrations directory (used by tests).
 *
 * Like its sibling scripts/db/transpile-migration.mjs, this script
 * reimplements — rather than imports — the db-client apply path. Everything
 * under scripts/ runs on plain `node` and must not import `@legacy-sports/*`
 * or the db-client TypeScript modules, whose dependency graph drags in dotenv
 * and the AWS Secrets Manager credential resolution this harness exists to
 * avoid. Keep the execution semantics below in sync with
 * lib/db-client/src/scripts/migration-runner.ts.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const MIGRATIONS_DIR =
  process.env['MIGRATIONS_DIR'] ??
  join(REPO_ROOT, 'lib', 'db-client', 'migrations');

/** Same migration-filename shape the production runner parses and sorts on. */
export const MIGRATION_FILE_RE = /^\d{8}_\d{6}_.+\.ts$/;

/**
 * Migrations the PGlite build genuinely cannot execute, mapped to the reason.
 *
 * Keep this list SHORT and justified — every entry is schema the rest of the
 * chain is then verified without. An entry belongs here only when the failure
 * is a limitation of the WASM engine itself, never when it is a defect in the
 * migration. Empirically (LS-10088) exactly one of the 293 landed migrations
 * qualifies; the role/GRANT migrations, `CREATE INDEX CONCURRENTLY`, and the
 * `pg_trgm`/`unaccent` extensions all run fine.
 *
 * If this list starts growing, stop and reconsider the approach rather than
 * quietly skipping more of the schema.
 */
export const PGLITE_UNSUPPORTED = {
  '20260614_060000_add_unaccent_indexes_for_football_player_search.ts':
    "uses the two-argument unaccent('unaccent', text) form, which needs the " +
    "unaccent dictionary rules file that PGlite's contrib build omits",
};

/** Extensions the migration chain creates, preloaded into the PGlite instance. */
async function loadExtensions() {
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const { unaccent } = await import('@electric-sql/pglite/contrib/unaccent');
  return { pg_trgm, unaccent };
}

/** All migration filenames in a directory, sorted (timestamp order = apply order). */
export function allMigrationFiles(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .filter((f) => MIGRATION_FILE_RE.test(f))
    .sort();
}

/**
 * The chain to apply before the candidate: every migration whose filename
 * sorts strictly before it. Filenames are timestamp-prefixed, so lexical order
 * is apply order — the same ordering rule the production runner uses.
 */
export function planChain(candidate, dir = MIGRATIONS_DIR) {
  return allMigrationFiles(dir).filter((f) => f < candidate);
}

/** Resolve a user-supplied argument (bare name or path) to a migration filename. */
export function resolveCandidate(arg, dir = MIGRATIONS_DIR) {
  const file = basename(String(arg).replace(/\\/g, '/'));
  if (!MIGRATION_FILE_RE.test(file)) {
    throw new Error(
      `'${arg}' is not a valid migration filename (expected YYYYMMDD_HHMMSS_name.ts).`,
    );
  }
  if (!allMigrationFiles(dir).includes(file)) {
    throw new Error(`'${file}' was not found in ${dir}.`);
  }
  return file;
}

/**
 * Transpile a migration's TypeScript to CommonJS and evaluate it.
 *
 * Migrations are authored in TypeScript but this script runs on plain `node`,
 * so they are transpiled with esbuild exactly as scripts/db/transpile-migration.mjs
 * does for the hosted db_migrate tool. Evaluating the CJS output (rather than
 * dynamic-importing the .ts file) also sidesteps the Windows file:// URL
 * normalization the production runner needs.
 *
 * The only runtime import any landed migration has is `{ sql }` from
 * 'drizzle-orm', which resolves through the repo-root require.
 */
export function loadMigration(file, dir = MIGRATIONS_DIR) {
  const source = readFileSync(join(dir, file), 'utf-8');
  const { code } = transformSync(source, {
    loader: 'ts',
    format: 'cjs',
    platform: 'node',
    target: 'node20',
  });
  const require = createRequire(join(REPO_ROOT, 'package.json'));
  const module = { exports: {} };
  new Function('exports', 'require', 'module', '__filename', '__dirname', code)(
    module.exports,
    require,
    module,
    join(dir, file),
    dir,
  );
  return module.exports;
}

/**
 * Build the `{ db, sql }` context a migration body receives, over a PGlite
 * instance.
 *
 * This shim exists because PGlite is not wire-compatible with the `postgres`
 * client production uses, and the protocol difference is load-bearing: a
 * statement sent over the extended (prepared) protocol may not contain
 * multiple commands. postgres.js routes a query with no bound parameters
 * through the SIMPLE protocol, which is why dozens of landed migrations pass
 * a multi-statement string (or a zero-interpolation `sql` template) to
 * db.execute and work against the real database. Mirror that split exactly —
 * routing everything through the extended protocol fails 30+ landed
 * migrations with "cannot insert multiple commands into a prepared statement",
 * which would be a harness artifact, not a real defect.
 *
 * `db.execute` returns an array of rows: migrations consume results as
 * `result?.[0]?.count` and `Array.isArray(result)`, matching the RowList that
 * drizzle's postgres-js driver returns.
 */
export function createMigrationContext(pg, dialect) {
  const runSimple = async (text) => {
    const results = await pg.exec(text);
    return results.length > 0 ? results[results.length - 1].rows : [];
  };

  const db = {
    execute: async (query) => {
      if (typeof query === 'string') return runSimple(query);
      const { sql: text, params } = dialect.sqlToQuery(query);
      if (params.length === 0) return runSimple(text);
      return (await pg.query(text, params)).rows;
    },
  };

  // postgres.js tagged template: interpolations become bound parameters, so
  // this always uses the extended protocol — including the single-statement
  // restriction, which keeps the harness honest rather than permissive.
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) {
      text += `$${i + 1}${strings[i + 1]}`;
    }
    return (await pg.query(text, values)).rows;
  };

  return { db, sql };
}

/** Mirror of ensureMigrationsTable in lib/db-client/src/scripts/rollback-migrations.ts. */
async function ensureMigrationsTable(db) {
  await db.execute(`CREATE SCHEMA IF NOT EXISTS drizzle;`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash VARCHAR(255) NOT NULL UNIQUE,
      created_at BIGINT NOT NULL
    );
  `);
}

/**
 * Apply one migration's up() and record its hash, the way applyMigrationModule
 * does. The body runs with autocommit-per-statement, NOT inside an enclosing
 * transaction — several landed migrations REQUIRE that (ALTER TYPE ... ADD
 * VALUE followed by immediate use, swallowed best-effort statements, CREATE
 * INDEX CONCURRENTLY). See the rationale at
 * lib/db-client/src/scripts/migration-runner.ts:37-72.
 */
async function applyUp(ctx, file, module) {
  await module.up(ctx);
  await ctx.sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${file}, ${Date.now()})
    ON CONFLICT (hash) DO NOTHING
  `;
}

const out = (line) => process.stdout.write(`${line}\n`);
const firstLine = (err) => {
  const message = String((err && err.message) || err).split('\n')[0];
  const cause = err && err.cause ? String(err.cause.message || err.cause) : '';
  return cause && !message.includes(cause) ? `${message} (${cause})` : message;
};

export function usage() {
  return [
    'Usage: node scripts/db/verify-migration.mjs <migration-file>',
    '       make verify-migration MIGRATION=lib/db-client/migrations/<file>.ts',
    '',
    'Verifies a candidate migration against an ephemeral PGlite Postgres:',
    'applies the real migration chain, then the candidate, then asserts the',
    'candidate re-runs clean and that down()/up() round-trips.',
  ].join('\n');
}

/**
 * Run the verification. Returns an exit code rather than calling process.exit
 * so it stays testable.
 */
export async function verifyMigration(argv, dir = MIGRATIONS_DIR) {
  if (argv.length === 0 || !String(argv[0]).trim()) {
    process.stderr.write(`${usage()}\n`);
    return 1;
  }

  let candidate;
  try {
    candidate = resolveCandidate(argv[0], dir);
  } catch (err) {
    process.stderr.write(`verify-migration: ${firstLine(err)}\n`);
    return 1;
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { PgDialect } = await import('drizzle-orm/pg-core');
  const extensions = await loadExtensions();

  const started = Date.now();
  const pg = await new PGlite({ extensions });
  const ctx = createMigrationContext(pg, new PgDialect());

  try {
    await ensureMigrationsTable(ctx.db);

    const chain = planChain(candidate, dir);
    const skipped = chain.filter((f) => f in PGLITE_UNSUPPORTED);
    out(
      `→ chain: ${chain.length} migration(s) before ${candidate}` +
        (skipped.length > 0 ? `, ${skipped.length} skipped` : ''),
    );
    for (const file of skipped) {
      out(`  skipped ${file} — ${PGLITE_UNSUPPORTED[file]}`);
    }

    for (const file of chain) {
      if (file in PGLITE_UNSUPPORTED) continue;
      try {
        await applyUp(ctx, file, loadMigration(file, dir));
      } catch (err) {
        out(`✗ chain failed at ${file}: ${firstLine(err)}`);
        out(
          '  This is a pre-existing migration, not the candidate — the chain ' +
            'could not be rebuilt, so the candidate was not verified.',
        );
        return 1;
      }
    }
    out(`✓ chain applied (${((Date.now() - started) / 1000).toFixed(1)}s)`);

    if (candidate in PGLITE_UNSUPPORTED) {
      out(
        `✗ ${candidate} is on the PGlite skip-list, so it cannot be verified`,
      );
      out(`  ${PGLITE_UNSUPPORTED[candidate]}`);
      return 1;
    }

    const module = loadMigration(candidate, dir);
    if (typeof module.up !== 'function') {
      out(`✗ ${candidate} does not export an up() function`);
      return 1;
    }

    try {
      await applyUp(ctx, candidate, module);
      out('✓ applies clean');
    } catch (err) {
      out(`✗ applies clean — FAILED: ${firstLine(err)}`);
      return 1;
    }

    try {
      await applyUp(ctx, candidate, module);
      out('✓ re-runs clean (idempotent)');
    } catch (err) {
      out(`✗ re-runs clean (idempotent) — FAILED: ${firstLine(err)}`);
      out(
        '  up() is not re-runnable. Guard DDL with IF [NOT] EXISTS and make ' +
          'backfills conditional; a partially-applied migration is re-run as-is.',
      );
      return 1;
    }

    if (typeof module.down !== 'function') {
      out('- no down() — rollback check skipped');
    } else {
      try {
        await module.down(ctx);
        // Production's `db:down` unrecords the hash after a successful down()
        // (unrecordMigration in rollback-migrations.ts), so drop it here too —
        // a migration that inspects the journal must see the same state it
        // would on a real rollback.
        await ctx.sql`DELETE FROM drizzle.__drizzle_migrations WHERE hash = ${candidate}`;
        await applyUp(ctx, candidate, module);
        out('✓ down() then up() round-trips');
      } catch (err) {
        out(`✗ down() then up() round-trips — FAILED: ${firstLine(err)}`);
        return 1;
      }
    }

    out(
      `\nverify-migration: ${candidate} PASSED ` +
        `(${((Date.now() - started) / 1000).toFixed(1)}s, no shared database touched)`,
    );
    return 0;
  } finally {
    await pg.close();
  }
}

// Run only when executed directly, never when imported by tests.
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  try {
    process.exitCode = await verifyMigration(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`verify-migration: ${firstLine(err)}\n`);
    process.exitCode = 1;
  }
}
