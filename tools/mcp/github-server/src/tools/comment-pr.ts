import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface CommentPRParams {
  number: number;
  body: string;
}

interface IssueComment {
  id: number;
  html_url: string;
  body: string;
}

/** Post a general (top-level) comment on a pull request. */
export async function commentPR(params: CommentPRParams): Promise<ToolResult> {
  const { number, body } = params;
  try {
    const repo = await getRepoOwnerName();
    const comment = await githubRest<IssueComment>({
      method: 'POST',
      path: `/repos/${repo.owner}/${repo.name}/issues/${number}/comments`,
      body: { body },
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              commentId: comment.id,
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
          text: `Failed to comment on PR #${number}: ${message}`,
        },
      ],
    };
  }
}
