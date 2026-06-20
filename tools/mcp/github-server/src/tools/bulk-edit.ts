import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import { assembleBatchResult, checkBatchSize, runBatch } from '../batch.js';
import type { ToolResult } from '../types.js';

export interface BulkEditItem {
  number: number;
  title?: string;
  body?: string;
}

export interface BulkEditParams {
  items: BulkEditItem[];
}

interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
}

interface BulkEditSuccess {
  index: number;
  number: number;
  title: string;
  body: string | null;
  url: string;
}

/**
 * Edit title and/or body on many PRs in one call. Labels are intentionally
 * out of scope — use `github_manage_labels` (which already accepts an array
 * of PR numbers) for label changes across PRs.
 */
export async function bulkEdit(params: BulkEditParams): Promise<ToolResult> {
  const sizeError = checkBatchSize(params.items.length);
  if (sizeError) return sizeError;

  const repo = await getRepoOwnerName();

  const { succeeded, failed } = await runBatch<BulkEditItem, BulkEditSuccess>(
    params.items,
    async (item, index) => {
      if (item.title === undefined && item.body === undefined) {
        throw new Error('At least one of title or body must be provided.');
      }
      const patchBody: Record<string, string> = {};
      if (item.title !== undefined) patchBody['title'] = item.title;
      if (item.body !== undefined) patchBody['body'] = item.body;

      const pr = await githubRest<PullRequest>({
        method: 'PATCH',
        path: `/repos/${repo.owner}/${repo.name}/pulls/${item.number}`,
        body: patchBody,
      });

      return {
        index,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        url: pr.html_url,
      };
    },
    { concurrency: 5, keyOf: (item) => item.number },
  );

  return assembleBatchResult(params.items.length, succeeded, failed);
}
