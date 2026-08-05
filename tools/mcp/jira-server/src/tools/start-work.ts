import { minifiedJson } from '@legacy-sports/mcp-format';
import { jiraRequest } from '../jira-api.js';
import { matchesStatus } from '../locale.js';
import { resolveAndAssign } from '../assignee.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface StartWorkParams {
  key: string;
  /**
   * See `resolveAndAssign` in `../assignee.ts` for the full precedence order.
   * Prefer `assigneeAccountId` when known — the email-based paths always
   * 401 under the Lambda's client-credentials scopes (LS-7891/LS-9049).
   */
  assignee?: string;
  assigneeAccountId?: string;
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
 * Wraps the four-call chain (jira_view → jira_view({ include: ['transitions'] }) →
 * jira_transition → assignee PUT) into a single side-effecting call. Idempotent
 * on already-In-Progress tickets; refuses tickets that are Done.
 */
export async function startWork(
  params: StartWorkParams,
): Promise<CallToolResult> {
  const { key, assignee, assigneeAccountId } = params;

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
      explicitAssigneeAccountId: assigneeAccountId,
      toolName: 'jira_start_work',
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
