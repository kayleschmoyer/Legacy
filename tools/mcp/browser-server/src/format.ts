// Token-efficient response formatting for browser-server (epic LS-8018 /
// LS-8030). The cross-server standard and the helper live in
// `@legacy-sports/mcp-format` (LS-8019); this module re-exports `minifiedJson`
// for the tools and pins the per-tool field sets (the first-order
// field-selection lever) with rationale.
//
// Format decision for browser-server: every response is a single status object
// or a heterogeneous object (e.g. browser_dev_status wraps a small servers
// array of two different shapes — managed vs scanned — alongside scalars). Per
// the standard, single-object / heterogeneous data is cheapest as minified JSON;
// a Markdown table is only a win for a flat, *uniform* list. The measurement
// harness (LS-8020) confirms this: encoding browser_dev_status as a table costs
// MORE tokens than minified JSON because the rows are non-uniform and nested in
// a parent object. So browser-server stays on minified JSON across the board —
// the savings come from field selection, not format.

import { minifiedJson } from '@legacy-sports/mcp-format';
import type { ToolResult } from './types.js';

export { minifiedJson };

/**
 * Wrap a payload in the MCP text-content envelope as minified JSON. Every
 * browser-server tool routes its response through here so the format is applied
 * once, never hand-rolled per tool.
 */
export function jsonResult(payload: unknown, isError = false): ToolResult {
  const result: ToolResult = {
    content: [{ type: 'text', text: minifiedJson(payload) }],
  };
  if (isError) result.isError = true;
  return result;
}

/**
 * Fields kept for a dev server row in browser_dev_status / browser_dev_stop.
 * The derived `url` (always `http://localhost:${port}`) is dropped — it is fully
 * reconstructable from `port`, which every row carries, and `browser_navigate`
 * accepts `port` directly, so no information an agent consumes is lost. Pruning
 * it removed ~18% of the browser_dev_status response tokens (LS-8020 harness).
 */
export const DEV_SERVER_FIELDS = [
  'port',
  'worktreePath',
  'pid',
  'startedAt',
  'managed',
  // Live TCP-probe result, present on managed rows only (browser_dev_status)
  // — the readiness signal callers poll for after browser_dev_start returns
  // early with ready: false (LS-8561). `pick` skips it where absent.
  'listening',
] as const;
