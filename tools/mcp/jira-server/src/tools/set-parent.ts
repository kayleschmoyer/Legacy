import { jiraRequest } from '../jira-api.js';
import type { ToolResult } from '../types.js';

interface SetParentParams {
  key: string;
  parent: string;
}

/**
 * Set or change the parent epic of an existing ticket via Jira REST API.
 */
export async function setParent(params: SetParentParams): Promise<ToolResult> {
  const { key, parent } = params;

  try {
    await jiraRequest({
      method: 'PUT',
      path: `/rest/api/3/issue/${key}`,
      body: {
        fields: {
          parent: { key: parent },
        },
      },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            key,
            parent,
            message: `Parent of ${key} set to ${parent}`,
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
            error: `Failed to set parent on ${key}: ${message}`,
          }),
        },
      ],
    };
  }
}
