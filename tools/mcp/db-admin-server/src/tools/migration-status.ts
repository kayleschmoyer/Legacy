import { getReadonlySql } from '../db.js';
import { errorMessage, jsonResult, type ToolResult } from '../types.js';

interface MigrationStatusParams {
  localMigrationNames?: string[];
}

/**
 * Report applied vs pending migrations on the dev database.
 *
 * Applied migrations are keyed by filename in `drizzle.__drizzle_migrations`
 * (see `lib/db-client/src/scripts/rollback-migrations.ts`). A hosted Lambda
 * has no view of the local migrations directory, so the client passes the
 * local migration filenames and the server computes the pending diff.
 */
export async function migrationStatus(
  params: MigrationStatusParams,
): Promise<ToolResult> {
  const localNames = params.localMigrationNames ?? [];

  let sql;
  try {
    sql = await getReadonlySql();
  } catch (error) {
    return jsonResult({
      available: false,
      reason: `Database unavailable: ${errorMessage(error)}`,
      applied: null,
      pending: null,
      pendingNames: [],
      needsMigration: null,
    });
  }

  try {
    const rows = await sql<{ hash: string }[]>`
      SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at ASC
    `;
    const appliedNames = rows.map((r) => r.hash);
    const appliedSet = new Set(appliedNames);
    const pendingNames = localNames.filter((name) => !appliedSet.has(name));

    return jsonResult({
      available: true,
      reason: null,
      applied: appliedNames.length,
      pending: pendingNames.length,
      pendingNames,
      needsMigration: pendingNames.length > 0,
    });
  } catch (error) {
    return jsonResult({
      available: false,
      reason: `Failed to read migration status: ${errorMessage(error)}`,
      applied: null,
      pending: null,
      pendingNames: [],
      needsMigration: null,
    });
  }
}
