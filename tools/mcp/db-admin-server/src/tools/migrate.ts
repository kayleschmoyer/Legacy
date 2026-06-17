import { compileFunction } from 'node:vm';
import postgres from 'postgres';
import * as drizzleOrm from 'drizzle-orm';
import * as drizzleOrmPgCore from 'drizzle-orm/pg-core';
import * as drizzleOrmPostgresJs from 'drizzle-orm/postgres-js';
import { LOGGER } from '@legacy-sports/logging';
import {
  applyMigrationModule,
  type MigrationModule,
} from '@legacy-sports/db-client/src/scripts/migration-runner.js';
import { getMigrationSql } from '../db.js';
import { errorMessage, jsonResult, type ToolResult } from '../types.js';
import type { McpCaller } from '../audit.js';

/**
 * `db_migrate` — apply UNMERGED local-branch migrations to the dev database
 * over HTTPS, with NO SSM tunnel (LS-8119).
 *
 * The hosted Lambda cannot see a developer's local migrations directory, so the
 * client transpiles each pending migration `.ts` to CJS JavaScript (see
 * `src/client/transpile.ts`) and POSTs `{ migrations: [{ name, hash, jsSource }] }`.
 * This tool evaluates each `jsSource` in a constrained sandbox and applies it
 * through the exact same atomic code path as the local runner
 * (`applyMigrationModule`, extracted in LS-8118).
 *
 * Security posture — this is effectively a remote DDL endpoint. It is defended
 * in depth: the `mcp/db` Cognito scope (enforced in `lambda.ts`), a dev-only
 * environment guard, payload/count caps, a strict migration-name allowlist
 * regex, a `require` shim that resolves ONLY `postgres` / `drizzle-orm[/*]`, and
 * a full audit log of every migration keyed to the calling principal.
 */

/** One transpiled migration as sent by the client, ordered by timestamp. */
export interface MigrationPayloadItem {
  /** Migration filename, e.g. `20260616_120000_add_x.ts`. */
  name: string;
  /** Tracking key in `drizzle.__drizzle_migrations` — the runner keys on filename. */
  hash: string;
  /** Client-transpiled CJS source of the migration module. */
  jsSource: string;
}

export interface MigrateParams {
  migrations: MigrationPayloadItem[];
}

/** parseUpOutput-compatible result, plus the `skipped` (already-applied) set. */
interface MigrateResult {
  applied: number;
  appliedNames: string[];
  skipped: string[];
  success: boolean;
  /** Present only when a migration failed (stop-on-first-failure). */
  failed?: string;
  /** Present only when a migration failed. */
  error?: string;
}

/** Environments in which `db_migrate` is permitted to run. */
const DEV_ENVIRONMENTS = new Set(['dev', 'development']);

/**
 * Strict migration-name allowlist. Real migration filenames are
 * `<8-digit date>_<6-digit time>_<name>.ts`, and this regex deliberately matches
 * the same shape the local runner's `parseMigrationFilename` accepts
 * (`/^(\d{8}_\d{6})_(.+)\.ts$/`), including the `_` separators. (The LS-8119
 * ticket's shorthand `\d{8}\d{6}` dropped those separators; this stricter form
 * is intentionally aligned with the local runner instead.)
 */
const MIGRATION_NAME_RE = /^\d{8}_\d{6}_.+\.ts$/;

/** Reject payloads larger than this many migrations in a single call. */
const MAX_MIGRATION_COUNT = 50;

/** Reject payloads whose combined transpiled source exceeds this many bytes. */
const MAX_TOTAL_PAYLOAD_BYTES = 2_000_000;

/**
 * Modules the sandboxed migration `require` shim will resolve. They are
 * statically imported here so the bundler inlines them into the Lambda — at
 * runtime there is no `node_modules` to resolve a bare `require('drizzle-orm')`
 * against, so the shim must hand back these already-bundled instances.
 */
const ALLOWED_MODULES: Record<string, unknown> = {
  postgres,
  'drizzle-orm': drizzleOrm,
  'drizzle-orm/pg-core': drizzleOrmPgCore,
  'drizzle-orm/postgres-js': drizzleOrmPostgresJs,
};

