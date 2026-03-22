import { githubGraphQL } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ReplyToThreadParams {
  threadId: string;
  body: string;
}

interface ReplyResponse {
  addPullRequestReviewThreadReply: {
    comment: { id: string; body: string };
  };
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

export async function replyToThread(
  params: ReplyToThreadParams,
): Promise<ToolResult> {
  try {
    const result = await githubGraphQL<ReplyResponse>(REPLY_MUTATION, {
      threadId: params.threadId,
      body: params.body,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              threadId: params.threadId,
              commentId: result.data.addPullRequestReviewThreadReply.comment.id,
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
          text: `Failed to reply to thread ${params.threadId}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
