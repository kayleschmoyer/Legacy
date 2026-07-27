import { minifiedJson } from '@legacy-sports/mcp-format';
import { githubGraphQL } from '../github-api.js';
import { resolvePullRequestNodeId } from '../pr-utils.js';
import type { ToolResult } from '../types.js';

interface ReopenPRParams {
  number: number;
  comment?: string;
}

interface ReopenPRResponse {
  reopenPullRequest: {
    pullRequest: { number: number; state: string };
  };
}

interface AddCommentResponse {
  addComment: {
    commentEdge: { node: { id: string } };
  };
}

const REOPEN_PR_MUTATION = `
mutation($prId: ID!) {
  reopenPullRequest(input: { pullRequestId: $prId }) {
    pullRequest { number state }
  }
}`;

const ADD_COMMENT_MUTATION = `
mutation($subjectId: ID!, $body: String!) {
  addComment(input: { subjectId: $subjectId, body: $body }) {
    commentEdge { node { id } }
  }
}`;

/** Reopen a closed pull request with an optional comment. */
export async function reopenPR(params: ReopenPRParams): Promise<ToolResult> {
  const { number, comment } = params;
  const normalized = comment?.trim();

  try {
    const prId = await resolvePullRequestNodeId(number);
    if (!prId) {
      return {
        isError: true,
        content: [{ type: 'text', text: `PR #${number} not found.` }],
      };
    }

    await githubGraphQL<ReopenPRResponse>(REOPEN_PR_MUTATION, { prId });

    // Add comment after reopening so it's clear the comment applies to the
    // reopened state (mirrors github_close_pr's before-close ordering, just
    // flipped since there's nothing to explain until the PR is open again).
    if (normalized) {
      await githubGraphQL<AddCommentResponse>(ADD_COMMENT_MUTATION, {
        subjectId: prId,
        body: normalized,
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: true,
            number,
            message: `PR #${number} reopened${normalized ? ' with comment' : ''}`,
          }),
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
          text: `Failed to reopen PR #${number}: ${message}`,
        },
      ],
    };
  }
}
