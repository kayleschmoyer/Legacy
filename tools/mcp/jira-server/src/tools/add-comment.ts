import { jiraRequest } from '../jira-api.js';
import type { ToolResult } from '../types.js';

interface AddCommentParams {
  key: string;
  body: string;
}

export async function addComment(
  params: AddCommentParams,
): Promise<ToolResult> {
  const { key, body } = params;

  try {
    const result = await jiraRequest<{ id: string }>({
      method: 'POST',
      path: `/rest/api/3/issue/${key}/comment`,
      body: {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: body }],
            },
          ],
        },
      },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            key,
            commentId: result?.id,
            message: `Comment posted to ${key}`,
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
          text: JSON.stringify({
            success: false,
            error: `Failed to post comment to ${key}: ${message}`,
          }),
        },
      ],
    };
  }
}
