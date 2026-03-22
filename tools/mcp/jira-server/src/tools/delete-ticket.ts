import { jiraRequest } from '../jira-api.js';
import type { ToolResult } from '../types.js';

interface DeleteTicketParams {
  key: string;
  confirm: boolean;
}

/**
 * Delete a Jira ticket via REST API.
 */
export async function deleteTicket(
  params: DeleteTicketParams,
): Promise<ToolResult> {
  const { key, confirm } = params;

  if (!confirm) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error:
              'Deletion not confirmed. Set confirm to true to proceed. This operation is irreversible.',
          }),
        },
      ],
    };
  }

  try {
    await jiraRequest({
      method: 'DELETE',
      path: `/rest/api/3/issue/${key}`,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            key,
            message: `Ticket ${key} deleted`,
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
            error: `Failed to delete ${key}: ${message}`,
          }),
        },
      ],
    };
  }
}
