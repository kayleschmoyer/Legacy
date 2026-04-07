import { githubGet, githubPut } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface WorkflowStateParams {
  workflow: string | number;
}

interface GitHubWorkflow {
  id: number;
  name: string;
  state: string;
  path: string;
  html_url: string;
}

/**
 * Read the current state of a workflow without changing it.
 * Wraps `GET /repos/{owner}/{repo}/actions/workflows/{workflow}` and returns
 * just the `state` field plus identifying metadata. Equivalent to
 * `gh workflow view <workflow>` but structured.
 */
export async function workflowState(
  params: WorkflowStateParams,
): Promise<ToolResult> {
  const workflow = String(params.workflow);
  try {
    const data = await githubGet<GitHubWorkflow>(
      `/actions/workflows/${encodeURIComponent(workflow)}`,
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              workflow,
              databaseId: data.id,
              name: data.name,
              path: data.path,
              state: data.state,
              url: data.html_url,
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
          text: `Failed to read state for workflow "${workflow}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

async function setWorkflowState(
  workflow: string | number,
  action: 'enable' | 'disable',
): Promise<ToolResult> {
  const workflowStr = String(workflow);
  try {
    await githubPut(
      `/actions/workflows/${encodeURIComponent(workflowStr)}/${action}`,
    );

    // Re-fetch to confirm the new state — GitHub returns 204 with no body so
    // the only way to know the resulting state is a follow-up GET.
    const after = await githubGet<GitHubWorkflow>(
      `/actions/workflows/${encodeURIComponent(workflowStr)}`,
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              workflow: workflowStr,
              databaseId: after.id,
              name: after.name,
              path: after.path,
              state: after.state,
              action,
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
          text: `Failed to ${action} workflow "${workflowStr}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

/**
 * Enable a manually-disabled workflow. Wraps
 * `PUT /repos/{owner}/{repo}/actions/workflows/{workflow}/enable`.
 * Equivalent to `gh workflow enable <workflow>`.
 */
export async function workflowEnable(
  params: WorkflowStateParams,
): Promise<ToolResult> {
  return setWorkflowState(params.workflow, 'enable');
}

/**
 * Disable a workflow. Wraps
 * `PUT /repos/{owner}/{repo}/actions/workflows/{workflow}/disable`.
 * Equivalent to `gh workflow disable <workflow>`.
 */
export async function workflowDisable(
  params: WorkflowStateParams,
): Promise<ToolResult> {
  return setWorkflowState(params.workflow, 'disable');
}
