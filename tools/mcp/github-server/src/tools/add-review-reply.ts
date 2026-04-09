import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface AddReviewReplyParams {
  number: number;
  commentId: number;
  body: string;
}

interface ReviewComment {
  id: number;
  html_url: string;
  body: string;
}

/** Post a reply to a PR review comment using the REST API (in_reply_to). */
export async function addReviewReply(
  params: AddReviewReplyParams,
): Promise<ToolResult> {
  const { number, commentId, body } = params;
  try {
    const repo = await getRepoOwnerName();
    const comment = await githubRest<ReviewComment>({
      method: 'POST',
      path: `/repos/${repo.owner}/${repo.name}/pulls/${number}/comments`,
      body: { body, in_reply_to: commentId },
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              commentId: comment.id,
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
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to reply to comment #${commentId} on PR #${number}: ${message}`,
        },
      ],
    };
  }
}
