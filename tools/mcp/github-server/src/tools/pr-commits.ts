import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface PrCommitsParams {
  number: number;
  limit?: number;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    } | null;
  };
  html_url: string;
}

export async function prCommits(params: PrCommitsParams): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const limit = params.limit ?? 30;
    // Fetch one extra commit when limit < 100 to detect additional pages without
    // a follow-up API call. When limit >= 100 we can only fetch up to 100 per
    // the GitHub REST API, so fall back to best-effort detection.
    const fetchCount = limit < 100 ? Math.min(limit + 1, 100) : 100;

    const commits = await githubRest<GitHubCommit[]>({
      method: 'GET',
      path: `/repos/${repo.owner}/${repo.name}/pulls/${params.number}/commits`,
      query: { per_page: String(fetchCount) },
    });

    const hasMore =
      limit < 100 ? commits.length > limit : commits.length === 100;
    // Trim the sentinel commit we fetched to detect the next page
    const paginatedCommits = commits.slice(0, limit);

    const result = paginatedCommits.map((c) => ({
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0],
      author: c.commit.author?.name ?? 'unknown',
      date: c.commit.author?.date ?? null,
      url: c.html_url,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              prNumber: params.number,
              count: result.length,
              hasMore,
              commits: result,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to get commits for PR #${params.number}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