/**
 * `require` implementation handed to evaluated migration source. Resolves ONLY
 * `postgres` and `drizzle-orm[/*]` to the Lambda's bundled instances; any other
 * specifier (fs, child_process, a relative path, an arbitrary package) is
 * rejected so a migration cannot pull in modules to reach the filesystem,
 * spawn processes, or open its own network connections.
 *
 * Scope note for review: the threat model is *developer-authored* migrations
 * transported over the wire (the mcp/db scope holder transpiles their own local
 * migrations), not arbitrary third-party code. `vm.compileFunction` runs in the
 * current global context, so migration code can still see Lambda globals; the
 * primary defenses are the `mcp/db` scope, the dev-only guard, this module
 * allowlist, and the audit log — not full context isolation.
 */
export function migrationRequire(specifier: string): unknown {
  if (Object.prototype.hasOwnProperty.call(ALLOWED_MODULES, specifier)) {
    return ALLOWED_MODULES[specifier];
  }
  throw new Error(
    `Migration attempted to require '${specifier}', which is not allowed. ` +
      `Only 'postgres' and 'drizzle-orm[/*]' are available in the hosted ` +
      `migration sandbox.`,
  );
}

/**
 * Evaluate client-transpiled CJS migration source into a `{ up }` module.
 *
 * The source is compiled with `node:vm`'s `compileFunction` (the "vm-eval" in
 * this ticket's title) using the CommonJS wrapper arguments esbuild's `cjs`
 * output targets (`exports`, `require`, `module`). `db`/`sql` complete the
 * documented sandbox signature, but real migrations receive their connection
 * through `up({ db, sql })` (supplied by `applyMigrationModule`), so they are
 * `undefined` at module-eval time. `vm.compileFunction` (rather than
 * `new Function`) keeps the evaluation within the `vm` sandbox primitive.
 */
type ModuleFactory = (
  exports: Record<string, unknown>,
  require: (specifier: string) => unknown,
  module: { exports: Record<string, unknown> },
  db: undefined,
  sql: undefined,
) => void;

export function evalMigrationModule(jsSource: string): MigrationModule {
  const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
  const factory = compileFunction(jsSource, [
    'exports',
    'require',
    'module',
    'db',
    'sql',
  ]) as ModuleFactory;
  factory(moduleObj.exports, migrationRequire, moduleObj, undefined, undefined);

  // esbuild reassigns `module.exports = __toCommonJS(...)` (with an `up` getter);
  // a hand-written migration could also assign `exports.up = ...`. Reading
  // `moduleObj.exports` after the factory runs covers both shapes.
  const exported = (moduleObj.exports ?? {}) as { up?: unknown };
  if (typeof exported.up !== 'function') {
    throw new Error('Migration module does not export an up() function');
  }
  return exported as MigrationModule;
}

/** Throw unless the Lambda is running in a permitted (dev) environment. */
function assertDevEnvironment(): void {
  const env = process.env['NODE_ENV'];
  if (!env || !DEV_ENVIRONMENTS.has(env)) {
    throw new Error(
      `db_migrate is disabled outside dev environments (NODE_ENV='${env ?? ''}').`,
    );
  }
}

/** Validate the request payload (count, total size, per-item name format). */
function validatePayload(migrations: MigrationPayloadItem[]): void {
  if (!Array.isArray(migrations) || migrations.length === 0) {
    throw new Error('No migrations provided.');
  }
  if (migrations.length > MAX_MIGRATION_COUNT) {
    throw new Error(
      `Too many migrations in one call (${migrations.length} > ${MAX_MIGRATION_COUNT}).`,
    );
  }

  let totalBytes = 0;
  for (const m of migrations) {
    if (!MIGRATION_NAME_RE.test(m.name)) {
      throw new Error(`Invalid migration name: '${m.name}'.`);
    }
    if (!MIGRATION_NAME_RE.test(m.hash)) {
      throw new Error(`Invalid migration hash: '${m.hash}'.`);
    }
    if (typeof m.jsSource !== 'string' || m.jsSource.length === 0) {
      throw new Error(`Migration '${m.name}' has empty jsSource.`);
    }
    totalBytes += Buffer.byteLength(m.jsSource, 'utf-8');
  }
  if (totalBytes > MAX_TOTAL_PAYLOAD_BYTES) {
    throw new Error(
      `Migration payload too large (${totalBytes} > ${MAX_TOTAL_PAYLOAD_BYTES} bytes).`,
    );
  }
}

