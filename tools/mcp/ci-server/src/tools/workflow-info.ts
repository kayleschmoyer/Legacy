import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface WorkflowInfoParams {
  workflow?: string;
  includePermissions?: boolean;
}

interface GitHubWorkflow {
  id: number;
  name: string;
  state: string;
  path: string;
  html_url: string;
  created_at: string;
  updated_at: string;
}

interface GitHubWorkflowsResponse {
  total_count: number;
  workflows: GitHubWorkflow[];
}

interface GitHubInstallation {
  id: number;
  app_id: number;
  app_slug: string;
  permissions: Record<string, string>;
  events: string[];
}

interface MappedWorkflow {
  databaseId: number;
  name: string;
  state: string;
  path: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

function mapWorkflow(workflow: GitHubWorkflow): MappedWorkflow {
  return {
    databaseId: workflow.id,
    name: workflow.name,
    state: workflow.state,
    path: workflow.path,
    url: workflow.html_url,
    createdAt: workflow.created_at,
    updatedAt: workflow.updated_at,
  };
}

export async function workflowInfo(
  params: WorkflowInfoParams,
): Promise<ToolResult> {
  try {
    let workflows: MappedWorkflow[];

    if (params.workflow) {
      // Get a specific workflow by filename or ID
      const workflow = await githubGet<GitHubWorkflow>(
        `/actions/workflows/${params.workflow}`,
      );
      workflows = [mapWorkflow(workflow)];
    } else {
      // List all workflows (handle GitHub pagination)
      const perPage = 100;
      let page = 1;
      const allWorkflows: GitHubWorkflow[] = [];

      while (true) {
        const data = await githubGet<GitHubWorkflowsResponse>(
          `/actions/workflows?per_page=${perPage}&page=${page}`,
        );

        allWorkflows.push(...data.workflows);

        if (
          data.workflows.length < perPage ||
          allWorkflows.length >= data.total_count
        ) {
          break;
        }

        page += 1;
      }

      workflows = allWorkflows.map(mapWorkflow);
    }

    const result: Record<string, unknown> = {
      count: workflows.length,
      workflows,
    };

    if (params.includePermissions) {
      try {
        const installation =
          await githubGet<GitHubInstallation>('/installation');
        result.installation = {
          id: installation.id,
          appId: installation.app_id,
          appSlug: installation.app_slug,
          permissions: installation.permissions,
          events: installation.events,
        };
      } catch (error) {
        result.installation = {
          error: `Failed to fetch installation info: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to get workflow info: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
