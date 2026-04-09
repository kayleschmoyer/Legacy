import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface EditPRParams {
  number: number;
  title?: string;
  body?: string;
}

interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
}

/** Update a pull request's title and/or body. */
export async function editPR(params: EditPRParams): Promise<ToolResult> {
  const { number, title, body } = params;

  if (title === undefined && body === undefined) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'At least one of title or body must be provided.',
        },
      ],
    };
  }

  try {
    const repo = await getRepoOwnerName();
    const patchBody: Record<string, string> = {};
    if (title !== undefined) patchBody['title'] = title;
    if (body !== undefined) patchBody['body'] = body;

    const pr = await githubRest<PullRequest>({
      method: 'PATCH',
      path: `/repos/${repo.owner}/${repo.name}/pulls/${number}`,
      body: patchBody,
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              number: pr.number,
              title: pr.title,
              body: pr.body,
              url: pr.html_url,
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
          text: `Failed to edit PR #${number}: ${message}`,
        },
      ],
    };
  }
}
