import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL, githubRest } from '../github-api.js';
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

interface PRIdResponse {
  repository: {
    pullRequest: { id: string } | null;
  };
}

interface EnableAutoMergeResponse {
  enablePullRequestAutoMerge: {
    pullRequest: { number: number; autoMergeRequest: { mergeMethod: string } };
  };
}

const PR_ID_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) { id }
  }
}`;

const ENABLE_AUTO_MERGE_MUTATION = `
mutation($prId: ID!) {
  enablePullRequestAutoMerge(input: { pullRequestId: $prId, mergeMethod: SQUASH }) {
    pullRequest { number autoMergeRequest { mergeMethod } }
  }
}`;

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

      const prIdResult = await githubGraphQL<PRIdResponse>(PR_ID_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        number: item.number,
      });
      const prNode = prIdResult.data.repository.pullRequest;
      if (!prNode) {
        throw new Error(`PR #${item.number} not found.`);
      }
      await githubGraphQL<EnableAutoMergeResponse>(ENABLE_AUTO_MERGE_MUTATION, {
        prId: prNode.id,
      });
      return {
        index,
        number: item.number,
        strategy,
        message: `PR #${item.number} enqueued for auto-merge (squash).`,
      };
    },
    { concurrency: 5, keyOf: (item) => item.number },
  );

  return assembleBatchResult(params.items.length, succeeded, failed);
}
