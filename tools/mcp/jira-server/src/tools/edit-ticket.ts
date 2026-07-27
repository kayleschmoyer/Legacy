import { buildStructuredDescription } from '../adf.js';
import { jiraRequest } from '../jira-api.js';
import { getActiveSprintId } from './get-active-sprint.js';
import type { ToolResult } from '../types.js';

interface EditTicketParams {
  key: string;
  summary?: string;
  description?: string;
  type?: string;
  sprint?: string;
  addLabels?: string[];
  removeLabels?: string[];
}

/** Fetch just the labels field for a ticket — avoids the full issue payload. */
async function fetchLabels(key: string): Promise<string[]> {
  const issue = await jiraRequest<{ fields: { labels: string[] } }>({
    method: 'GET',
    path: `/rest/api/3/issue/${key}`,
    query: { fields: 'labels' },
  });
  return issue.fields.labels;
}

/**
 * Update fields on an existing Jira ticket via REST API.
 * Supports summary, description, type, sprint, and additive
 * addLabels/removeLabels (existing labels are preserved).
 */
export async function editTicket(
  params: EditTicketParams,
): Promise<ToolResult> {
  const { key, summary, description, type, sprint, addLabels, removeLabels } =
    params;

  const fields: Record<string, unknown> = {};
  const updatedFields: string[] = [];

  if (summary !== undefined) {
    fields.summary = summary;
    updatedFields.push('summary');
  }
  if (description !== undefined) {
    fields.description = description
      ? (buildStructuredDescription({ description }) ?? null)
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

  let labelAdds: string[] = [];
  let labelRemoves: string[] = [];
  let resultLabels: string[] | undefined;

  if (addLabels !== undefined || removeLabels !== undefined) {
    const requestedAdds = (addLabels ?? []).filter((l) => l.trim().length);
    const requestedRemoves = (removeLabels ?? []).filter(
      (l) => l.trim().length,
    );

    let currentLabels: string[];
    try {
      currentLabels = await fetchLabels(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Failed to read current labels for ${key}: ${message}`,
            }),
          },
        ],
      };
    }

    const currentSet = new Set(currentLabels);
    // Additive REST update verbs — only send the labels that actually change
    // state, so a re-requested add/remove is a no-op rather than a Jira error.
    labelAdds = requestedAdds.filter((l) => !currentSet.has(l));
    labelRemoves = requestedRemoves.filter((l) => currentSet.has(l));

    resultLabels = currentLabels.filter((l) => !labelRemoves.includes(l));
    for (const label of labelAdds) {
      if (!resultLabels.includes(label)) resultLabels.push(label);
    }

    if (labelAdds.length > 0 || labelRemoves.length > 0) {
      updatedFields.push('labels');
    }
  }

  const labelsRequested = addLabels !== undefined || removeLabels !== undefined;
  if (updatedFields.length === 0 && !labelsRequested) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error:
              'At least one field must be provided (summary, description, type, sprint, addLabels, or removeLabels)',
          }),
        },
      ],
    };
  }

  try {
    const body: Record<string, unknown> = {};
    if (Object.keys(fields).length > 0) {
      body.fields = fields;
    }
    if (labelAdds.length > 0 || labelRemoves.length > 0) {
      body.update = {
        labels: [
          ...labelAdds.map((label) => ({ add: label })),
          ...labelRemoves.map((label) => ({ remove: label })),
        ],
      };
    }

    if (Object.keys(body).length > 0) {
      await jiraRequest({
        method: 'PUT',
        path: `/rest/api/3/issue/${key}`,
        body,
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            key,
            updatedFields,
            ...(resultLabels !== undefined ? { labels: resultLabels } : {}),
            message:
              updatedFields.length > 0
                ? `Updated ${updatedFields.join(', ')} on ${key}`
                : `No changes to ${key} — requested labels already matched current state`,
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
