import { markdownTable } from '@legacy-sports/mcp-format';
import postgres from 'postgres';
import { getReadonlyConnectionInfo, getReadonlySql } from '../db.js';
import { errorMessage, jsonResult, type ToolResult } from '../types.js';

/** Placeholder the `postgres` driver emits in a CONNECT_TIMEOUT message when
 * the failure happens before its internal socket options are populated. */
const UNKNOWN_HOST_PORT = 'undefined:undefined';

interface QueryParams {
  query: string;
  format?: 'table' | 'json';
}

/** SQLSTATE Postgres raises when a statement is cancelled by statement_timeout. */
const STATEMENT_TIMEOUT_SQLSTATE = '57014';

/**
 * Execute a read-only SQL query against the dev database.
 *
 * Read-only is enforced two ways: the connection uses the SELECT-only
 * `mcp_readonly` role (engine-enforced), and the statement runs inside a
 * `READ ONLY` transaction. There is no write path.
 */
export async function query(params: QueryParams): Promise<ToolResult> {
  const { query: sqlQuery, format = 'json' } = params;

  let sql;
  try {
    sql = await getReadonlySql();
  } catch (error) {
    return jsonResult(
      {
        available: false,
        reason: `Database unavailable: ${errorMessage(error)}`,
      },
      false,
    );
  }

  const startedAt = Date.now();
  try {
    const rows = await sql.begin('READ ONLY', async (tx) =>
      tx.unsafe(sqlQuery),
    );
    return formatResult(rows, format);
  } catch (error) {
    return classifyQueryError(error, Date.now() - startedAt);
  }
}

/**
 * Classify a failed query into a named error so an agent can act correctly:
 * a statement_timeout means "rewrite the query", an upstream failure means
 * "retry", and any other Postgres error means "fix the query, don't retry
 * unchanged". Before this, both timeout and transport failures surfaced as
 * indistinguishable transport errors (LS-9536) — e.g. `write CONNECT_TIMEOUT
 * undefined:undefined` for a query that actually hit the 30s statement
 * budget, which reads identically to a genuine outage.
 */
function classifyQueryError(error: unknown, elapsedMs: number): ToolResult {
  if (
    error instanceof postgres.PostgresError &&
    error.code === STATEMENT_TIMEOUT_SQLSTATE
  ) {
    return jsonResult(
      {
        error: 'statement_timeout',
        elapsedMs,
        message: errorMessage(error),
        hint: 'The query exceeded the server-side statement_timeout — this is not a transport failure. Rewrite it rather than retrying unchanged: prefer a LATERAL join over DISTINCT ON on large tables, add a narrowing predicate, or split the query into smaller pieces.',
      },
      true,
    );
  }

  if (error instanceof postgres.PostgresError) {
    return jsonResult(
      {
        error: 'sql_error',
        elapsedMs,
        message: errorMessage(error),
        hint: 'The query itself failed (syntax, missing relation/column, or similar) — fix the query rather than retrying it unchanged.',
      },
      true,
    );
  }

  return jsonResult(
    {
      error: 'upstream_unavailable',
      elapsedMs,
      message: enrichConnectErrorMessage(errorMessage(error)),
      hint: 'The MCP transport (Lambda, API Gateway, or the database connection itself) failed before the query could complete — this is not a statement timeout. Retry once; if it fails again, the server may be down.',
    },
    true,
  );
}

/**
 * Fill in the real host:port on a driver error whose message contains the
 * `undefined:undefined` placeholder (LS-9590) — the client always knows the
 * host/port it last connected with, even when the driver's own error message
 * doesn't.
 */
function enrichConnectErrorMessage(message: string): string {
  if (!message.includes(UNKNOWN_HOST_PORT)) return message;
  const info = getReadonlyConnectionInfo();
  if (!info) return message;
  return message.split(UNKNOWN_HOST_PORT).join(`${info.host}:${info.port}`);
}

function formatResult(
  rows: Record<string, unknown>[],
  format: 'table' | 'json',
): ToolResult {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  if (format === 'json') {
    // Single object wrapping a row array — minified JSON (via jsonResult). The
    // result columns are SQL-dependent, so there is no fixed field set to prune;
    // rowCount and columns are kept as agent-consumed metadata.
    return jsonResult({
      rows: Array.from(rows),
      rowCount: rows.length,
      columns,
    });
  }

  if (rows.length === 0) {
    return { content: [{ type: 'text', text: '(0 rows)' }] };
  }

  // Flat, uniform row list -> compact Markdown table via the shared helper
  // (column headers written once, no alignment padding — epic LS-8018). The
  // trailing row count keeps the existing affordance for agents.
  const table = markdownTable(rows, { columns });

  return {
    content: [
      {
        type: 'text',
        text: `${table}\n(${rows.length} rows)`,
      },
    ],
  };
}
