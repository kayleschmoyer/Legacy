#!/usr/bin/env tsx
/**
 * Runnable entry for the `db_migrate` client helper (LS-8119, AC1).
 *
 * Transpiles all local migrations, POSTs them to the hosted db-admin server,
 * and polls the resulting async job to its terminal state (LS-8563).
 * Kept separate from `migrate-client.ts` (the pure, unit-tested library) so the
 * direct-run wiring — which uses `import.meta.url`, an ESM-only construct —
 * never reaches the CommonJS ts-jest test runner.
 *
 *   MCP_DB_ADMIN_URL     hosted server MCP endpoint (required)
 *   MCP_DB_ADMIN_BEARER  bearer token carrying the mcp/db scope (required)
 *   MIGRATIONS_DIR       override the migrations directory (optional)
 *
 * Run: `tsx tools/mcp/db-admin-server/src/client/migrate-cli.ts`
 */

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { LOGGER } from '@legacy-sports/logging';
import { runDbMigrate } from './migrate-client.js';

export async function main(): Promise<void> {
  const serverUrl = process.env['MCP_DB_ADMIN_URL'];
  const bearer = process.env['MCP_DB_ADMIN_BEARER'];
  const migrationsDir =
    process.env['MIGRATIONS_DIR'] ?? join('lib', 'db-client', 'migrations');

  if (!serverUrl || !bearer) {
    throw new Error(
      'Set MCP_DB_ADMIN_URL and MCP_DB_ADMIN_BEARER to run db_migrate against the hosted server.',
    );
  }

  const result = await runDbMigrate({ serverUrl, bearer, migrationsDir });
  LOGGER.info(result);
}

// Run only when executed directly (via tsx), never when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    LOGGER.error(
      `db_migrate client failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
