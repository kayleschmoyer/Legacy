import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ListReviewsParams {
  number: number;
  reviewer?: string;
  latestOnly?: boolean;
}

interface GitHubReview {
  id: number;
  user: { login: string } | null;
  state: string;
  submitted_at: string;
  body: string;
}

async function fetchReviewCommentCount(
  basePath: string,
  reviewId: number,
): Promise<number> {
  const commentsPath = `${basePath}/${reviewId}/comments`;
  let count = 0;
  let page = 1;
  const perPage = 100;
  while (true) {
    const batch = await githubRest<unknown[]>({
      method: 'GET',
      path: commentsPath,
      query: { per_page: String(perPage), page: String(page) },
    });
    count += batch.length;
    if (batch.length < perPage) break;
    page++;
  }
  return count;
}

export async function listReviews(
  params: ListReviewsParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const path = `/repos/${repo.owner}/${repo.name}/pulls/${params.number}/reviews`;

    const reviews: GitHubReview[] = [];
    let page = 1;
    const perPage = 100;
    while (true) {
      const batch = await githubRest<GitHubReview[]>({
        method: 'GET',
        path,
        query: { per_page: String(perPage), page: String(page) },
      });
      reviews.push(...batch);
      if (batch.length < perPage) break;
      page++;
    }

    let mapped = reviews.map((r) => ({
      id: r.id,
      reviewer: r.user?.login ?? 'unknown',
      state: r.state,
      submittedAt: r.submitted_at,
      bodyLength: r.body.length,
    }));

    if (params.reviewer) {
      const reviewerLower = params.reviewer.toLowerCase();
      mapped = mapped.filter((r) => r.reviewer.toLowerCase() === reviewerLower);
    }

    const latestOnly = params.latestOnly !== false;
    if (latestOnly) {
      const seen = new Map<string, (typeof mapped)[number]>();
      for (const r of mapped) {
        const existing = seen.get(r.reviewer);
        if (!existing || r.submittedAt > existing.submittedAt) {
          seen.set(r.reviewer, r);
        }
      }
      mapped = Array.from(seen.values());
    }

    const withComments = await Promise.all(
      mapped.map(async (r) => ({
        reviewer: r.reviewer,
        state: r.state,
        submittedAt: r.submittedAt,
        bodyLength: r.bodyLength,
        commentCount: await fetchReviewCommentCount(path, r.id),
      })),
    );

    const summary = {
      prNumber: params.number,
      total: reviews.length,
      returned: withComments.length,
      reviewerFilter: params.reviewer ?? null,
      latestOnly,
      reviews: withComments,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list reviews for PR #${params.number}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
