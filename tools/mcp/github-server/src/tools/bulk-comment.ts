import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import { assembleBatchResult, checkBatchSize, runBatch } from '../batch.js';
import type { ToolResult } from '../types.js';

export interface BulkCommentItem {
  number: number;
  body: string;
}

export interface BulkCommentParams {
  items: BulkCommentItem[];
}

interface IssueComment {
  id: number;
  html_url: string;
  body: string;
}

interface BulkCommentSuccess {
  index: number;
  number: number;
  commentId: number;
  url: string;
}

/** Post a general (top-level) comment on many PRs in one call. */
export async function bulkComment(
  params: BulkCommentParams,
): Promise<ToolResult> {
  const sizeError = checkBatchSize(params.items.length);
  if (sizeError) return sizeError;

  const repo = await getRepoOwnerName();

  const { succeeded, failed } = await runBatch<
    BulkCommentItem,
    BulkCommentSuccess
  >(
    params.items,
    async (item, index) => {
      const comment = await githubRest<IssueComment>({
        method: 'POST',
        path: `/repos/${repo.owner}/${repo.name}/issues/${item.number}/comments`,
        body: { body: item.body },
      });
      return {
        index,
        number: item.number,
        commentId: comment.id,
        url: comment.html_url,
      };
    },
    { concurrency: 5, keyOf: (item) => item.number },
  );

  return assembleBatchResult(params.items.length, succeeded, failed);
}
