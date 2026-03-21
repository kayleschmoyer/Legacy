import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

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
    // If a workflow filter is specified, use the workflow-specific endpoint
    const path = params.workflow
      ? `/actions/workflows/${params.workflow}/runs`
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
