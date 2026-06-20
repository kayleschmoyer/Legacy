import { markdownTable } from '@legacy-sports/mcp-format';
import { getReadonlySql } from '../db.js';
import { errorMessage, jsonResult, type ToolResult } from '../types.js';

interface QueryParams {
  query: string;
  format?: 'table' | 'json';
}

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

  try {
    const rows = await sql.begin('READ ONLY', async (tx) =>
      tx.unsafe(sqlQuery),
    );
    return formatResult(rows as unknown as Record<string, unknown>[], format);
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Query failed: ${errorMessage(error)}` }],
      isError: true,
    };
  }
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
