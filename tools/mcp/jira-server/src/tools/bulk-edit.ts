import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getActiveSprintId } from './get-active-sprint.js';
import { jiraRequest } from '../jira-api.js';

export interface BulkEditTicketInput {
  key: string;
  summary?: string;
  description?: string;
  type?: string;
  sprint?: string;
  parent?: string;
}

interface BulkEditParams {
  tickets: BulkEditTicketInput[];
}

interface SucceededEntry {
  key: string;
  updatedFields: string[];
}

interface FailedEntry {
  key: string;
  error: string;
}

const CONCURRENCY = 5;

/**
 * Edit up to 50 Jira tickets in one call. Per-ticket fields are sent as a
 * single PUT — combining summary/description/type/sprint/parent updates into
 * one round-trip. One ticket erroring never fails the whole batch.
 */
export async function bulkEdit(
  params: BulkEditParams,
): Promise<CallToolResult> {
  const { tickets } = params;

  if (tickets.length === 0) {
    return errorResult('tickets array is empty');
  }
  if (tickets.length > 50) {
    return errorResult(
      `Too many tickets (${tickets.length}). Maximum per call is 50. Split into batches.`,
    );
  }

  // Pre-validate sprint formats so we can fail fast without partial work.
  for (let i = 0; i < tickets.length; i++) {
    const { sprint } = tickets[i];
    if (sprint === undefined || sprint === 'current') continue;
    const parsed = parseInt(sprint, 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== sprint) {
      return errorResult(
        `tickets[${i}]: invalid sprint value "${sprint}". Use "current" or a positive integer sprint ID.`,
      );
    }
  }

  // Resolve the active sprint once if any ticket requests "current".
  let activeSprintId: number | null = null;
  if (tickets.some((t) => t.sprint === 'current')) {
    activeSprintId = await getActiveSprintId();
  }

  const succeeded: SucceededEntry[] = [];
  const failed: FailedEntry[] = [];

  async function runOne(ticket: BulkEditTicketInput): Promise<void> {
    const { key, summary, description, type, sprint, parent } = ticket;
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
      const sprintId =
        sprint === 'current' ? activeSprintId : parseInt(sprint, 10);
      if (sprint === 'current' && sprintId === null) {
        failed.push({ key, error: 'No active sprint found.' });
        return;
      }
      fields.customfield_10020 = sprintId;
      updatedFields.push('sprint');
    }
    if (parent !== undefined) {
      fields.parent = { key: parent };
      updatedFields.push('parent');
    }

    if (updatedFields.length === 0) {
      failed.push({
        key,
        error:
          'At least one field must be provided (summary, description, type, sprint, or parent).',
      });
      return;
    }

    try {
      await jiraRequest({
        method: 'PUT',
        path: `/rest/api/3/issue/${encodeURIComponent(key)}`,
        body: { fields },
      });
      succeeded.push({ key, updatedFields });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ key, error: message });
    }
  }

  for (let i = 0; i < tickets.length; i += CONCURRENCY) {
    const chunk = tickets.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(runOne));
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: failed.length === 0,
            total: tickets.length,
            succeeded,
            failed,
          },
          null,
          2,
        ),
      },
    ],
    ...(failed.length > 0 ? { isError: true } : {}),
  };
}

function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: false, error: message }),
      },
    ],
  };
}
