import { LOGGER } from '@legacy-sports/logging/server';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import { resolveHeadShaFromPrNumber } from '../pr-utils.js';
import type { ToolResult } from '../types.js';

interface GetCheckRunsParams {
  prNumber?: number;
  sha?: string;
  shas?: string[];
  checkName?: string;
}

interface CheckRunOutput {
  title: string | null;
  summary: string | null;
}

interface CheckRunApp {
  slug: string;
  name: string;
}

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  output: CheckRunOutput;
  app: CheckRunApp | null;
}

interface CheckRunsResponse {
  total_count: number;
  check_runs: CheckRun[];
}

interface SerializedCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  output: CheckRunOutput;
  app: CheckRunApp | null;
}

const BATCH_CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await task(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function fetchCheckRunsForSha(
  owner: string,
  repo: string,
  sha: string,
  checkName: string | undefined,
): Promise<SerializedCheckRun[]> {
  const baseQuery: Record<string, string> = { per_page: '100' };
  if (checkName) {
    baseQuery.check_name = checkName;
  }

  let allCheckRuns: CheckRun[] = [];
  let totalCount = 0;
  let page = 1;

  while (true) {
    const pageData = await githubRest<CheckRunsResponse>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/commits/${sha}/check-runs`,
      query: { ...baseQuery, page: String(page) },
    });
    totalCount = pageData.total_count;
    allCheckRuns = allCheckRuns.concat(pageData.check_runs);
    if (allCheckRuns.length >= totalCount || pageData.check_runs.length === 0) {
      break;
    }
    page++;
  }

  // Deduplicate by name — keep the latest run per check name.
  // GitHub returns runs newest-first, so first occurrence wins.
  const seen = new Set<string>();
  const deduped: SerializedCheckRun[] = [];
  for (const run of allCheckRuns) {
    if (!seen.has(run.name)) {
      seen.add(run.name);
      deduped.push({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        output: {
          title: run.output.title,
          summary: run.output.summary,
        },
        app: run.app ? { slug: run.app.slug, name: run.app.name } : null,
      });
    }
  }
  return deduped;
}

export async function getCheckRuns(
  params: GetCheckRunsParams,
): Promise<ToolResult> {
  const repo = await getRepoOwnerName();

  if (params.shas && params.shas.length > 0) {
    return getCheckRunsBatch(repo, params.shas, params.checkName);
  }

  try {
    let sha: string | null = params.sha ?? null;

    if (!sha) {
      if (!params.prNumber) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Provide "shas" (commit SHAs to batch), "number"/"prNumber" (PR number to auto-resolve HEAD SHA), or "sha" (commit SHA).',
            },
          ],
        };
      }
      sha = await resolveHeadShaFromPrNumber(params.prNumber);
      if (!sha) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `PR #${params.prNumber} not found or has no commits.`,
            },
          ],
        };
      }
    }

    const deduped = await fetchCheckRunsForSha(
      repo.owner,
      repo.name,
      sha,
      params.checkName,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sha,
              shortSha: sha.slice(0, 7),
              ...(params.prNumber !== undefined && { pr: params.prNumber }),
              total: deduped.length,
              checkRuns: deduped,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const ref =
      params.sha ?? (params.prNumber ? `PR #${params.prNumber}` : 'unknown');
    LOGGER.error(
      `Failed to get check runs for ${ref}`,
      error instanceof Error ? error : new Error(String(error)),
    );
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to get check runs for ${ref}: ${message}`,
        },
      ],
    };
  }
}

async function getCheckRunsBatch(
  repo: { owner: string; name: string },
  shas: string[],
  checkName: string | undefined,
): Promise<ToolResult> {
  const checkRuns: Record<string, SerializedCheckRun[]> = {};
  const missing: { sha: string; error: string }[] = [];

  await mapWithConcurrency(shas, BATCH_CONCURRENCY, async (sha) => {
    try {
      checkRuns[sha] = await fetchCheckRunsForSha(
        repo.owner,
        repo.name,
        sha,
        checkName,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LOGGER.error(
        `Failed to get check runs for ${sha}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      missing.push({ sha, error: message });
    }
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ checkRuns, missing }, null, 2),
      },
    ],
  };
}
