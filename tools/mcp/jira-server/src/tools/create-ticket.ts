import { jiraRequest } from '../jira-api.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getActiveSprintId } from './get-active-sprint.js';

interface CreateTicketParams {
  summary: string;
  type?: string;
  description?: string;
  parent?: string;
  sprint?: string;
}

interface CreateIssueResponse {
  key: string;
  self: string;
}

/** Create a Jira ticket via REST API. */
export async function createTicket(
  params: CreateTicketParams,
): Promise<CallToolResult> {
  const { summary, type = 'Task', description, parent, sprint } = params;

  const fields: Record<string, unknown> = {
    project: { key: 'LS' },
    issuetype: { name: type },
    summary,
  };

  if (description) {
    fields['description'] = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: description }],
        },
      ],
    };
  }

  if (parent) {
    fields['parent'] = { key: parent };
  }

  try {
    // Resolve sprint: "current" auto-detects the active sprint, numeric string
    // is validated and used as-is.
    let sprintId: number | null = null;
    if (sprint === 'current') {
      sprintId = await getActiveSprintId();
    } else if (sprint) {
      const parsed = parseInt(sprint, 10);
      if (
        !Number.isInteger(parsed) ||
        parsed <= 0 ||
        String(parsed) !== sprint
      ) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Invalid sprint value "${sprint}". Use "current" or a positive integer sprint ID.`,
              }),
            },
          ],
        };
      }
      sprintId = parsed;
    }

    const result = await jiraRequest<CreateIssueResponse>({
      method: 'POST',
      path: '/rest/api/3/issue',
      body: { fields },
    });

    // Assign to sprint post-creation via the Agile API — the Create Issue
    // REST endpoint does not support the sprint field directly.
    if (sprintId) {
      await jiraRequest({
        method: 'POST',
        path: `/rest/agile/1.0/sprint/${sprintId}/issue`,
        body: { issues: [result.key] },
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            key: result.key,
            url: `https://bkrupa.atlassian.net/browse/${result.key}`,
            ...(sprintId ? { sprintId } : {}),
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
            error: message,
          }),
        },
      ],
    };
  }
}
