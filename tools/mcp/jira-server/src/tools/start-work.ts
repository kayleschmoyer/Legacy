import { minifiedJson } from '@legacy-sports/mcp-format';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { jiraRequest } from '../jira-api.js';
import { matchesStatus } from '../locale.js';
import {
  type AssigneeCaller,
  putAssignee,
  resolveAndAssign,
  resolveAssignee,
} from '../assignee.js';

interface StartWorkParams {
  key: string;
  /**
   * See `resolveAssignee` in `../assignee.ts` for the full precedence order.
   * `assigneeAccountId` is still the cheapest path (no lookup at all), but an
   * email now resolves on the hosted Lambda too, via a JQL fallback that
   * works under `read:jira-work` where `/user/search` 401s (LS-9513).
   */
  assignee?: string;
  assigneeAccountId?: string;
  /** The hosted request's authenticated caller — see `resolveAssignee`. */
  caller?: AssigneeCaller;
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
  const { key, assignee, assigneeAccountId, caller } = params;

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
      // Idempotent on status, but not on ownership: an In Progress ticket
      // with no assignee is the signature of an earlier claim whose
      // assignee-set failed (LS-7891/LS-8773), and returning early left it
      // permanently unowned. Fill in the missing assignee (LS-9513).
      if (!issue.fields.assignee) {
        const repair = await resolveAndAssign({
          key,
          explicitAssignee: assignee,
          explicitAssigneeAccountId: assigneeAccountId,
          caller,
          toolName: 'jira_start_work',
        });
        return successResult({
          key,
          status: 'In Progress',
          previousStatus,
          assignee: repair.displayName ?? repair.accountId ?? null,
          idempotent: true,
          warnings: repair.warnings,
        });
      }

      return successResult({
        key,
        status: 'In Progress',
        previousStatus,
        assignee: issue.fields.assignee.displayName,
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

    // Resolve the owner first so an unowned claim is refused before the
    // ticket moves, rather than left In Progress with nobody assigned.
    const owner = await resolveAssignee({
      key,
      explicitAssignee: assignee,
      explicitAssigneeAccountId: assigneeAccountId,
      caller,
      toolName: 'jira_start_work',
    });
    if (!owner.ok) {
      return errorResult(
        `Refusing to start work on ${key} without an assignee: ${owner.error}`,
      );
    }

    await jiraRequest({
      method: 'POST',
      path: `/rest/api/3/issue/${key}/transitions`,
      body: { transition: { id: inProgressTransition.id } },
    });

    const putWarning = await putAssignee(
      key,
      owner.accountId,
      'jira_start_work',
    );

    return successResult({
      key,
      status: 'In Progress',
      previousStatus,
      assignee: putWarning ? null : (owner.displayName ?? owner.accountId),
      idempotent: false,
      warnings: putWarning ? [putWarning] : [],
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
