import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Re-export the SDK result type under a short local alias. */
export type ToolResult = CallToolResult;

/**
 * Rollbar API responses are wrapped in an envelope: `{ err, result }` on
 * success (err === 0) or `{ err, message }` on failure (err !== 0).
 */
export interface RollbarEnvelope<T> {
  err: number;
  result?: T;
  message?: string;
}
