import { LOGGER } from '@legacy-sports/logging/server';
import { minifiedJson } from '@legacy-sports/mcp-format';
import { jiraRequest } from '../jira-api.js';
import { matchesStatus } from '../locale.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface StartWorkParams {
  key: string;
  /**
   * Email of the user to assign the ticket to. Overrides the
   * `JIRA_ASSIGNEE_EMAIL` env var. When neither is provided, the ticket is
   * assigned to the `JIRA_ASSIGNEE_ACCOUNT_ID` env var if set, else to the
   * authenticated service account resolved via `GET /rest/api/3/myself`.
   */
  assignee?: string;
}

interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

interface JiraIssueResponse {
  key: string;
  fields: {
    status: { name: string };
    assignee: { displayName: string; emailAddress?: string } | null;
  };
}

/**
 * Semantic one-shot for Step 3 of the ticket spine ("Jira → In Progress").
 *
 * Wraps the four-call chain (jira_view → jira_get_transitions →
 * jira_transition → assignee PUT) into a single side-effecting call. Idempotent
 * on already-In-Progress tickets; refuses tickets that are Done.
 */
export async function startWork(
  params: StartWorkParams,
): Promise<CallToolResult> {
  const { key, assignee } = params;

  try {
    const [issue, transitionsResponse] = await Promise.all([
      jiraRequest<JiraIssueResponse>({
        method: 'GET',
        path: `/rest/api/3/issue/${key}`,
        query: { fields: 'status,assignee' },
      }),
      jiraRequest<{ transitions: JiraTransition[] }>({
        method: 'GET',
        path: `/rest/api/3/issue/${key}/transitions`,
      }),
    ]);

    const previousStatus = issue.fields.status.name;

    if (matchesStatus(previousStatus, 'Done')) {
      return errorResult(
        `Refusing to start work on ${key}: ticket is already Done. Re-open it in Jira first if work needs to resume.`,
      );
    }

    if (matchesStatus(previousStatus, 'In Progress')) {
      return successResult({
        key,
        status: 'In Progress',
        previousStatus,
        assignee: issue.fields.assignee?.displayName ?? null,
        idempotent: true,
        warnings: [],
      });
    }

    const inProgressTransition = transitionsResponse.transitions.find(
      (t) =>
        matchesStatus(t.name, 'In Progress') ||
        matchesStatus(t.to.name, 'In Progress'),
    );

    if (!inProgressTransition) {
      const available = transitionsResponse.transitions
        .map((t) => t.to.name)
        .join(', ');
      return errorResult(
        `No "In Progress" transition available from current status "${previousStatus}". Available: ${available}`,
      );
    }

    await jiraRequest({
      method: 'POST',
      path: `/rest/api/3/issue/${key}/transitions`,
      body: { transition: { id: inProgressTransition.id } },
    });

    const { accountId, displayName, warnings } = await resolveAndAssign({
      key,
      explicitAssignee: assignee,
    });

    return successResult({
      key,
      status: 'In Progress',
      previousStatus,
      assignee: displayName ?? accountId ?? null,
      idempotent: false,
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(`Failed to start work on ${key}: ${message}`);
  }
}

async function resolveAndAssign({
  key,
  explicitAssignee,
}: {
  key: string;
  explicitAssignee: string | undefined;
}): Promise<{
  accountId: string | undefined;
  displayName: string | undefined;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const assigneeEmail = explicitAssignee ?? process.env['JIRA_ASSIGNEE_EMAIL'];
  const configuredAccountId = process.env['JIRA_ASSIGNEE_ACCOUNT_ID'];

  try {
    let accountId: string | undefined;
    let displayName: string | undefined;

    if (assigneeEmail) {
      const userSearch = await jiraRequest<
        { accountId: string; displayName?: string }[]
      >({
        method: 'GET',
        path: '/rest/api/3/user/search',
        query: { query: assigneeEmail, maxResults: '1' },
      });
      accountId = userSearch?.[0]?.accountId;
      displayName = userSearch?.[0]?.displayName ?? assigneeEmail;
      if (!accountId) {
        LOGGER.warn(
          'jira_start_work: no Jira user found for assignee; skipping assignee',
          { assigneeEmail, key },
        );
        warnings.push(
          `Could not assign ticket: no Jira user found for email "${assigneeEmail}".`,
        );
      }
    } else if (configuredAccountId) {
      // Pre-resolved accountId — no user lookup needed.
      // The hosted Lambda's client-credentials token lacks read:jira-user
      // (LS-7891), so both /myself and /user/search would fail.
      accountId = configuredAccountId;
    } else {
      const self = await jiraRequest<{
        accountId: string;
        displayName?: string;
      }>({
        method: 'GET',
        path: '/rest/api/3/myself',
      });
      accountId = self?.accountId;
      displayName = self?.displayName;
    }

    if (accountId) {
      await jiraRequest({
        method: 'PUT',
        path: `/rest/api/3/issue/${key}/assignee`,
        body: { accountId },
      });
    }

    return { accountId, displayName, warnings };
  } catch (assignErr) {
    const msg =
      assignErr instanceof Error ? assignErr.message : String(assignErr);
    LOGGER.error(
      'jira_start_work: assignee update failed (non-fatal)',
      assignErr instanceof Error ? assignErr : new Error(msg),
      { key },
    );
    warnings.push(`Assignee update failed (non-fatal): ${msg}`);
    return { accountId: undefined, displayName: undefined, warnings };
  }
}

function successResult(payload: {
  key: string;
  status: 'In Progress';
  previousStatus: string;
  assignee: string | null;
  idempotent: boolean;
  warnings: string[];
}): CallToolResult {
  return {
    content: [{ type: 'text', text: minifiedJson(payload) }],
  };
}

function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}
