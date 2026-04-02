import { jiraRequest, getSiteUrl } from '../jira-api.js';
import { getJiraCredentials } from '../netrc.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getActiveSprintId } from './get-active-sprint.js';

export interface BulkCreateTicketInput {
  summary: string;
  type?: string;
  description?: string;
  parent?: string;
  sprint?: string;
}

interface BulkCreateParams {
  tickets: BulkCreateTicketInput[];
}

interface CreatedIssue {
  index: number;
  key: string;
  url: string;
  sprintWarning?: string;
}

interface FailedIssue {
  index: number;
  summary: string;
  error: string;
}

interface JiraBulkCreateResponse {
  issues: Array<{ id: string; key: string; self: string }>;
  errors: Array<{
    failedElementNumber: number;
    elementErrors: { errors: Record<string, string>; errorMessages: string[] };
  }>;
}

function buildDescription(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

/** Create multiple Jira tickets in one bulk API call. */
export async function bulkCreate(
  params: BulkCreateParams,
): Promise<CallToolResult> {
  const { tickets } = params;

  if (tickets.length === 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'tickets array is empty',
          }),
        },
      ],
    };
  }

  if (tickets.length > 50) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Too many tickets (${tickets.length}). Maximum per call is 50. Split into batches.`,
          }),
        },
      ],
    };
  }

  const creds = await getJiraCredentials();
  const siteUrl = getSiteUrl(creds);

  // Validate sprint format values upfront before any API calls.
  for (let i = 0; i < tickets.length; i++) {
    const { sprint } = tickets[i];
    if (!sprint || sprint === 'current') continue;
    const parsed = parseInt(sprint, 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== sprint) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `tickets[${i}]: invalid sprint value "${sprint}". Use "current" or a positive integer sprint ID.`,
            }),
          },
        ],
      };
    }
  }

  // Resolve active sprint ID once — only after all validations pass and only
  // if at least one ticket requests "current".
  let activeSprintId: number | null = null;
  const needsActiveSprint = tickets.some((t) => t.sprint === 'current');
  if (needsActiveSprint) {
    activeSprintId = await getActiveSprintId();
  }

  // Resolve sprint IDs per ticket. Record a warning when "current" was
  // requested but no active sprint could be found (matches jira_create_ticket
  // behavior).
  const sprintIds: Array<number | null> = [];
  const noActiveSprintIndices: number[] = [];
  for (let i = 0; i < tickets.length; i++) {
    const { sprint } = tickets[i];
    if (!sprint) {
      sprintIds.push(null);
      continue;
    }
    if (sprint === 'current') {
      sprintIds.push(activeSprintId);
      if (activeSprintId === null) {
        noActiveSprintIndices.push(i);
      }
      continue;
    }
    sprintIds.push(parseInt(sprint, 10));
  }

  // Build the issueUpdates payload for the bulk create API.
  const issueUpdates = tickets.map((ticket) => {
    const fields: Record<string, unknown> = {
      project: { key: 'LS' },
      issuetype: { name: ticket.type ?? 'Task' },
      summary: ticket.summary,
    };
    if (ticket.description) {
      fields['description'] = buildDescription(ticket.description);
    }
    if (ticket.parent) {
      fields['parent'] = { key: ticket.parent };
    }
    return { fields };
  });

  let bulkResponse: JiraBulkCreateResponse;
  try {
    bulkResponse = await jiraRequest<JiraBulkCreateResponse>({
      method: 'POST',
      path: '/rest/api/3/issue/bulk',
      body: { issueUpdates },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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

  // Map created issues back to their original index by position.
  // The Jira bulk API returns issues in the same order as issueUpdates,
  // skipping entries that failed (recorded in the errors array instead).
  const failed: FailedIssue[] = (bulkResponse.errors ?? []).map((e) => ({
    index: e.failedElementNumber,
    summary: tickets[e.failedElementNumber]?.summary ?? '',
    error:
      [
        ...Object.values(e.elementErrors.errors ?? {}),
        ...(e.elementErrors.errorMessages ?? []),
      ].join('; ') || 'Unknown error',
  }));

  const failedIndices = new Set(failed.map((f) => f.index));
  const createdIssues = bulkResponse.issues ?? [];
  let createdIssueIdx = 0;

  const created: CreatedIssue[] = [];
  for (let i = 0; i < tickets.length; i++) {
    if (failedIndices.has(i)) continue;
    const issue = createdIssues[createdIssueIdx++];
    if (!issue) continue;
    created.push({
      index: i,
      key: issue.key,
      url: `${siteUrl}/browse/${issue.key}`,
    });
  }

  // Assign sprint post-creation — parallel with CONCURRENCY cap.
  const CONCURRENCY = 5;
  const sprintWarnings: Map<string, string> = new Map();

  const sprintAssignments = created
    .map((c) => ({ createdEntry: c, sprintId: sprintIds[c.index] }))
    .filter((x) => x.sprintId !== null);

  for (let i = 0; i < sprintAssignments.length; i += CONCURRENCY) {
    const chunk = sprintAssignments.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async ({ createdEntry, sprintId }) => {
        try {
          await jiraRequest({
            method: 'PUT',
            path: `/rest/api/3/issue/${encodeURIComponent(createdEntry.key)}`,
            body: { fields: { customfield_10020: sprintId } },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          sprintWarnings.set(
            createdEntry.key,
            `Sprint assignment failed: ${msg}`,
          );
        }
      }),
    );
  }

  // Attach sprint warnings to created entries.
  for (const entry of created) {
    const warning = sprintWarnings.get(entry.key);
    if (warning) entry.sprintWarning = warning;
  }

  // Warn on tickets that requested "current" sprint but no active sprint exists.
  for (const idx of noActiveSprintIndices) {
    const entry = created.find((c) => c.index === idx);
    if (entry && !entry.sprintWarning) {
      entry.sprintWarning =
        'No active sprint found; ticket created without sprint assignment.';
    }
  }

  const hasFailures = failed.length > 0;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: !hasFailures,
            total: tickets.length,
            created,
            failed,
          },
          null,
          2,
        ),
      },
    ],
    ...(hasFailures ? { isError: true } : {}),
  };
}
