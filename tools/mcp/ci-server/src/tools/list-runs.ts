import { basename } from 'node:path';
import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface GitHubWorkflow {
  id: number;
  name: string;
  path: string;
}

interface GitHubWorkflowsResponse {
  total_count: number;
  workflows: GitHubWorkflow[];
}

/**
 * Resolve a workflow identifier to a value accepted by the GitHub API
 * (numeric ID string or filename like `ci-pipeline.yml`).
 *
 * GitHub's `/actions/workflows/{workflow_id}/runs` endpoint only accepts a
 * numeric ID or filename — not a display name like "CI Pipeline". When the
 * caller passes a display name, list all workflows and find the matching one
 * by name (case-insensitive), then return its filename.
 */
async function resolveWorkflowId(workflow: string): Promise<string> {
  const normalized = workflow.trim();
  if (normalized === '') {
    throw new Error(
      'Workflow identifier cannot be empty or whitespace-only. Please provide a workflow name, numeric ID, or filename.',
    );
  }
  // Normalize: if a full path like ".github/workflows/ci.yml" was passed, extract just the filename.
  // Replace backslashes first so that Windows-style paths work correctly on Linux hosts
  // (node:path basename uses the host OS separator).
  const normalizedPath = normalized.replace(/\\/g, '/');
  const workflowIdCandidate = /\.ya?ml$/i.test(normalizedPath)
    ? basename(normalizedPath)
    : normalizedPath;

  // Already a numeric ID or a filename — use directly.
  if (
    /^\d+$/.test(workflowIdCandidate) ||
    /\.ya?ml$/i.test(workflowIdCandidate)
  ) {
    return workflowIdCandidate;
  }

  // Display name: paginate through all workflows until we find a match.
  const perPage = 100;
  const targetName = normalized.toLowerCase();
  const allWorkflows: GitHubWorkflow[] = [];
  let page = 1;

  let firstPage = await githubGet<GitHubWorkflowsResponse>(
    `/actions/workflows?per_page=${perPage}&page=${page}`,
  );
  allWorkflows.push(...firstPage.workflows);
  const totalCount = firstPage.total_count;

  let match = firstPage.workflows.find(
    (w) => w.name.toLowerCase() === targetName,
  );

  while (!match && allWorkflows.length < totalCount) {
    page += 1;
    const nextPage = await githubGet<GitHubWorkflowsResponse>(
      `/actions/workflows?per_page=${perPage}&page=${page}`,
    );
    if (nextPage.workflows.length === 0) break;
    allWorkflows.push(...nextPage.workflows);
    match = nextPage.workflows.find((w) => w.name.toLowerCase() === targetName);
  }

  if (!match) {
    const names = allWorkflows.map((w) => `"${w.name}"`).join(', ');
    throw new Error(
      `No workflow found with name "${workflow}". Available: ${names}`,
    );
  }
  // path is like ".github/workflows/ci-pipeline.yml" — use the filename only.
  return basename(match.path);
}

interface ListRunsParams {
  branch?: string;
  workflow?: string;
  status?: string;
  event?: string;
  commit?: string;
  user?: string;
  limit?: number;
}

interface GitHubWorkflowRun {
  id: number;
  run_number: number;
  run_attempt: number;
  conclusion: string | null;
  created_at: string;
  display_title: string;
  event: string;
  head_branch: string;
  head_sha: string;
  name: string;
  started_at?: string | null;
  status: string;
  updated_at: string;
  html_url: string;
  workflow_id: number;
}

interface GitHubRunsResponse {
  total_count: number;
  workflow_runs: GitHubWorkflowRun[];
}

function mapRun(run: GitHubWorkflowRun) {
  return {
    attempt: run.run_attempt,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    databaseId: run.id,
    displayTitle: run.display_title,
    event: run.event,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    name: run.name,
    number: run.run_number,
    startedAt: run.started_at ?? null,
    status: run.status,
    updatedAt: run.updated_at,
    url: run.html_url,
    workflowDatabaseId: run.workflow_id,
    workflowName: run.name,
  };
}

export async function listRuns(params: ListRunsParams): Promise<ToolResult> {
  const limit = params.limit ?? 10;
  const queryParams: Record<string, string> = {
    per_page: String(limit),
  };

  if (params.branch) queryParams.branch = params.branch;
  if (params.status) queryParams.status = params.status;
  if (params.event) queryParams.event = params.event;
  if (params.commit) queryParams.head_sha = params.commit;
  if (params.user) queryParams.actor = params.user;

  try {
    // If a workflow filter is specified, resolve the identifier (display name,
    // filename, or numeric ID) and use the workflow-specific endpoint.
    const workflowId = params.workflow
      ? await resolveWorkflowId(params.workflow)
      : null;
    const path = workflowId
      ? `/actions/workflows/${encodeURIComponent(String(workflowId))}/runs`
      : '/actions/runs';

    const data = await githubGet<GitHubRunsResponse>(path, queryParams);
    const runs = data.workflow_runs.slice(0, limit).map(mapRun);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              filters: params,
              count: runs.length,
              runs,
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
          text: `Failed to list workflow runs: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
