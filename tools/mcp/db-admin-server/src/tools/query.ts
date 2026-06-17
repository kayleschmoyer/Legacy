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
    return jsonResult({
      rows: Array.from(rows),
      rowCount: rows.length,
      columns,
    });
  }

  if (rows.length === 0) {
    return { content: [{ type: 'text', text: '(0 rows)' }] };
  }

  const widths = columns.map((col) =>
    Math.max(col.length, ...rows.map((r) => String(r[col] ?? '').length)),
  );

  const header = columns.map((col, i) => col.padEnd(widths[i])).join(' | ');
  const separator = widths.map((w) => '-'.repeat(w)).join('-+-');
  const body = rows
    .map((row) =>
      columns
        .map((col, i) => String(row[col] ?? '').padEnd(widths[i]))
        .join(' | '),
    )
    .join('\n');

  return {
    content: [
      {
        type: 'text',
        text: `${header}\n${separator}\n${body}\n(${rows.length} rows)`,
      },
    ],
  };
}
