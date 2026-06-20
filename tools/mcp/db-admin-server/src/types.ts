import { minifiedJson } from '@legacy-sports/mcp-format';

/** Minimal MCP tool result type matching the SDK's CallToolResult. */
export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Build a JSON text tool result. Serializes as minified JSON (the
 * `@legacy-sports/mcp-format` standard floor, epic LS-8018) — these payloads are
 * single objects / few scalars (availability, migration status, migrate result),
 * for which a table adds no value and pretty-printing only spends tokens on
 * structural whitespace. `isError` is only set when true.
 */
export function jsonResult(value: unknown, isError = false): ToolResult {
  const result: ToolResult = {
    content: [{ type: 'text', text: minifiedJson(value) }],
  };
  if (isError) result.isError = true;
  return result;
}

/** Normalize an unknown thrown value to a message string. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
