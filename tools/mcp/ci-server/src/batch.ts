import type { ToolResult } from './types.js';

/**
 * Shared batch-tool helpers for the CI server, following the in-repo MCP
 * batch-tool convention (`.agents/skills/create/references/mcp-batch-tool-convention.md`).
 *
 * Per the self-contained-server doctrine, MCP servers do not import across each
 * other — this helper is copied and adapted into each server. Here it is adapted
 * to the CI server's local `ToolResult` type and uses `runId` as the natural key.
 */

export const MAX_BATCH_SIZE = 50;

/** A per-item failure. Identify by array index and, when available, the runId. */
export interface BatchFailure {
  index: number;
  runId?: number;
  error: string;
}

/** Whole-call failure (over-limit, empty, pre-flight validation). */
export function batchError(message: string): ToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: false, error: message }),
      },
    ],
  };
}

/**
 * Validate batch size up front. Returns a structured error result, or null to
 * proceed. Mirrors the Zod `.min(1).max(50)` guard for defense in depth.
 */
export function checkBatchSize(
  count: number,
  max = MAX_BATCH_SIZE,
): ToolResult | null {
  if (count === 0) {
    return batchError('Input array is empty. Provide at least one item.');
  }
  if (count > max) {
    return batchError(
      `Too many items (${count}). Maximum per call is ${max}. Split into batches.`,
    );
  }
  return null;
}

/**
 * Assemble the standard partial-failure result. `succeeded` items should each
 * carry their own index/runId so the caller can map them back to the input.
 * Sets `isError: true` when any item failed so the agent notices.
 */
export function assembleBatchResult<T>(
  total: number,
  succeeded: T[],
  failed: BatchFailure[],
  extra: Record<string, unknown> = {},
): ToolResult {
  const hasFailures = failed.length > 0;
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { success: !hasFailures, total, succeeded, failed, ...extra },
          null,
          2,
        ),
      },
    ],
    ...(hasFailures ? { isError: true } : {}),
  };
}

/**
 * Run a per-item async operation over a list with capped fan-out concurrency,
 * collecting outcomes into the standard succeeded/failed shape. The single-item
 * CI tools return a `ToolResult` (they catch their own errors and set `isError`
 * rather than throwing), so `runOne` returns that result and this helper
 * classifies it: `isError` → `failed[]`, otherwise the parsed JSON payload is
 * spread into `succeeded[]` alongside its index.
 */
export async function runBatch(
  runIds: number[],
  runOne: (runId: number) => Promise<ToolResult>,
  concurrency = 5,
): Promise<ToolResult> {
  const sizeError = checkBatchSize(runIds.length);
  if (sizeError) return sizeError;

  const succeeded: Array<Record<string, unknown>> = [];
  const failed: BatchFailure[] = [];

  for (let i = 0; i < runIds.length; i += concurrency) {
    const chunk = runIds.slice(i, i + concurrency);
    const settled = await Promise.all(
      chunk.map(async (runId, j) => {
        const index = i + j;
        try {
          const result = await runOne(runId);
          return { index, runId, result };
        } catch (error) {
          return {
            index,
            runId,
            result: {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: error instanceof Error ? error.message : String(error),
                },
              ],
            } satisfies ToolResult,
          };
        }
      }),
    );

    for (const { index, runId, result } of settled) {
      if (result.isError) {
        failed.push({
          index,
          runId,
          error: result.content[0]?.text ?? 'Unknown error',
        });
        continue;
      }
      try {
        const payload = JSON.parse(result.content[0].text) as Record<
          string,
          unknown
        >;
        succeeded.push({ index, ...payload });
      } catch {
        // The CI batch tools always return JSON on success, so a body we can't
        // parse signals an unexpected response from runOne — classify it as a
        // per-item failure rather than push a differently-shaped object into
        // succeeded[] (which would break the contract for batch consumers).
        const rawText = result.content[0]?.text ?? '';
        failed.push({
          index,
          runId,
          error: `Unexpected non-JSON response: ${rawText.slice(0, 200)}`,
        });
      }
    }
  }

  return assembleBatchResult(runIds.length, succeeded, failed);
}
