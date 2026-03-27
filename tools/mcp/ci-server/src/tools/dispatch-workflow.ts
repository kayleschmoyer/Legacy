import { githubPost } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface DispatchWorkflowParams {
  workflow: string | number;
  ref?: string;
  inputs?: Record<string, string>;
}

export async function dispatchWorkflow(
  params: DispatchWorkflowParams,
): Promise<ToolResult> {
  try {
    const body: Record<string, unknown> = {
      ref: params.ref ?? 'main',
    };
    if (params.inputs && Object.keys(params.inputs).length > 0) {
      body.inputs = params.inputs;
    }

    const workflow = String(params.workflow);

    await githubPost(
      `/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      body,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              workflow,
              ref: body.ref,
              inputs: params.inputs ?? {},
              message:
                'Workflow dispatch requested successfully. Use ci_list_runs to monitor the triggered run.',
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
          text: `Failed to dispatch workflow "${params.workflow}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
