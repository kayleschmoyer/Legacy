/** Minimal MCP tool result type matching the SDK's CallToolResult. */
export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** Build a plain JSON text tool result. `isError` is only set when true. */
export function jsonResult(value: unknown, isError = false): ToolResult {
  const result: ToolResult = {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
  if (isError) result.isError = true;
  return result;
}

/** Normalize an unknown thrown value to a message string. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
