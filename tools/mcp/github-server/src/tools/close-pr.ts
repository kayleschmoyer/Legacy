import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ClosePRParams {
  number: number;
  comment?: string;
}

interface ClosePRResponse {
  closePullRequest: {
    pullRequest: { number: number; state: string };
  };
}

interface AddCommentResponse {
  addComment: {
    commentEdge: { node: { id: string } };
  };
}

const CLOSE_PR_MUTATION = `
mutation($prId: ID!) {
  closePullRequest(input: { pullRequestId: $prId }) {
    pullRequest { number state }
  }
}`;

const ADD_COMMENT_MUTATION = `
mutation($subjectId: ID!, $body: String!) {
  addComment(input: { subjectId: $subjectId, body: $body }) {
    commentEdge { node { id } }
  }
}`;

const PR_ID_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) { id }
  }
}`;

interface PRIdResponse {
  repository: {
    pullRequest: { id: string } | null;
  };
}

/** Close a pull request with an optional comment. */
export async function closePR(params: ClosePRParams): Promise<ToolResult> {
  const { number, comment } = params;
  const normalized = comment?.trim();

  try {
    const repo = await getRepoOwnerName();

    // Look up the PR's node ID for GraphQL mutations
    const prIdResult = await githubGraphQL<PRIdResponse>(PR_ID_QUERY, {
      owner: repo.owner,
      repo: repo.name,
      number,
    });
    const prNode = prIdResult.data.repository.pullRequest;
    if (!prNode) {
      return {
        isError: true,
        content: [{ type: 'text', text: `PR #${number} not found.` }],
      };
    }
    const prId = prNode.id;

    // Add comment first (if provided) before closing
    if (normalized) {
      await githubGraphQL<AddCommentResponse>(ADD_COMMENT_MUTATION, {
        subjectId: prId,
        body: normalized,
      });
    }

    await githubGraphQL<ClosePRResponse>(CLOSE_PR_MUTATION, { prId });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              number,
              message: `PR #${number} closed${normalized ? ' with comment' : ''}`,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to close PR #${number}: ${message}`,
        },
      ],
    };
  }
}
