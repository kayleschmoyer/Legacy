import { getRepoOwnerName } from '../auth.js';
import { githubRest, githubGraphQL } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface MergePRParams {
  number: number;
  strategy: 'queue' | 'direct';
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

export async function mergePR(params: MergePRParams): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    if (params.strategy === 'direct') {
      // Direct merge via REST API — bypasses merge queue (admin merge)
      const mergeResult = await githubRest<MergeResponse>({
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
                sha: mergeResult.sha,
                merged: mergeResult.merged,
                output: mergeResult.message,
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
    const message = error instanceof Error ? error.message : String(error);
    const isWorkflowScopeError =
      message.includes('workflow') &&
      (message.includes('without `workflow` scope') ||
        message.includes("without 'workflow' scope") ||
        message.includes('refusing to allow a Personal Access token'));
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: isWorkflowScopeError
            ? `Failed to merge PR #${params.number}: this PR modifies .github/workflows/ files and the configured PAT lacks the \`workflow\` OAuth scope. Ask the repo owner to either merge manually or add the \`workflow\` scope to the PAT in .env.local (GITHUB_TOKEN). Original error: ${message}`
            : `Failed to merge PR #${params.number} (strategy: ${params.strategy}): ${message}`,
        },
      ],
    };
  }
}
