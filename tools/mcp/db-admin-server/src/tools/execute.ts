import { LOGGER } from '@legacy-sports/logging';
import { markdownTable } from '@legacy-sports/mcp-format';
import { assertDevEnvironment, auditPrincipal } from './migrate.js';
import { getWriteSql } from '../db.js';
import { errorMessage, jsonResult, type ToolResult } from '../types.js';
import type { McpCaller } from '../audit.js';

/**
 * `db_execute` — run a single ad-hoc DML statement against the dev database
 * over HTTPS, with NO SSM tunnel (LS-9358).
 *
 * Fills the gap between `db_query` (read-only, public schema is not the
 * whole story — see the app_internal grant added alongside this tool) and
 * `db_migrate` (write-capable, but only for versioned, hash-tracked schema
 * migrations): there was no MCP path for one-off INSERT/UPDATE/DELETE rows
 * against the full internal schema, forcing agents into a manual
 * SSM-tunnel-plus-throwaway-script workaround that has since become
 * unworkable (the DB-superuser secret fetch it depends on is now blocked by
 * the session auto-mode classifier).
 *
 * Security posture — a scoped-down sibling of `db_migrate`'s remote-DDL
 * posture, minus the DDL: the `mcp/db` Cognito scope (enforced in
 * `lambda.ts`), a dev-only environment guard, a single-statement guard (no
 * stacked queries via `;`), the DML-only `mcp_write` Postgres role (no
 * CREATE/ALTER/DROP grants at all — engine-enforced, same layered model as
 * `db_query`'s SELECT-only role), and a full audit log of every statement
 * keyed to the calling principal.
 */

interface ExecuteParams {
  sql: string;
  params?: unknown[];
  format?: 'table' | 'json';
}

/** Reject a payload containing more than one statement (defense in depth —
 * the engine-enforced DML-only role is the primary boundary, this just
 * closes the "stacked query" injection shape). A single optional trailing
 * semicolon is allowed. */
function assertSingleStatement(statement: string): void {
  const body = statement.trim().replace(/;\s*$/, '');
  if (body.includes(';')) {
    throw new Error(
      'db_execute accepts exactly one SQL statement per call (no stacked queries separated by ";").',
    );
  }
  if (body.length === 0) {
    throw new Error('No SQL statement provided.');
  }
}

function formatResult(
  rows: Record<string, unknown>[],
  rowCount: number,
  format: 'table' | 'json',
): ToolResult {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  if (format === 'json') {
    return jsonResult({ rows: Array.from(rows), rowCount, columns });
  }

  if (rows.length === 0) {
    return {
      content: [{ type: 'text', text: `(${rowCount} row(s) affected)` }],
    };
  }

  const table = markdownTable(rows, { columns });
  return {
    content: [
      { type: 'text', text: `${table}\n(${rowCount} row(s) affected)` },
    ],
  };
}

/**
 * Execute a single ad-hoc DML (INSERT/UPDATE/DELETE) statement as the
 * DML-only `mcp_write` role. Returns any rows produced by a `RETURNING`
 * clause, plus the affected row count. Dev-only, like `db_migrate`.
 */
export async function execute(
  params: ExecuteParams,
  caller: McpCaller,
): Promise<ToolResult> {
  const { sql: statement, params: bindParams = [], format = 'json' } = params;
  const principal = auditPrincipal(caller);

  try {
    assertDevEnvironment();
    assertSingleStatement(statement);
  } catch (error) {
    const message = errorMessage(error);
    LOGGER.error(`[db_execute] rejected request (${principal}): ${message}`);
    return jsonResult({ success: false, error: message }, true);
  }

  let sql;
  try {
    sql = await getWriteSql();
  } catch (error) {
    const message = `Database unavailable: ${errorMessage(error)}`;
    LOGGER.error(`[db_execute] ${message} (${principal})`);
    return jsonResult({ success: false, error: message }, true);
  }

  LOGGER.info(`[db_execute] start (${principal}): ${statement}`);

  try {
    const rows = await sql.unsafe<Record<string, unknown>[]>(
      statement,
      bindParams as never[],
    );
    const rowCount = rows.count ?? rows.length;
    LOGGER.info(
      `[db_execute] done (${principal}): rowCount=${rowCount} returnedRows=${rows.length}`,
    );
    return formatResult(rows, rowCount, format);
  } catch (error) {
    const message = errorMessage(error);
    LOGGER.error(`[db_execute] FAILED (${principal}): ${message}`);
    return jsonResult({ success: false, error: message }, true);
  }
}
