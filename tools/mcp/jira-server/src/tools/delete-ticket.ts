import { jiraRequest } from '../jira-api.js';
import { matchesStatus } from '../locale.js';
import type { ToolResult } from '../types.js';

interface DeleteTicketParams {
  key: string;
  confirm: boolean;
  reason?: string;
}

interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

interface TransitionsResponse {
  transitions: JiraTransition[];
}

/**
 * "Delete" a Jira ticket by transitioning it to "Won't Do" (or "Done" if
 * "Won't Do" is not available), adding a comment explaining the closure.
 * The OAuth service account lacks delete permission, so we close tickets instead.
 */
export async function deleteTicket(
  params: DeleteTicketParams,
): Promise<ToolResult> {
  const { key, confirm, reason } = params;

  if (!confirm) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error:
              'Closure not confirmed. Set confirm to true to close or transition the ticket.',
          }),
        },
      ],
    };
  }

  try {
    // Fetch available transitions
    const { transitions } = await jiraRequest<TransitionsResponse>({
      method: 'GET',
      path: `/rest/api/3/issue/${key}/transitions`,
    });

    // Prefer "Won't Do", fall back to "Done"
    const wontDo = transitions.find(
      (t) =>
        matchesStatus(t.name, "Won't Do") ||
        matchesStatus(t.to.name, "Won't Do"),
    );
    const done = transitions.find(
      (t) => matchesStatus(t.name, 'Done') || matchesStatus(t.to.name, 'Done'),
    );

    const target = wontDo ?? done;

    if (!target) {
      const available = transitions.map((t) => t.to.name).join(', ');
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `No "Won't Do" or "Done" transition available for ${key}. Available: ${available}`,
            }),
          },
        ],
      };
    }

    // Add a comment explaining the closure
    const comment =
      reason ?? 'Closed via automation — duplicate or no longer needed.';
    await jiraRequest({
      method: 'POST',
      path: `/rest/api/3/issue/${key}/comment`,
      body: {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: comment }],
            },
          ],
        },
      },
    });

    // Transition the ticket
    await jiraRequest({
      method: 'POST',
      path: `/rest/api/3/issue/${key}/transitions`,
      body: { transition: { id: target.id } },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            key,
            status: target.to.name,
            message: `${key} transitioned to "${target.to.name}" with comment`,
          }),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Failed to close ${key}: ${message}`,
          }),
        },
      ],
    };
  }
}
