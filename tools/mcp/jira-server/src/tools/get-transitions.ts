import { jiraRequest } from '../jira-api.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface JiraTransition {
  id: string;
  name: string;
  to: {
    name: string;
    statusCategory: { name: string };
  };
}

interface TransitionsResponse {
  transitions: JiraTransition[];
}

/** Fetch available workflow transitions for a Jira issue. */
export async function getTransitions(params: {
  key: string;
}): Promise<CallToolResult> {
  const { key } = params;

  try {
    const { transitions } = await jiraRequest<TransitionsResponse>({
      method: 'GET',
      path: `/rest/api/3/issue/${key}/transitions`,
    });

    const result = transitions.map((t) => ({
      id: t.id,
      name: t.name,
      to: {
        name: t.to.name,
        statusCategory: t.to.statusCategory.name,
      },
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Jira request failed: ${message}`,
          }),
        },
      ],
      isError: true,
    };
  }
}
