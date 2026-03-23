import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface MarkPRReadyParams {
  number: number;
}

interface PRNodeIdResponse {
  repository: {
    pullRequest: {
      id: string;
      isDraft: boolean;
    } | null;
  };
}

interface MarkReadyResponse {
  markPullRequestReadyForReview: {
    pullRequest: {
      number: number;
      isDraft: boolean;
      url: string;
    };
  };
}

const GET_PR_NODE_ID = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      isDraft
    }
  }
}`;

const MARK_READY_MUTATION = `
mutation($prId: ID!) {
  markPullRequestReadyForReview(input: { pullRequestId: $prId }) {
    pullRequest {
      number
      isDraft
      url
    }
  }
}`;

export async function markPRReady(
  params: MarkPRReadyParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    // Get the PR's GraphQL node ID
    const prResult = await githubGraphQL<PRNodeIdResponse>(GET_PR_NODE_ID, {
      owner: repo.owner,
      repo: repo.name,
      number: params.number,
    });

    const pr = prResult.data.repository.pullRequest;

    if (!pr) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `PR #${params.number} not found in ${repo.owner}/${repo.name}.`,
          },
        ],
      };
    }

    if (!pr.isDraft) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                number: params.number,
                alreadyReady: true,
                message: `PR #${params.number} is already marked as ready for review.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Mark as ready
    const result = await githubGraphQL<MarkReadyResponse>(MARK_READY_MUTATION, {
      prId: pr.id,
    });

    const updated = result.data.markPullRequestReadyForReview.pullRequest;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              number: updated.number,
              isDraft: updated.isDraft,
              url: updated.url,
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
          text: `Failed to mark PR #${params.number} as ready: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