function auditPrincipal(caller: McpCaller): string {
  return `client_id=${caller.clientId ?? 'unknown'} sub=${caller.sub ?? 'unknown'}`;
}

/**
 * Ensure the drizzle migration-tracking table exists, then read the set of
 * already-applied migration hashes. Done over the raw `postgres` client rather
 * than via db-client's drizzle-typed helpers — the sibling `db_migration_status`
 * tool reads the same table the same way, and it keeps the cross-package type
 * surface to just `applyMigrationModule`.
 */
async function getAppliedHashes(sqlClient: postgres.Sql): Promise<Set<string>> {
  await sqlClient.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle;');
  await sqlClient.unsafe(
    `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
       id SERIAL PRIMARY KEY,
       hash VARCHAR(255) NOT NULL UNIQUE,
       created_at BIGINT NOT NULL
     );`,
  );
  const rows = await sqlClient<{ hash: string }[]>`
    SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at ASC
  `;
  return new Set(rows.map((r) => r.hash));
}

/**
 * Apply the provided migrations, skipping any already recorded as applied, and
 * stopping on the first failure. Each migration is applied atomically (up() +
 * the bookkeeping insert in one transaction) by `applyMigrationModule`.
 */
export async function migrate(
  params: MigrateParams,
  caller: McpCaller,
): Promise<ToolResult> {
  const principal = auditPrincipal(caller);

  try {
    assertDevEnvironment();
    validatePayload(params.migrations);
  } catch (error) {
    LOGGER.error(
      `[db_migrate] rejected request (${principal}): ${errorMessage(error)}`,
    );
    return jsonResult(
      {
        applied: 0,
        appliedNames: [],
        skipped: [],
        success: false,
        error: errorMessage(error),
      },
      true,
    );
  }

  // Migrations must be applied in timestamp order; the client sends them
  // ordered, but sort defensively on the filename (timestamp-prefixed) so order
  // never depends on client behavior.
  const ordered = [...params.migrations].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  let sql: postgres.Sql;
  try {
    sql = await getMigrationSql();
  } catch (error) {
    LOGGER.error(
      `[db_migrate] database unavailable (${principal}): ${errorMessage(error)}`,
    );
    return jsonResult(
      {
        applied: 0,
        appliedNames: [],
        skipped: [],
        success: false,
        error: `Database unavailable: ${errorMessage(error)}`,
      },
      true,
    );
  }

  const appliedAlready = await getAppliedHashes(sql);

  LOGGER.info(
    `[db_migrate] start (${principal}): ${ordered.length} migration(s) submitted`,
  );

  const appliedNames: string[] = [];
  const skipped: string[] = [];

  for (const m of ordered) {
    if (appliedAlready.has(m.hash)) {
      skipped.push(m.name);
      LOGGER.info(
        `[db_migrate] skip already-applied migration=${m.name} hash=${m.hash} (${principal})`,
      );
      continue;
    }

    try {
      const moduleToApply = evalMigrationModule(m.jsSource);
      await applyMigrationModule(sql, m.hash, moduleToApply);
      appliedNames.push(m.name);
      LOGGER.info(
        `[db_migrate] applied migration=${m.name} hash=${m.hash} (${principal})`,
      );
    } catch (error) {
      const message = errorMessage(error);
      LOGGER.error(
        `[db_migrate] FAILED migration=${m.name} hash=${m.hash} (${principal}): ${message}`,
      );
      const result: MigrateResult = {
        applied: appliedNames.length,
        appliedNames,
        skipped,
        success: false,
        failed: m.name,
        error: message,
      };
      return jsonResult(result, true);
    }
  }

  LOGGER.info(
    `[db_migrate] done (${principal}): applied=${appliedNames.length} skipped=${skipped.length}`,
  );

  const result: MigrateResult = {
    applied: appliedNames.length,
    appliedNames,
    skipped,
    success: true,
  };
  return jsonResult(result);
}
