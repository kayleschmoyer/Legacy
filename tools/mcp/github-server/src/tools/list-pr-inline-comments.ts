import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ListPRInlineCommentsParams {
  number: number;
  path?: string;
  since?: string;
}

interface ReviewCommentResponse {
  id: number;
  in_reply_to_id?: number;
  html_url: string;
  body: string;
  path: string;
  line: number | null;
  original_line?: number | null;
  diff_hunk: string;
  created_at: string;
  updated_at: string;
  user: { login: string } | null;
  pull_request_review_id: number | null;
}

interface InlineComment {
  id: number;
  inReplyToId: number | null;
  author: string;
  body: string;
  path: string;
  line: number | null;
  diffHunk: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

const PAGE_SIZE = 100;

export async function listPRInlineComments(
  params: ListPRInlineCommentsParams,
): Promise<ToolResult> {
  const { number, path: filePath, since } = params;
  try {
    const repo = await getRepoOwnerName();
    const basePath = `/repos/${repo.owner}/${repo.name}/pulls/${number}/comments`;

    const allComments: InlineComment[] = [];
    let page = 1;

    while (true) {
      const query: Record<string, string> = {
        per_page: String(PAGE_SIZE),
        page: String(page),
      };
      if (since) query['since'] = since;

      const batch = await githubRest<ReviewCommentResponse[]>({
        method: 'GET',
        path: basePath,
        query,
      });

      for (const c of batch) {
        allComments.push({
          id: c.id,
          inReplyToId: c.in_reply_to_id ?? null,
          author: c.user?.login ?? 'unknown',
          body: c.body,
          path: c.path,
          line: c.line ?? c.original_line ?? null,
          diffHunk: c.diff_hunk,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          url: c.html_url,
        });
      }

      if (batch.length < PAGE_SIZE) break;
      page++;
    }

    const filtered = filePath
      ? allComments.filter((c) => c.path === filePath)
      : allComments;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              number,
              total: filtered.length,
              filteredByPath: filePath ?? null,
              comments: filtered,
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
          text: `Failed to list inline comments for PR #${number}: ${message}`,
        },
      ],
    };
  }
}
