import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

export type IssueCommentWriteMethod = 'create' | 'update' | 'delete';

export interface IssueCommentWriteParams {
  method: IssueCommentWriteMethod;
  /** Issue or PR number. Required for "create"; ignored otherwise. */
  number?: number;
  /** Comment ID to update or delete. Required for "update"/"delete"; ignored for "create". */
  commentId?: number;
  /** Comment body (markdown). Required for "create"/"update"; ignored for "delete". */
  body?: string;
}

interface IssueComment {
  id: number;
  html_url: string;
  body: string;
}

/**
 * Create, update, or delete an issue/PR comment. GitHub treats PR comments as
 * issue comments under the hood, so this single tool covers both — there is
 * no separate PATCH/DELETE surface for pull request comments.
 */
export async function issueCommentWrite(
  params: IssueCommentWriteParams,
): Promise<ToolResult> {
  const { method, number, commentId, body } = params;

  if (method === 'create') {
    if (number === undefined) {
      return errorResult('"number" is required for method "create".');
    }
    if (body === undefined) {
      return errorResult('"body" is required for method "create".');
    }
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
            text: minifiedJson({
              success: true,
              commentId: comment.id,
              url: comment.html_url,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResult(
        `Failed to create comment on #${number}: ${errorMessage(error)}`,
      );
    }
  }

  if (method === 'update') {
    if (commentId === undefined) {
      return errorResult('"commentId" is required for method "update".');
    }
    if (body === undefined) {
      return errorResult('"body" is required for method "update".');
    }
    try {
      const repo = await getRepoOwnerName();
      const comment = await githubRest<IssueComment>({
        method: 'PATCH',
        path: `/repos/${repo.owner}/${repo.name}/issues/comments/${commentId}`,
        body: { body },
      });
      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              success: true,
              commentId: comment.id,
              url: comment.html_url,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResult(
        `Failed to update comment ${commentId}: ${errorMessage(error)}`,
      );
    }
  }

  // method === 'delete'
  if (commentId === undefined) {
    return errorResult('"commentId" is required for method "delete".');
  }
  try {
    const repo = await getRepoOwnerName();
    await githubRest<undefined>({
      method: 'DELETE',
      path: `/repos/${repo.owner}/${repo.name}/issues/comments/${commentId}`,
    });
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({ success: true, commentId, deleted: true }),
        },
      ],
    };
  } catch (error) {
    return errorResult(
      `Failed to delete comment ${commentId}: ${errorMessage(error)}`,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorResult(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}
