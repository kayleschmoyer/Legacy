// Token-efficient response formatting for android-server. The cross-server
// standard and helper live in `@legacy-sports/mcp-format`; this module
// re-exports `minifiedJson` and adds the single response envelope every tool
// here uses. Every android-server response is a single status object (device
// lists, boot/install/launch results, a screenshot path) — never a flat,
// uniform list — so minified JSON is the right format across the board, per
// mcp-response-format.md.

import { minifiedJson, truncate } from '@legacy-sports/mcp-format';
import type { ToolResult } from './types.js';

export { minifiedJson, truncate };

/** Wrap a payload in the MCP text-content envelope as minified JSON. */
export function jsonResult(payload: unknown, isError = false): ToolResult {
  const result: ToolResult = {
    content: [{ type: 'text', text: minifiedJson(payload) }],
  };
  if (isError) result.isError = true;
  return result;
}
