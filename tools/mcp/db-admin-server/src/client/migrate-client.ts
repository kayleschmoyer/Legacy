/**
 * Client helper for the hosted `db_migrate` tool (LS-8119, AC1).
 *
 * The hosted Lambda has no view of a developer's local migrations directory, so
 * the *client* must transpile each pending migration `.ts` to CommonJS
 * JavaScript and POST it. This module:
 *   1. reads pending migration files from `lib/db-client/migrations`,
 *   2. transpiles each with esbuild (type-only `drizzle-orm` imports are
 *      stripped; any runtime `import` becomes a `require()` the Lambda sandbox
 *      resolves), and
 *   3. POSTs `{ migrations: [{ name, hash, jsSource }] }` (ordered by timestamp)
 *      as an MCP `tools/call` to the server.
 *
 * It runs locally via `tsx` (never inside the Lambda — `src/lambda.ts` does not
 * import it, so esbuild stays out of the deployed bundle). The bearer + server
 * URL are provided by the environment; minting + server registration are wired
 * by the client-registration ticket (LS-8120).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import type { MigrationPayloadItem } from '../tools/migrate.js';

/** Same migration-filename shape the server validates against. */
const MIGRATION_FILE_RE = /^\d{8}_\d{6}_.+\.ts$/;

/** A migration file read from disk, before transpilation. */
export interface LocalMigration {
  name: string;
  source: string;
}

/**
 * Transpile a single migration's TypeScript source to CommonJS JavaScript.
 *
 * `format: 'cjs'` makes esbuild emit `exports.up = ...` and turn any runtime
 * `import x from 'pkg'` into `require('pkg')` — which the Lambda's sandboxed
 * `require` shim resolves for `postgres` / `drizzle-orm[/*]` only. Type-only
 * imports (the common case for migrations) are erased entirely.
 */
export function transpileMigrationSource(tsSource: string): string {
  const { code } = transformSync(tsSource, {
    loader: 'ts',
    format: 'cjs',
    platform: 'node',
    target: 'node20',
  });
  return code;
}

/**
 * Build the ordered, transpiled payload. Migrations are keyed by filename
 * (`hash === name`), matching the local runner's tracking key, and sorted by
 * filename — which is timestamp-prefixed, so lexical order is timestamp order.
 */
export function buildMigrationPayload(
  migrations: LocalMigration[],
): MigrationPayloadItem[] {
  return [...migrations]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => ({
      name: m.name,
      hash: m.name,
      jsSource: transpileMigrationSource(m.source),
    }));
}

/** Read every migration `.ts` from `migrationsDir`, sorted by filename. */
export function collectMigrations(migrationsDir: string): LocalMigration[] {
  return readdirSync(migrationsDir)
    .filter((file) => MIGRATION_FILE_RE.test(file))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      source: readFileSync(join(migrationsDir, name), 'utf-8'),
    }));
}

/** Build the MCP JSON-RPC `tools/call` request body for `db_migrate`. */
export function buildToolCallBody(migrations: MigrationPayloadItem[]): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'db_migrate',
      arguments: { migrations },
    },
  });
}

/** Build the `tools/call` body that polls an async migration job (LS-8563). */
export function buildStatusCallBody(jobId: string): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'db_migration_status',
      arguments: { jobId },
    },
  });
}

/**
 * Extract the tool's JSON payload from an MCP JSON-RPC response body (the
 * server replies with `enableJsonResponse`, so the body is plain JSON:
 * `{ result: { content: [{ type: "text", text: "<json>" }], isError? } }`).
 * Throws on a JSON-RPC error member or an unparseable body.
 */
export function parseToolResultPayload(
  responseText: string,
): Record<string, unknown> {
  const rpc = JSON.parse(responseText) as {
    error?: { message?: string };
    result?: { content?: Array<{ type: string; text?: string }> };
  };
  if (rpc.error) {
    throw new Error(`MCP error: ${rpc.error.message ?? responseText}`);
  }
  const text = rpc.result?.content?.find((c) => c.type === 'text')?.text;
  if (!text) {
    throw new Error(`MCP response has no text content: ${responseText}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** POST a `tools/call` body to the hosted server's MCP endpoint. */
async function postToolCall(
  serverUrl: string,
  bearer: string,
  body: string,
  label: string,
): Promise<string> {
  const response = await fetch(serverUrl, {
    method: 'POST',
    headers: {
      Authorization: bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${label} request failed (HTTP ${response.status}): ${text}`,
    );
  }
  return text;
}

/** POST the transpiled payload to the hosted server's MCP endpoint. */
export async function postMigrations(
  serverUrl: string,
  bearer: string,
  migrations: MigrationPayloadItem[],
): Promise<string> {
  return postToolCall(
    serverUrl,
    bearer,
    buildToolCallBody(migrations),
    'db_migrate',
  );
}

/** Poll cadence for async jobs — one round trip catches the common fast batch. */
export const JOB_POLL_INTERVAL_MS = 5_000;

/**
 * Poll ceiling — a shade past the server's stale cutoff (~16 min), so a dead
 * worker is observed as `orphaned` rather than as a client-side timeout.
 */
export const JOB_POLL_TIMEOUT_MS = 1_020_000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll `db_migration_status({ jobId })` until the job reaches a terminal state
 * (done / failed / orphaned) and return the terminal payload — the same shape
 * the synchronous `db_migrate` used to return, plus job metadata (LS-8563).
 */
export async function pollMigrateJob(opts: {
  serverUrl: string;
  bearer: string;
  jobId: string;
  intervalMs?: number;
  timeoutMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}): Promise<Record<string, unknown>> {
  const intervalMs = opts.intervalMs ?? JOB_POLL_INTERVAL_MS;
  const timeoutMs = opts.timeoutMs ?? JOB_POLL_TIMEOUT_MS;
  const sleep = opts.sleep ?? defaultSleep;

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await sleep(intervalMs);
    const text = await postToolCall(
      opts.serverUrl,
      opts.bearer,
      buildStatusCallBody(opts.jobId),
      'db_migration_status',
    );
    const payload = parseToolResultPayload(text);
    if (payload['status'] !== 'running') {
      return payload;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `db_migrate job ${opts.jobId} still running after ${timeoutMs}ms — ` +
          'poll db_migration_status({ jobId }) manually for the result.',
      );
    }
  }
}

/**
 * Transpile all local migrations, POST them, and poll the resulting async job
 * to its terminal state so callers still see one logical operation (LS-8563).
 * The server skips already-applied migrations, so the client sends the full
 * ordered set rather than pre-diffing.
 *
 * When the server responds with the pre-async (synchronous) result shape — no
 * `jobId` — the response is returned as-is, which also covers validation
 * errors and a not-yet-redeployed server.
 */
export async function runDbMigrate(opts: {
  serverUrl: string;
  bearer: string;
  migrationsDir: string;
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<string> {
  const migrations = collectMigrations(opts.migrationsDir);
  const payload = buildMigrationPayload(migrations);
  const submitText = await postMigrations(opts.serverUrl, opts.bearer, payload);

  let submit: Record<string, unknown>;
  try {
    submit = parseToolResultPayload(submitText);
  } catch {
    return submitText;
  }
  if (typeof submit['jobId'] !== 'string' || submit['status'] !== 'running') {
    return submitText;
  }

  const terminal = await pollMigrateJob({
    serverUrl: opts.serverUrl,
    bearer: opts.bearer,
    jobId: submit['jobId'],
    intervalMs: opts.intervalMs,
    timeoutMs: opts.timeoutMs,
    sleep: opts.sleep,
  });
  return JSON.stringify(terminal);
}
