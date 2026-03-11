import { getSql } from '../db-connection.js';
import type { ToolResult } from '../types.js';

interface QueryParams {
  query: string;
  format?: 'table' | 'json';
  allowWrite?: boolean;
}

/** Statements that modify data or schema. */
const WRITE_PATTERNS =
  /^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i;

/** Validate a query is read-only unless writes are explicitly allowed. */
function validateQuery(query: string, allowWrite: boolean): string | null {
  if (allowWrite) return null;

  // Strip comments (-- and /* */) before checking
  const stripped = query
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  // Check each statement (split on semicolons)
  const statements = stripped.split(';').filter((s) => s.trim().length > 0);
  for (const stmt of statements) {
    if (WRITE_PATTERNS.test(stmt.trim())) {
      return `Write operation detected: "${stmt.trim().slice(0, 60)}...". Set allowWrite=true to permit writes.`;
    }
  }

  return null;
}

export async function query(params: QueryParams): Promise<ToolResult> {
  const { query: sqlQuery, format = 'json', allowWrite = false } = params;

  // Client-side validation
  const validationError = validateQuery(sqlQuery, allowWrite);
  if (validationError) {
    return {
      content: [{ type: 'text', text: validationError }],
      isError: true,
    };
  }

  const sql = getSql();

  try {
    // Use a read-only transaction unless writes are allowed
    if (!allowWrite) {
      const rows = await sql.begin('READ ONLY', async (tx) => {
        return tx.unsafe(sqlQuery);
      });

      return formatResult(rows, format);
    }

    // Write-enabled path
    const rows = await sql.unsafe(sqlQuery);
    return formatResult(rows, format);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
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
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { rows: Array.from(rows), rowCount: rows.length, columns },
            null,
            2,
          ),
        },
      ],
    };
  }

  // Table format
  if (rows.length === 0) {
    return {
      content: [{ type: 'text', text: '(0 rows)' }],
    };
  }

  // Calculate column widths
  const widths = columns.map((col) =>
    Math.max(
      col.length,
      ...rows.map((r: Record<string, unknown>) => String(r[col] ?? '').length),
    ),
  );

  const header = columns.map((col, i) => col.padEnd(widths[i])).join(' | ');
  const separator = widths.map((w) => '-'.repeat(w)).join('-+-');
  const body = rows
    .map((row: Record<string, unknown>) =>
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
