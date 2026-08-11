import { rebasePRViaApi, rebasePRWorker } from './rebase-pr.js';
import { isLambda } from '../auth.js';
import { assembleBatchResult, checkBatchSize } from '../batch.js';
import type { BatchFailure } from '../batch.js';
import { runWithSyncBudget, withCheckoutLock } from '../jobs.js';
import type { JobLogger } from '../jobs.js';
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
 *
 * N sequential rebases easily exceed the ~60s MCP transport timeout, so stdio
 * deployments run the loop as a background job under a bounded sync budget:
 * small batches return the batch result inline; larger ones return
 * { jobId, status: "running" } — poll with github_job_wait, which reports
 * per-PR progress in logTail and the final batch result once done.
 */
export async function bulkRebase(
  params: BulkRebaseParams,
): Promise<ToolResult> {
  const sizeError = checkBatchSize(params.numbers.length);
  if (sizeError) return sizeError;

  if (isLambda()) return bulkRebaseWorker(params);
  return runWithSyncBudget(`bulk-rebase ${params.numbers.length} PRs`, (log) =>
    bulkRebaseWorker(params, log),
  );
}

async function bulkRebaseWorker(
  params: BulkRebaseParams,
  jobLog: JobLogger = () => undefined,
): Promise<ToolResult> {
  const total = params.numbers.length;
  const succeeded: BulkRebaseSuccess[] = [];
  const failed: BatchFailure[] = [];

  for (let i = 0; i < params.numbers.length; i++) {
    const number = params.numbers[i];
    try {
      // Lambda has no git binary (LS-7753): use the API-based rebase, which
      // needs no local checkout lock since it doesn't mutate one.
      const result = isLambda()
        ? await rebasePRViaApi({ number })
        : await withCheckoutLock(() =>
            rebasePRWorker({ number }, (line) => jobLog(`#${number}: ${line}`)),
          );
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
        jobLog(`PR #${number} (${i + 1}/${total}): FAILED`);
      } else {
        succeeded.push({
          index: i,
          number: parsed.number,
          branch: parsed.branch,
          base: parsed.base,
          message: parsed.message ?? `PR #${number} rebased`,
        });
        jobLog(`PR #${number} (${i + 1}/${total}): rebased`);
      }
    } catch (err) {
      failed.push({
        index: i,
        key: number,
        error: err instanceof Error ? err.message : String(err),
      });
      jobLog(`PR #${number} (${i + 1}/${total}): FAILED`);
    }
  }

  return assembleBatchResult(params.numbers.length, succeeded, failed);
}
