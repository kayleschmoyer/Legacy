import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ListPRCommentsParams {
  number: number;
  since?: string;
}

interface IssueCommentResponse {
  id: number;
  html_url: string;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string } | null;
}

interface CommentSummary {
  id: number;
  author: string;
  body: string;
  created_at: string;
  updated_at: string;
  url: string;
}

const PAGE_SIZE = 100;

export async function listPRComments(
  params: ListPRCommentsParams,
): Promise<ToolResult> {
  const { number, since } = params;
  try {
    const repo = await getRepoOwnerName();
    const basePath = `/repos/${repo.owner}/${repo.name}/issues/${number}/comments`;

    const allComments: CommentSummary[] = [];
    let page = 1;

    while (true) {
      const query: Record<string, string> = {
        per_page: String(PAGE_SIZE),
        page: String(page),
      };
      if (since) query['since'] = since;

      const batch = await githubRest<IssueCommentResponse[]>({
        method: 'GET',
        path: basePath,
        query,
      });

      for (const c of batch) {
        allComments.push({
          id: c.id,
          author: c.user?.login ?? 'unknown',
          body: c.body,
          created_at: c.created_at,
          updated_at: c.updated_at,
          url: c.html_url,
        });
      }

      if (batch.length < PAGE_SIZE) break;
      page++;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { number, total: allComments.length, comments: allComments },
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
          text: `Failed to list comments for PR/issue #${number}: ${message}`,
        },
      ],
    };
  }
}
