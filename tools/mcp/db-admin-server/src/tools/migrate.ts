import postgres from 'postgres';
import * as drizzleOrm from 'drizzle-orm';
import * as drizzleOrmPgCore from 'drizzle-orm/pg-core';
import * as drizzleOrmPostgresJs from 'drizzle-orm/postgres-js';
import { LOGGER } from '@legacy-sports/logging';
import {
  applyMigrationModule,
  type MigrationModule,
} from '@legacy-sports/db-client/src/scripts/migration-runner.js';
import { compileFunction } from 'node:vm';
import { getMigrationSql } from '../db.js';
import { errorMessage, jsonResult, type ToolResult } from '../types.js';
import type { McpCaller } from '../audit.js';
import {
  ensureJobsTable,
  findRunningJob,
  finishJob,
  insertJob,
  reapStaleJobs,
} from '../jobs.js';
import { invokeWorkerAsync } from '../invoke-worker.js';

/**
 * `db_migrate` — apply UNMERGED local-branch migrations to the dev database
 * over HTTPS, with NO SSM tunnel (LS-8119).
 *
 * The hosted Lambda cannot see a developer's local migrations directory, so the
 * client transpiles each pending migration `.ts` to CJS JavaScript (see
 * `src/client/transpile.ts`) and POSTs `{ migrations: [{ name, hash, jsSource }] }`.
 * The migration batch is applied by an async worker (LS-8563): this tool
 * validates the payload, persists it to a job row, fires an async self-invoke,
 * and returns `{ jobId, status: "running" }` well inside the API Gateway's ~29s
 * window; callers poll `db_migration_status({ jobId })` to the terminal result.
 * The worker (`src/worker.ts`) evaluates each `jsSource` in a constrained
 * sandbox and applies it through the exact same code path as the local runner
 * (`applyMigrationModule`, extracted in LS-8118; migrations run with autocommit
 * semantics since LS-8254).
 *
 * Security posture — this is effectively a remote DDL endpoint. It is defended
 * in depth: the `mcp/db` Cognito scope (enforced in `lambda.ts`), a dev-only
 * environment guard, payload/count caps, a strict migration-name allowlist
 * regex, a `require` shim that resolves ONLY `postgres` / `drizzle-orm[/*]`, and
 * a full audit log of every migration keyed to the calling principal — the
 * principal is persisted on the job row so the worker's per-migration audit
 * lines stay keyed to the original caller across the async boundary.
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
export interface MigrateResult {
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
 * Apply a validated, ordered migration batch: skip any migration already
 * recorded as applied, stop on the first failure. Each migration's `up()` runs
 * with autocommit semantics and its hash is recorded only on success, by
 * `applyMigrationModule` (LS-8254) — which is what makes re-submitting after a
 * mid-batch failure resume-safe.
 *
 * Runs inside the async worker (LS-8563). `principal` is the audit identity
 * persisted on the job row at submit time, so every per-migration audit line
 * stays keyed to the original caller across the async boundary. `onProgress`
 * is awaited after each processed migration — the worker uses it to heartbeat
 * the job row so pollers can distinguish a slow batch from a dead worker.
 */
export async function applyMigrationBatch(
  sql: postgres.Sql,
  migrations: MigrationPayloadItem[],
  principal: string,
  onProgress?: () => Promise<void>,
): Promise<MigrateResult> {
  // Migrations must be applied in timestamp order; submitters persist them
  // ordered, but sort defensively on the filename (timestamp-prefixed) so order
  // never depends on upstream behavior.
  const ordered = [...migrations].sort((a, b) => a.name.localeCompare(b.name));

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
      await onProgress?.();
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
      return {
        applied: appliedNames.length,
        appliedNames,
        skipped,
        success: false,
        failed: m.name,
        error: message,
      };
    }
    await onProgress?.();
  }

  LOGGER.info(
    `[db_migrate] done (${principal}): applied=${appliedNames.length} skipped=${skipped.length}`,
  );

  return {
    applied: appliedNames.length,
    appliedNames,
    skipped,
    success: true,
  };
}

/** Shape returned by `migrate` — the submit acknowledgement, not the result. */
export interface MigrateSubmitResult {
  jobId: string;
  status: 'running';
  /** True when an already-running job was joined instead of starting a new one. */
  joined: boolean;
  submitted: number;
  hint: string;
}

const POLL_HINT =
  'Poll db_migration_status({ jobId }) every ~5s until status is done/failed/orphaned; ' +
  'the terminal payload has the same shape db_migrate used to return synchronously.';

/**
 * Submit a migration batch as an async job (LS-8563): validate, persist the
 * payload to a job row, fire the async self-invoke, and return
 * `{ jobId, status: "running" }` — always well inside the API Gateway window.
 *
 * If a job is already running, the call JOINS it (returns the existing jobId,
 * AC4) instead of starting a concurrent worker; the single-`running` partial
 * unique index makes this race-safe. Stale `running` rows (dead worker) are
 * reaped to `failed` first so they can never block new submissions.
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

  // Persist in apply order so the worker (and the audit trail) see the same
  // ordering the sync loop used to enforce.
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

  try {
    await ensureJobsTable(sql);
    await reapStaleJobs(sql);

    const running = await findRunningJob(sql);
    if (running) {
      LOGGER.info(
        `[db_migrate] joined running job=${running} (${principal}): ${ordered.length} migration(s) submitted`,
      );
      const joined: MigrateSubmitResult = {
        jobId: running,
        status: 'running',
        joined: true,
        submitted: ordered.length,
        hint: POLL_HINT,
      };
      return jsonResult(joined);
    }

    const jobId = await insertJob(sql, {
      principal,
      migrationNames: ordered.map((m) => m.name),
      payload: JSON.stringify({ migrations: ordered }),
    });
    if (!jobId) {
      // A concurrent submit won the single-running-index race — join it.
      const winner = await findRunningJob(sql);
      if (winner) {
        LOGGER.info(
          `[db_migrate] joined running job=${winner} after insert race (${principal})`,
        );
        const joined: MigrateSubmitResult = {
          jobId: winner,
          status: 'running',
          joined: true,
          submitted: ordered.length,
          hint: POLL_HINT,
        };
        return jsonResult(joined);
      }
      throw new Error('Failed to create a migration job (insert conflict).');
    }

    try {
      await invokeWorkerAsync(jobId);
    } catch (error) {
      // The worker will never run — fail the job so pollers see a terminal
      // state instead of waiting for the stale reaper.
      const message = `Failed to invoke the migration worker: ${errorMessage(error)}`;
      LOGGER.error(`[db_migrate] job=${jobId} (${principal}): ${message}`);
      await finishJob(
        sql,
        jobId,
        'failed',
        JSON.stringify({
          applied: 0,
          appliedNames: [],
          skipped: [],
          success: false,
          error: message,
        }),
      );
      return jsonResult(
        {
          applied: 0,
          appliedNames: [],
          skipped: [],
          success: false,
          error: message,
        },
        true,
      );
    }

    LOGGER.info(
      `[db_migrate] submitted job=${jobId} (${principal}): ${ordered.length} migration(s)`,
    );
    const submitted: MigrateSubmitResult = {
      jobId,
      status: 'running',
      joined: false,
      submitted: ordered.length,
      hint: POLL_HINT,
    };
    return jsonResult(submitted);
  } catch (error) {
    LOGGER.error(
      `[db_migrate] submit failed (${principal}): ${errorMessage(error)}`,
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
}
