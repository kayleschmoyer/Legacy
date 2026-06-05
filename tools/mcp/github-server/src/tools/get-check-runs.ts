import { LOGGER } from '@legacy-sports/logging/server';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import { resolveHeadShaFromPrNumber } from '../pr-utils.js';
import type { ToolResult } from '../types.js';

interface GetCheckRunsParams {
  prNumber?: number;
  sha?: string;
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

export async function getCheckRuns(
  params: GetCheckRunsParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    let sha: string | null = params.sha ?? null;

    if (!sha) {
      if (!params.prNumber) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Provide either "number"/"prNumber" (PR number to auto-resolve HEAD SHA) or "sha" (commit SHA).',
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

    const baseQuery: Record<string, string> = { per_page: '100' };
    if (params.checkName) {
      baseQuery.check_name = params.checkName;
    }

    let allCheckRuns: CheckRun[] = [];
    let totalCount = 0;
    let page = 1;

    while (true) {
      const pageData = await githubRest<CheckRunsResponse>({
        method: 'GET',
        path: `/repos/${repo.owner}/${repo.name}/commits/${sha}/check-runs`,
        query: { ...baseQuery, page: String(page) },
      });
      totalCount = pageData.total_count;
      allCheckRuns = allCheckRuns.concat(pageData.check_runs);
      if (
        allCheckRuns.length >= totalCount ||
        pageData.check_runs.length === 0
      ) {
        break;
      }
      page++;
    }

    // Deduplicate by name — keep the latest run per check name.
    // GitHub returns runs newest-first, so first occurrence wins.
    const seen = new Set<string>();
    const deduped: CheckRun[] = [];
    for (const run of allCheckRuns) {
      if (!seen.has(run.name)) {
        seen.add(run.name);
        deduped.push(run);
      }
    }

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
              checkRuns: deduped.map((run) => ({
                name: run.name,
                status: run.status,
                conclusion: run.conclusion,
                startedAt: run.started_at,
                completedAt: run.completed_at,
                output: {
                  title: run.output.title,
                  summary: run.output.summary,
                },
                app: run.app
                  ? { slug: run.app.slug, name: run.app.name }
                  : null,
              })),
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
