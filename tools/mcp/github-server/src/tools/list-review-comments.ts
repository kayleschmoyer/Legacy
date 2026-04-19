import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ListReviewCommentsParams {
  number: number;
  since?: string;
  reviewId?: number;
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

interface ReviewComment {
  id: number;
  inReplyToId: number | null;
  user: string;
  path: string;
  line: number | null;
  body: string;
  createdAt: string;
  reviewId: number | null;
}

const PAGE_SIZE = 100;

export async function listReviewComments(
  params: ListReviewCommentsParams,
): Promise<ToolResult> {
  const { number, since, reviewId } = params;
  try {
    const repo = await getRepoOwnerName();
    const basePath = `/repos/${repo.owner}/${repo.name}/pulls/${number}/comments`;

    const allComments: ReviewComment[] = [];
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
          user: c.user?.login ?? 'unknown',
          path: c.path,
          line: c.line ?? c.original_line ?? null,
          body: c.body,
          createdAt: c.created_at,
          reviewId: c.pull_request_review_id,
        });
      }

      if (batch.length < PAGE_SIZE) break;
      page++;
    }

    const filtered =
      reviewId !== undefined
        ? allComments.filter((c) => c.reviewId === reviewId)
        : allComments;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              number,
              total: filtered.length,
              filteredBySince: since ?? null,
              filteredByReviewId: reviewId ?? null,
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
          text: `Failed to list review comments for PR #${number}: ${message}`,
        },
      ],
    };
  }
}
