import { markdownTable, truncate } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

// Flat, uniform list → Markdown table (LS-8021). `shortSha` is kept alongside
// `sha` since agents reference both; the commit message is already reduced to
// its first line by the caller and truncated here so one verbose subject can't
// dominate the row.
const PR_COMMITS_COLUMNS = [
  'sha',
  'shortSha',
  'message',
  'author',
  'date',
  'url',
] as const;

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
      message: truncate(c.commit.message.split('\n')[0], 100),
      author: c.commit.author?.name ?? 'unknown',
      date: c.commit.author?.date ?? '',
      url: c.html_url,
    }));

    const text =
      result.length === 0
        ? `No commits found for PR #${params.number}.`
        : `${markdownTable(result, { columns: PR_COMMITS_COLUMNS })}\n\n_PR #${params.number}, count: ${result.length}${hasMore ? ', hasMore: true' : ''}_`;

    return {
      content: [{ type: 'text', text }],
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
