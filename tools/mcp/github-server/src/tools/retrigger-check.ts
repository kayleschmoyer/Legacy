import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import { resolveHeadShaFromPrNumber } from '../pr-utils.js';
import { FAILED_CONCLUSIONS } from '../types.js';
import type { ToolResult } from '../types.js';

interface RetriggerCheckParams {
  number: number;
  checkName?: string;
  allFailed?: boolean;
}

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

interface CheckRunsResponse {
  total_count: number;
  check_runs: CheckRun[];
}

export async function retriggerCheck(
  params: RetriggerCheckParams,
): Promise<ToolResult> {
  const repo = await getRepoOwnerName();

  // 1. Get head commit SHA
  const sha = await resolveHeadShaFromPrNumber(params.number);
  if (!sha) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `PR #${params.number} not found or has no commits.`,
        },
      ],
    };
  }

  // 2. List check runs for the commit (paginated)
  const baseQuery: Record<string, string> = { per_page: '100' };
  if (params.checkName) {
    baseQuery.check_name = params.checkName;
  }

  let allCheckRuns: CheckRun[] = [];
  let totalCount = 0;
  let page = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pageData = await githubRest<CheckRunsResponse>({
      method: 'GET',
      path: `/repos/${repo.owner}/${repo.name}/commits/${sha}/check-runs`,
      query: { ...baseQuery, page: String(page) },
    });
    totalCount = pageData.total_count;
    allCheckRuns = allCheckRuns.concat(pageData.check_runs);
    if (allCheckRuns.length >= totalCount || pageData.check_runs.length === 0) {
      break;
    }
    page++;
  }

  if (totalCount === 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: params.checkName
            ? `No check run named "${params.checkName}" found on PR #${params.number} (commit ${sha.slice(0, 7)}).`
            : `No check runs found on PR #${params.number} (commit ${sha.slice(0, 7)}).`,
        },
      ],
    };
  }

  // 3. Filter checks based on params:
  //    - checkName without allFailed: retrigger all matching (regardless of status)
  //    - allFailed (with or without checkName): retrigger only failed checks
  //    - neither: retrigger only failed checks (default behavior)
  let toRetrigger = allCheckRuns;
  if (params.checkName && !params.allFailed) {
    // Specific check requested — retrigger all matching runs (any status)
  } else {
    // Default or allFailed: filter to failed checks only
    toRetrigger = toRetrigger.filter(
      (c) =>
        c.conclusion !== null &&
        FAILED_CONCLUSIONS.has(c.conclusion.toUpperCase()),
    );
  }

  if (toRetrigger.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: 'No failed check runs to retrigger.',
              totalChecks: totalCount,
              sha: sha.slice(0, 7),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // 4. Re-request each check run
  const results: Array<{
    name: string;
    id: number;
    retriggered: boolean;
    error?: string;
  }> = [];

  for (const run of toRetrigger) {
    try {
      await githubRest<undefined>({
        method: 'POST',
        path: `/repos/${repo.owner}/${repo.name}/check-runs/${run.id}/rerequest`,
      });
      results.push({ name: run.name, id: run.id, retriggered: true });
    } catch (error) {
      results.push({
        name: run.name,
        id: run.id,
        retriggered: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const retriggered = results.filter((r) => r.retriggered).length;
  const failed = results.filter((r) => !r.retriggered).length;

  return {
    isError: failed > 0 ? true : undefined,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: failed === 0,
            pr: params.number,
            sha: sha.slice(0, 7),
            retriggered,
            failed,
            results,
          },
          null,
          2,
        ),
      },
    ],
  };
}
