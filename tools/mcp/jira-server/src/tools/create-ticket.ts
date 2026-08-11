import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getActiveSprintId } from './get-active-sprint.js';
import { getSiteUrl, jiraRequest } from '../jira-api.js';
import { getJiraCredentials } from '../netrc.js';
import { buildStructuredDescription } from '../adf.js';

interface CreateTicketParams {
  summary: string;
  type?: string;
  /**
   * Alias for `type`. Agents have historically passed `issueType` (the field
   * name does not match the tool param `type`), which was silently dropped and
   * left `type` at its default, creating a Task instead of the requested Epic
   * (LS-7852). Accepting it as an alias makes the requested type deterministic.
   */
  issueType?: string;
  description?: string;
  context?: string;
  risk?: string;
  planningNotes?: string;
  parent?: string;
  sprint?: string;
}

interface CreateIssueResponse {
  key: string;
  self: string;
}

interface CreateTicketResponse {
  success: boolean;
  key: string;
  url: string;
  id?: string;
  type?: string;
  summary?: string;
  sprintId?: number;
  warning?: string;
}

/** Create a Jira ticket via REST API. */
export async function createTicket(
  params: CreateTicketParams,
): Promise<CallToolResult> {
  const {
    summary,
    type,
    issueType,
    description,
    context,
    risk,
    planningNotes,
    parent,
    sprint,
  } = params;

  // Resolve the effective issue type: explicit `type` wins, then the
  // `issueType` alias, then default to Task. This keeps `type:"Epic"`
  // deterministic and prevents the historical silent-Task fallback (LS-7852).
  const resolvedType = type ?? issueType ?? 'Task';

  // Resolve credentials once upfront to avoid redundant lookups for the
  // browse URL later.
  const creds = await getJiraCredentials();
  const siteUrl = getSiteUrl(creds);

  const fields: Record<string, unknown> = {
    project: { key: 'LS' },
    issuetype: { name: resolvedType },
    summary,
  };

  const adfDescription = buildStructuredDescription({
    description,
    context,
    risk,
    planningNotes,
  });
  if (adfDescription) {
    fields['description'] = adfDescription;
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

    // Assign to sprint post-creation via the platform API — set the sprint
    // custom field (customfield_10020) on the issue. This avoids the Agile
    // REST API which requires Jira Software OAuth scopes.
    let sprintWarning: string | undefined;
    if (sprintId) {
      try {
        await jiraRequest({
          method: 'PUT',
          path: `/rest/api/3/issue/${result.key}`,
          body: { fields: { customfield_10020: sprintId } },
        });
      } catch (sprintError) {
        const sprintMessage =
          sprintError instanceof Error
            ? sprintError.message
            : String(sprintError);
        sprintWarning = `Ticket created but sprint assignment failed: ${sprintMessage}`;
        sprintId = null;
      }
    }

    const response: CreateTicketResponse = {
      success: true,
      key: result.key,
      url: `${siteUrl}/browse/${result.key}`,
    };
    if (sprintId) {
      response.sprintId = sprintId;
    }
    if (sprintWarning) {
      response.warning = sprintWarning;
    } else if (sprint && !sprintId) {
      response.warning =
        'Sprint was requested but no active sprint was found. Ticket created without sprint assignment.';
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Jira's issue-type hierarchy only allows an Epic to parent a Task/Bug —
    // a Story cannot (they're peers). Bucket-epic GAP-filing conventions
    // routinely ask agents to parent a Bug/Task to a Story, which 400s with
    // this exact message and no guidance (LS-8481). Surface the known
    // workaround instead of leaving the agent to rediscover it by trial and
    // error.
    const isInvalidParentError = message.includes(
      'Please select valid parent issue',
    );
    const hint =
      parent &&
      (resolvedType === 'Task' || resolvedType === 'Bug') &&
      isInvalidParentError
        ? `Jira only allows an Epic to parent a ${resolvedType} — a Story cannot (they're peers in the hierarchy). If "${parent}" is a Story, parent this ticket to its bucket Epic instead, then run jira_link_issues({ inwardKey: "<new-key>", outwardKey: "${parent}", linkType: "Relates" }) to associate it with "${parent}". See the umbrella grouping pattern: .agents/skills/plan-ticket/references/create.md#umbrella-grouping-pattern.`
        : undefined;

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: message,
            ...(hint ? { hint } : {}),
          }),
        },
      ],
    };
  }
}
