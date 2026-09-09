import { LOGGER } from '@legacy-sports/logging/server';
import {
  markdownTable,
  minifiedJson,
  truncate,
} from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import { resolveHeadShaFromPrNumber } from '../pr-utils.js';
import type { ToolResult } from '../types.js';

interface GetCheckRunsParams {
  prNumber?: number;
  sha?: string;
  shas?: string[];
  checkName?: string;
  resolveRunId?: boolean;
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
  details_url: string | null;
  html_url: string | null;
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
  workflowRunId?: number;
  jobId?: number;
  detailsUrl?: string;
}

const BATCH_CONCURRENCY = 5;

// Parse workflowRunId and jobId from GitHub Actions URLs.
// details_url pattern: .../actions/runs/<runId>/job/<jobId>
// html_url pattern:    .../actions/runs/<runId>/job/<jobId>
// Exported so other tools (e.g. retrigger-check.ts) can resolve a check
// run's owning Actions workflow run without duplicating the parse logic.
export function parseRunIds(
  run: Pick<CheckRun, 'details_url' | 'html_url'>,
): { workflowRunId: number; jobId: number; detailsUrl: string } | undefined {
  const url = run.details_url ?? run.html_url;
  if (!url) return undefined;
  const m = /\/actions\/runs\/(\d+)\/job\/(\d+)/.exec(url);
  if (!m) return undefined;
  return {
    workflowRunId: parseInt(m[1], 10),
    jobId: parseInt(m[2], 10),
    detailsUrl: url,
  };
}

// Single-sha results are a flat, uniform list → Markdown table (LS-8021).
// The nested `output` object is pruned to a truncated `summary` cell (the field
// agents read when triaging a failure); `output.title` and `app` are dropped as
// rarely consumed, and `startedAt` is dropped in favour of `completedAt`.
const CHECK_RUN_COLUMNS = [
  'name',
  'status',
  'conclusion',
  'completedAt',
  'summary',
] as const;

const CHECK_RUN_COLUMNS_WITH_IDS = [
  'name',
  'status',
  'conclusion',
  'completedAt',
  'summary',
  'workflowRunId',
  'jobId',
] as const;

function checkRunRow(
  run: SerializedCheckRun,
  resolveRunId?: boolean,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    name: run.name,
    status: run.status,
    conclusion: run.conclusion ?? '',
    completedAt: run.completedAt ?? '',
    summary: truncate(run.output.summary ?? '', 200),
  };
  if (resolveRunId) {
    row.workflowRunId = run.workflowRunId ?? '';
    row.jobId = run.jobId ?? '';
  }
  return row;
}

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

// GitHub's own `check_name` query param is an exact match against the full
// display name (e.g. "🚀 CI Pipeline / lint"), which no agent can guess —
// so we always fetch the unfiltered list here and apply our own
// case-insensitive substring match in `filterRunsByName` instead (LS-8771).
// It also mishandles a name containing "&" (LS-9884) — GitHub's REST
// check_name filter fails to match such names at all (both the full name and
// any substring), so any caller that still relied on server-side check_name
// filtering (e.g. retrigger-check.ts) hit the same "no check run found" gap.
// Exported so other tools reuse this local substring matcher instead of the
// broken server-side param.
export function filterRunsByName<T extends { name: string }>(
  runs: T[],
  checkName: string,
): T[] {
  const needle = checkName.toLowerCase();
  return runs.filter((run) => run.name.toLowerCase().includes(needle));
}

async function fetchCheckRunsForSha(
  owner: string,
  repo: string,
  sha: string,
  resolveRunId?: boolean,
): Promise<SerializedCheckRun[]> {
  const baseQuery: Record<string, string> = { per_page: '100' };

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
      const serialized: SerializedCheckRun = {
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
      };
      if (resolveRunId) {
        const ids = parseRunIds(run);
        if (ids) {
          serialized.workflowRunId = ids.workflowRunId;
          serialized.jobId = ids.jobId;
          serialized.detailsUrl = ids.detailsUrl;
        }
      }
      deduped.push(serialized);
    }
  }
  return deduped;
}

export async function getCheckRuns(
  params: GetCheckRunsParams,
): Promise<ToolResult> {
  const repo = await getRepoOwnerName();

  if (params.shas && params.shas.length > 0) {
    return getCheckRunsBatch(
      repo,
      params.shas,
      params.checkName,
      params.resolveRunId,
    );
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

    const allRuns = await fetchCheckRunsForSha(
      repo.owner,
      repo.name,
      sha,
      params.resolveRunId,
    );
    const deduped = params.checkName
      ? filterRunsByName(allRuns, params.checkName)
      : allRuns;

    const header = `_sha: ${sha.slice(0, 7)}${params.prNumber !== undefined ? `, PR #${params.prNumber}` : ''}, total: ${deduped.length}_`;
    const columns = params.resolveRunId
      ? CHECK_RUN_COLUMNS_WITH_IDS
      : CHECK_RUN_COLUMNS;
    const text =
      deduped.length === 0
        ? params.checkName && allRuns.length > 0
          ? `No check runs matching "${params.checkName}" for ${sha.slice(0, 7)}. Available check names: ${allRuns.map((r) => r.name).join(', ')}`
          : `No check runs found for ${sha.slice(0, 7)}.`
        : `${header}\n\n${markdownTable(
            deduped.map((r) => checkRunRow(r, params.resolveRunId)),
            {
              columns,
            },
          )}`;

    return {
      content: [{ type: 'text', text }],
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
  resolveRunId?: boolean,
): Promise<ToolResult> {
  const checkRuns: Record<string, SerializedCheckRun[]> = {};
  const missing: { sha: string; error: string }[] = [];
  const noMatch: { sha: string; checkName: string; available: string[] }[] = [];

  await mapWithConcurrency(shas, BATCH_CONCURRENCY, async (sha) => {
    try {
      const allRuns = await fetchCheckRunsForSha(
        repo.owner,
        repo.name,
        sha,
        resolveRunId,
      );
      const filtered = checkName
        ? filterRunsByName(allRuns, checkName)
        : allRuns;
      checkRuns[sha] = filtered;
      if (checkName && filtered.length === 0 && allRuns.length > 0) {
        noMatch.push({
          sha,
          checkName,
          available: allRuns.map((r) => r.name),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LOGGER.error(
        `Failed to get check runs for ${sha}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      missing.push({ sha, error: message });
    }
  });

  // Batch results are a sha-keyed map of heterogeneous arrays → minified JSON
  // (a table doesn't fit the nested, multi-key shape).
  return {
    content: [
      {
        type: 'text',
        text: minifiedJson(
          noMatch.length > 0
            ? { checkRuns, missing, noMatch }
            : { checkRuns, missing },
        ),
      },
    ],
  };
}
