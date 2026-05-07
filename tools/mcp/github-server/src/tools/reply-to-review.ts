import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL, githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ReplyToReviewParams {
  body: string;
  /** GraphQL node ID of the review thread (preferred path). */
  threadId?: string;
  /** Numeric REST comment ID — use when you have `databaseId` from github_get_review_threads. Requires `number` too. */
  commentId?: number;
  /** PR number — required when using commentId. */
  number?: number;
}

interface GraphQLReplyResponse {
  addPullRequestReviewThreadReply: {
    comment: { id: string; body: string };
  };
}

interface RestReviewComment {
  id: number;
  html_url: string;
  body: string;
}

const REPLY_MUTATION = `
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
    comment {
      id
      body
    }
  }
}`;

interface ReplyToReviewRawInput {
  body: string;
  threadId?: string;
  commentId?: number;
  number?: number;
  prNumber?: number;
}

/**
 * Validates and resolves the raw tool input (which accepts both `number` and
 * `prNumber` as aliases) into a canonical `ReplyToReviewParams` shape, or
 * returns an `{ error }` object describing why the input is invalid.
 */
export function resolveReplyToReviewInput(
  params: ReplyToReviewRawInput,
): ReplyToReviewParams | { error: string } {
  if (params.number !== undefined && params.prNumber !== undefined) {
    return {
      error:
        'Ambiguous input: both "number" and "prNumber" were provided. Pass only one.',
    };
  }

  const resolvedNumber = params.number ?? params.prNumber;
  const hasThreadId = !!params.threadId;
  const hasRestPath =
    params.commentId !== undefined && resolvedNumber !== undefined;

  if (
    hasThreadId &&
    (params.commentId !== undefined || resolvedNumber !== undefined)
  ) {
    return {
      error:
        'Provide EITHER threadId OR (commentId + number/prNumber) — not both paths at once.',
    };
  }

  if (!hasThreadId && !hasRestPath) {
    return {
      error:
        'Provide either threadId (GraphQL node ID) or both commentId and number/prNumber (REST path).',
    };
  }

  return {
    body: params.body,
    threadId: params.threadId,
    commentId: params.commentId,
    number: resolvedNumber,
  };
}

/** Post a reply to a PR review thread or comment. Accepts either a GraphQL threadId or a REST commentId+PR number. */
export async function replyToReview(
  params: ReplyToReviewParams,
): Promise<ToolResult> {
  const { body, threadId, commentId, number: prNumber } = params;

  // GraphQL path — preferred when threadId is available
  if (threadId) {
    try {
      const result = await githubGraphQL<GraphQLReplyResponse>(REPLY_MUTATION, {
        threadId,
        body,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                threadId,
                commentNodeId:
                  result.data.addPullRequestReviewThreadReply.comment.id,
                body: result.data.addPullRequestReviewThreadReply.comment.body,
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
            text: `Failed to reply to thread ${threadId}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  // REST path — when only numeric commentId is available
  if (commentId !== undefined && prNumber !== undefined) {
    try {
      const repo = await getRepoOwnerName();
      const comment = await githubRest<RestReviewComment>({
        method: 'POST',
        path: `/repos/${repo.owner}/${repo.name}/pulls/${prNumber}/comments`,
        body: { body, in_reply_to: commentId },
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                commentDatabaseId: comment.id,
                body: comment.body,
                url: comment.html_url,
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
            text: `Failed to reply to comment #${commentId} on PR #${prNumber}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: 'Provide either threadId (GraphQL node ID) or both commentId and number (REST path).',
      },
    ],
  };
}
