import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ListReviewsParams {
  number: number;
  author?: string;
}

interface GitHubReview {
  id: number;
  user: { login: string } | null;
  state: string;
  submitted_at: string;
  body: string;
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

    let filtered = reviews.map((r) => ({
      id: r.id,
      author: r.user?.login ?? 'unknown',
      state: r.state,
      submittedAt: r.submitted_at,
      body: r.body,
    }));

    if (params.author) {
      const authorLower = params.author.toLowerCase();
      filtered = filtered.filter((r) => r.author.toLowerCase() === authorLower);
    }

    const summary = {
      prNumber: params.number,
      total: reviews.length,
      returned: filtered.length,
      authorFilter: params.author ?? null,
      reviews: filtered,
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
