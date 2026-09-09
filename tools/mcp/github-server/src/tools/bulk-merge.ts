import { fetchPrLabels } from './manage-labels.js';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import { assembleBatchResult, checkBatchSize, runBatch } from '../batch.js';
import type { ToolResult } from '../types.js';

export interface BulkMergeItem {
  number: number;
  strategy?: 'queue' | 'direct';
}

export interface BulkMergeParams {
  items: BulkMergeItem[];
}

interface MergeResponse {
  sha: string;
  merged: boolean;
  message: string;
}

// This repo's merge queue (.github/workflows/merge-queue.yml) is a custom
// label-based workflow, not GitHub's native merge queue/auto-merge feature —
// see docs/ci-cd/merge-queue-guide.md. It watches for this label; nothing
// else enqueues a PR into it.
const MERGE_WHEN_READY_LABEL = 'merge-when-ready';

interface BulkMergeSuccess {
  index: number;
  number: number;
  strategy: 'queue' | 'direct';
  sha?: string;
  merged?: boolean;
  message: string;
}

/** Merge many PRs in one call. Partial failures are reported, never thrown. */
export async function bulkMerge(params: BulkMergeParams): Promise<ToolResult> {
  const sizeError = checkBatchSize(params.items.length);
  if (sizeError) return sizeError;

  const repo = await getRepoOwnerName();

  const { succeeded, failed } = await runBatch<BulkMergeItem, BulkMergeSuccess>(
    params.items,
    async (item, index) => {
      const strategy = item.strategy ?? 'queue';

      if (strategy === 'direct') {
        const mergeResult = await githubRest<MergeResponse>({
          method: 'PUT',
          path: `/repos/${repo.owner}/${repo.name}/pulls/${item.number}/merge`,
          body: {
            merge_method: 'squash',
            commit_title: `PR #${item.number}`,
          },
        });
        return {
          index,
          number: item.number,
          strategy,
          sha: mergeResult.sha,
          merged: mergeResult.merged,
          message: mergeResult.message,
        };
      }

      // Queue strategy: apply the merge-when-ready label — that is what
      // actually enqueues the PR into this repo's custom merge-queue
      // workflow (GitHub's native `enablePullRequestAutoMerge` GraphQL
      // mutation is a no-op here, so a caller trusting that mutation's
      // success gets a false positive — see LS-9851/merge-pr.ts).
      const labelsPath = `/repos/${repo.owner}/${repo.name}/issues/${item.number}/labels`;
      try {
        await githubRest({
          method: 'POST',
          path: labelsPath,
          body: { labels: [MERGE_WHEN_READY_LABEL] },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('(404)')) {
          throw new Error(`PR #${item.number} not found.`);
        }
        throw error;
      }

      // Verify the label actually took before reporting success — GitHub's
      // Labels API can 200 without applying the label on a permission edge
      // case, and trusting the POST response alone reproduces the exact
      // silent-failure bug this fix addresses (LS-9851).
      const currentLabels = await fetchPrLabels(labelsPath);
      if (!currentLabels.includes(MERGE_WHEN_READY_LABEL)) {
        throw new Error(
          `PR #${item.number}: applied the ${MERGE_WHEN_READY_LABEL} label but it is not present on the PR afterward — the enqueue did not take effect. Merge manually via strategy: "direct" instead.`,
        );
      }

      return {
        index,
        number: item.number,
        strategy,
        message: `PR #${item.number} labeled ${MERGE_WHEN_READY_LABEL} — the merge queue will process it automatically once all required checks pass.`,
      };
    },
    { concurrency: 5, keyOf: (item) => item.number },
  );

  return assembleBatchResult(params.items.length, succeeded, failed);
}
