import { assembleBatchResult, checkBatchSize } from '../batch.js';
import type { BatchFailure } from '../batch.js';
import { rebasePR } from './rebase-pr.js';
import type { ToolResult } from '../types.js';

export interface BulkRebaseParams {
  numbers: number[];
}

interface BulkRebaseSuccess {
  index: number;
  number: number;
  branch?: string;
  base?: string;
  message: string;
}

interface RebaseResultPayload {
  success: boolean;
  number: number;
  branch?: string;
  base?: string;
  message?: string;
  error?: string;
}

/**
 * Rebase many PRs sequentially (rebase mutates the local checkout, so it
 * cannot run in parallel). Each rebase is independent — one failure does not
 * block the rest.
 */
export async function bulkRebase(
  params: BulkRebaseParams,
): Promise<ToolResult> {
  const sizeError = checkBatchSize(params.numbers.length);
  if (sizeError) return sizeError;

  const succeeded: BulkRebaseSuccess[] = [];
  const failed: BatchFailure[] = [];

  for (let i = 0; i < params.numbers.length; i++) {
    const number = params.numbers[i];
    try {
      const result = await rebasePR({ number });
      const text = result.content[0]?.text ?? '';
      let parsed: RebaseResultPayload | null = null;
      try {
        parsed = JSON.parse(text) as RebaseResultPayload;
      } catch {
        // Non-JSON output — treat as raw error message
      }

      if (result.isError || !parsed || parsed.success === false) {
        failed.push({
          index: i,
          key: number,
          error: parsed?.error ?? text ?? 'Rebase failed (no error message)',
        });
      } else {
        succeeded.push({
          index: i,
          number: parsed.number,
          branch: parsed.branch,
          base: parsed.base,
          message: parsed.message ?? `PR #${number} rebased`,
        });
      }
    } catch (err) {
      failed.push({
        index: i,
        key: number,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return assembleBatchResult(params.numbers.length, succeeded, failed);
}
