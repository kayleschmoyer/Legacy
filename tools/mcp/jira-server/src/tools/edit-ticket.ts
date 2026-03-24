import { jiraRequest } from '../jira-api.js';
import { getActiveSprintId } from './get-active-sprint.js';
import type { ToolResult } from '../types.js';

interface EditTicketParams {
  key: string;
  summary?: string;
  description?: string;
  type?: string;
  sprint?: string;
}

/**
 * Update fields on an existing Jira ticket via REST API.
 */
export async function editTicket(
  params: EditTicketParams,
): Promise<ToolResult> {
  const { key, summary, description, type, sprint } = params;

  const fields: Record<string, unknown> = {};
  const updatedFields: string[] = [];

  if (summary !== undefined) {
    fields.summary = summary;
    updatedFields.push('summary');
  }
  if (description !== undefined) {
    fields.description = description
      ? {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: description }],
            },
          ],
        }
      : null;
    updatedFields.push('description');
  }
  if (type !== undefined) {
    fields.issuetype = { name: type };
    updatedFields.push('type');
  }
  if (sprint !== undefined) {
    let sprintId: number | null = null;
    if (sprint === 'current') {
      sprintId = await getActiveSprintId();
      if (!sprintId) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'No active sprint found.',
              }),
            },
          ],
        };
      }
    } else {
      sprintId = parseInt(sprint, 10);
      if (
        !Number.isInteger(sprintId) ||
        sprintId <= 0 ||
        sprintId.toString() !== sprint
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
    }
    fields.customfield_10020 = sprintId;
    updatedFields.push('sprint');
  }

  if (updatedFields.length === 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error:
              'At least one field must be provided (summary, description, type, or sprint)',
          }),
        },
      ],
    };
  }

  try {
    await jiraRequest({
      method: 'PUT',
      path: `/rest/api/3/issue/${key}`,
      body: { fields },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            key,
            updatedFields,
            message: `Updated ${updatedFields.join(', ')} on ${key}`,
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
            error: `Failed to update ${key}: ${message}`,
          }),
        },
      ],
    };
  }
}
