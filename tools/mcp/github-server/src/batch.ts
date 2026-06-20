import type { ToolResult } from './types.js';

export const MAX_BATCH_SIZE = 50;

/** A per-item failure. Identify by array index and, when available, a natural key. */
export interface BatchFailure {
  index: number;
  key?: string | number;
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

/** Validate batch size up front. Returns a structured error result, or null to proceed. */
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
 * carry their own index/key so the caller can map them back to the input.
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
          {
            success: !hasFailures,
            total,
            succeeded,
            failed,
            ...extra,
          },
          null,
          2,
        ),
      },
    ],
    ...(hasFailures ? { isError: true } : {}),
  };
}

/**
 * Run an async task per input item with bounded concurrency. Each task either
 * resolves to a success value or throws — thrown errors are caught and routed
 * to `failed[]` rather than aborting the batch.
 */
export async function runBatch<TItem, TSuccess>(
  items: TItem[],
  task: (item: TItem, index: number) => Promise<TSuccess>,
  options: {
    concurrency?: number;
    keyOf?: (item: TItem) => string | number | undefined;
  } = {},
): Promise<{ succeeded: TSuccess[]; failed: BatchFailure[] }> {
  const concurrency = options.concurrency ?? 5;
  const keyOf = options.keyOf;
  const succeeded: TSuccess[] = [];
  const failed: BatchFailure[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.all(
      chunk.map(async (item, j) => {
        const index = i + j;
        try {
          const value = await task(item, index);
          return { ok: true as const, index, value };
        } catch (err) {
          return {
            ok: false as const,
            index,
            key: keyOf ? keyOf(item) : undefined,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
    for (const r of settled) {
      if (r.ok) succeeded.push(r.value);
      else failed.push({ index: r.index, key: r.key, error: r.error });
    }
  }

  return { succeeded, failed };
}
