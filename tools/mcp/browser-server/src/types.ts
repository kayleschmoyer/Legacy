/** Minimal MCP tool result type matching the SDK's CallToolResult. */
export interface ToolResult {
  [key: string]: unknown;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  >;
  isError?: boolean;
}
