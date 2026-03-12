import { jiraRequest } from '../jira-api.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const VALID_STATUSES = ['In Progress', 'In Review', 'Done'] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

interface TransitionParams {
  key: string;
  status: string;
}

interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

interface TransitionsResponse {
  transitions: JiraTransition[];
}

/** Transition a Jira ticket to a new status via REST API. */
export async function transition(
  params: TransitionParams,
): Promise<CallToolResult> {
  const { key, status } = params;

  if (!VALID_STATUSES.includes(status as ValidStatus)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    // Fetch available transitions for this issue
    const { transitions } = await jiraRequest<TransitionsResponse>({
      method: 'GET',
      path: `/rest/api/3/issue/${key}/transitions`,
    });

    const match = transitions.find(
      (t) =>
        t.name.toLowerCase() === status.toLowerCase() ||
        t.to.name.toLowerCase() === status.toLowerCase(),
    );

    if (!match) {
      const available = transitions.map((t) => t.to.name).join(', ');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `No transition to "${status}" available. Available: ${available}`,
            }),
          },
        ],
        isError: true,
      };
    }

    await jiraRequest({
      method: 'POST',
      path: `/rest/api/3/issue/${key}/transitions`,
      body: { transition: { id: match.id } },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, key, status }),
        },
      ],
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
