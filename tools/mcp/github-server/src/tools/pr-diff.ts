import { getRepoOwnerName, getToken, invalidateToken } from '../auth.js';
import type { ToolResult } from '../types.js';

interface PrDiffParams {
  prNumber: number;
  maxBytes?: number;
}

// Empirically safe under the MCP result token cap (LS-9803): a 178,940-byte/3,696-line
// diff overflowed the transport's token limit even though it was well under the old
// 500,000-byte default, because token density (not byte count) is the real constraint.
const DEFAULT_MAX_BYTES = 100_000;
const BASE_URL = 'https://api.github.com';
const API_VERSION = '2022-11-28';

async function fetchPrDiff(
  owner: string,
  repoName: string,
  prNumber: number,
  canRetry: boolean,
): Promise<string> {
  const token = await getToken();
  const url = `${BASE_URL}/repos/${owner}/${repoName}/pulls/${prNumber}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.diff',
      'X-GitHub-Api-Version': API_VERSION,
    },
  });

  if (response.status === 401 && canRetry) {
    await invalidateToken();
    return fetchPrDiff(owner, repoName, prNumber, false);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub API GET /repos/${owner}/${repoName}/pulls/${prNumber} failed (${response.status}): ${text.slice(0, 2000)}`,
    );
  }

  return response.text();
}

export async function prDiff(params: PrDiffParams): Promise<ToolResult> {
  const maxBytes = params.maxBytes ?? DEFAULT_MAX_BYTES;
  try {
    const repo = await getRepoOwnerName();
    const raw = await fetchPrDiff(repo.owner, repo.name, params.prNumber, true);

    const truncated = raw.length > maxBytes;
    const diff = truncated ? raw.slice(0, maxBytes) : raw;

    return {
      content: [
        {
          type: 'text',
          text: truncated
            ? `${diff}\n\n[Diff truncated at ${maxBytes} bytes (full diff is ${raw.length} bytes). Increasing maxBytes risks exceeding the MCP result token cap on large PRs — prefer a targeted re-fetch (e.g. a single file's diff, or \`git diff --stat\`) over raising this value.]`
            : diff,
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to get diff for PR #${params.prNumber}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
