import { getRepoOwnerName } from '../auth.js';
import { githubRest, githubGraphQL } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface MergePRParams {
  number: number;
  strategy: 'queue' | 'direct';
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

export async function mergePR(params: MergePRParams): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    if (params.strategy === 'direct') {
      // Direct merge via REST API — bypasses merge queue (admin merge)
      await githubRest({
        method: 'PUT',
        path: `/repos/${repo.owner}/${repo.name}/pulls/${params.number}/merge`,
        body: {
          merge_method: 'squash',
          commit_title: `PR #${params.number}`,
        },
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                prNumber: params.number,
                strategy: params.strategy,
                output: `PR #${params.number} merged directly via squash.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Queue strategy: enable auto-merge via GraphQL
    const prIdResult = await githubGraphQL<PRIdResponse>(PR_ID_QUERY, {
      owner: repo.owner,
      repo: repo.name,
      number: params.number,
    });
    const prNode = prIdResult.data.repository.pullRequest;
    if (!prNode) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `PR #${params.number} not found.`,
          },
        ],
      };
    }
    const prId = prNode.id;

    await githubGraphQL<EnableAutoMergeResponse>(ENABLE_AUTO_MERGE_MUTATION, {
      prId,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              prNumber: params.number,
              strategy: params.strategy,
              output: `PR #${params.number} enqueued for auto-merge (squash).`,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to merge PR #${params.number} (strategy: ${params.strategy}): ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
