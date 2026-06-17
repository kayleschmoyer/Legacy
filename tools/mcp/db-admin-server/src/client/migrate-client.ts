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

/** POST the transpiled payload to the hosted server's MCP endpoint. */
export async function postMigrations(
  serverUrl: string,
  bearer: string,
  migrations: MigrationPayloadItem[],
): Promise<string> {
  const response = await fetch(serverUrl, {
    method: 'POST',
    headers: {
      Authorization: bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: buildToolCallBody(migrations),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `db_migrate request failed (HTTP ${response.status}): ${text}`,
    );
  }
  return text;
}

/**
 * Transpile all local migrations and POST them. The server skips
 * already-applied migrations, so the client sends the full ordered set rather
 * than pre-diffing.
 */
export async function runDbMigrate(opts: {
  serverUrl: string;
  bearer: string;
  migrationsDir: string;
}): Promise<string> {
  const migrations = collectMigrations(opts.migrationsDir);
  const payload = buildMigrationPayload(migrations);
  return postMigrations(opts.serverUrl, opts.bearer, payload);
}
