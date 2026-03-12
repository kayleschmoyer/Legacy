import { jiraRequest } from '../jira-api.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface CreateTicketParams {
  summary: string;
  type?: string;
  description?: string;
  parent?: string;
}

interface CreateIssueResponse {
  key: string;
  self: string;
}

/** Create a Jira ticket via REST API. */
export async function createTicket(
  params: CreateTicketParams,
): Promise<CallToolResult> {
  const { summary, type = 'Task', description, parent } = params;

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
    const result = await jiraRequest<CreateIssueResponse>({
      method: 'POST',
      path: '/rest/api/3/issue',
      body: { fields },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            key: result.key,
            url: `https://bkrupa.atlassian.net/browse/${result.key}`,
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
