import { minifiedJson } from '@legacy-sports/mcp-format';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isBlockerLink } from '../blockers.js';
import { jiraRequest } from '../jira-api.js';
import { searchJqlAll } from '../jql-search.js';
import { extractAdfText } from '../adf.js';
import { matchesStatus } from '../locale.js';
import { resolveAndAssign } from '../assignee.js';
import type { OpenPrRef } from '../schemas.js';

interface ClaimTicketParams {
  key: string;
  /**
   * See `resolveAndAssign` in `../assignee.ts` for the full precedence order.
   * `assigneeAccountId` is still the cheapest path (no lookup at all), but an
   * email now resolves on the hosted Lambda too, via a JQL fallback that
   * works under `read:jira-work` where `/user/search` 401s (LS-9513).
   */
  assignee?: string;
  assigneeAccountId?: string;
  /**
   * Open PRs the caller has already found to reference this ticket's key
   * (e.g. via `github_pr_dashboard(state: 'open')` filtered by key). The
   * jira server holds no GitHub credentials of its own and cannot look this
   * up itself (LS-9289), so the duplicate-work guard below only fires when
   * the caller supplies this. Omit (or pass `[]`) when no open PR was found
   * or the check was skipped — claim proceeds as before.
   */
  openPrs?: OpenPrRef[];
}

interface JiraIssueLink {
  type: { name: string; inward: string };
  inwardIssue?: { key: string; fields: { status: { name: string } } };
}

interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

interface JiraIssueResponse {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    description: unknown;
    assignee: { displayName: string } | null;
    reporter: { displayName: string } | null;
    parent?: { key: string };
    issuelinks: JiraIssueLink[];
    labels: string[];
    priority: { name: string } | null;
    created: string;
    updated: string;
  };
}

/**
 * Atomically read, validate, and claim a Jira ticket:
 * 1. Fetch ticket details
 * 2. Validate the ticket can be claimed (status, blockers, leaf check)
 * 3. Transition to "In Progress"
 * 4. Return full ticket details + claim metadata
 */
export async function claimTicket(
  params: ClaimTicketParams,
): Promise<CallToolResult> {
  const { key, assignee, assigneeAccountId, openPrs } = params;

  try {
    // Fetch ticket details, child status counts, and available transitions concurrently
    const [issue, childResult, transitionsResponse] = await Promise.all([
      jiraRequest<JiraIssueResponse>({
        method: 'GET',
        path: `/rest/api/3/issue/${key}`,
        query: {
          fields:
            'summary,status,issuetype,description,assignee,reporter,parent,issuelinks,labels,priority,created,updated',
        },
      }),
      searchJqlAll<{ status: { name: string } }>({
        jql: `parent = ${JSON.stringify(key)}`,
        fields: ['status'],
        maxResults: 100,
      }).catch(() => undefined),
      jiraRequest<{ transitions: JiraTransition[] }>({
        method: 'GET',
        path: `/rest/api/3/issue/${key}/transitions`,
      }),
    ]);

    const status = issue.fields.status.name;
    const warnings: string[] = [];

    // --- Guard: already done or in review — stop immediately ---
    if (matchesStatus(status, 'Done')) {
      return makeResult({
        action: 'STOP',
        reason: `Ticket is already Done — do not regress or re-claim.`,
        claimed: false,
        ticket: buildTicket(issue, childResult),
        warnings,
      });
    }

    if (matchesStatus(status, 'In Review')) {
      return makeResult({
        action: 'STOP',
        reason: `Ticket is In Review — do not regress or re-claim.`,
        claimed: false,
        ticket: buildTicket(issue, childResult),
        warnings,
      });
    }

    // --- Guard: already in progress — warn but return ticket details so agent can decide ---
    if (matchesStatus(status, 'In Progress')) {
      // Repair path (LS-9513): the ticket is In Progress but nobody owns it,
      // which is the signature of an earlier claim whose assignee-set failed
      // (LS-7891/LS-8773). Bailing here left those tickets permanently
      // unassigned, since a re-claim never reached resolveAndAssign. Assign
      // now — the transition is already where it needs to be, so this only
      // fills in the missing owner and does not resume or re-claim the work.
      if (!issue.fields.assignee) {
        const repair = await resolveAndAssign({
          key,
          explicitAssignee: assignee,
          explicitAssigneeAccountId: assigneeAccountId,
          toolName: 'jira_transition',
        });
        warnings.push(...repair.warnings);
        if (repair.accountId !== undefined) {
          const owner = repair.displayName ?? repair.accountId;
          warnings.push(
            `Ticket was In Progress with no assignee — assigned to ${owner}.`,
          );
          // Reflect the repair in the returned ticket card, which is built
          // from the issue snapshot fetched before the assignment.
          issue.fields.assignee = { displayName: owner };
        }
      }

      return makeResult({
        action: 'ALREADY_CLAIMED',
        reason: `Ticket is already In Progress. Check for an existing PR before continuing to avoid duplicate work.`,
        claimed: false,
        ticket: buildTicket(issue, childResult),
        warnings,
      });
    }

    // --- Blocker check ---
    const blockerLinks = issue.fields.issuelinks.filter(isBlockerLink);

    let branchRecommendation = 'base off main';

    if (blockerLinks.length > 0) {
      const blockers = blockerLinks.map((link) => ({
        key: link.inwardIssue.key,
        status: link.inwardIssue.fields.status.name,
      }));

      const unresolved = blockers.filter(
        (b) =>
          !matchesStatus(b.status, 'Done') &&
          !matchesStatus(b.status, 'In Review'),
      );
      const inReview = blockers.filter((b) =>
        matchesStatus(b.status, 'In Review'),
      );

      if (unresolved.length > 0) {
        return makeResult({
          action: 'STOP',
          reason: `Blocker(s) not ready: ${unresolved.map((b) => `${b.key} (${b.status})`).join(', ')}. Wait until they reach In Review or Done.`,
          claimed: false,
          ticket: buildTicket(issue, childResult),
          warnings,
          blockers,
        });
      }

      if (inReview.length === 1) {
        branchRecommendation = `base off ${inReview[0].key} branch`;
      } else if (inReview.length > 1) {
        return makeResult({
          action: 'STOP',
          reason: `Multiple blockers are In Review (${inReview.map((b) => b.key).join(', ')}). A human must choose the parent branch.`,
          claimed: false,
          ticket: buildTicket(issue, childResult),
          warnings,
          blockers,
        });
      }
    }

    // --- Leaf check: warn if there are open/in-progress children ---
    if (childResult && childResult.length > 0) {
      const openChildren = childResult.filter(
        (c) =>
          !matchesStatus(c.fields.status.name, 'Done') &&
          !matchesStatus(c.fields.status.name, 'In Review'),
      );
      if (openChildren.length > 0) {
        warnings.push(
          `${openChildren.length} open child ticket(s) exist. Consider working child tickets individually rather than this parent.`,
        );
      }
    }

    // --- Guard: an open PR already references this ticket (LS-9289) ---
    // Catches the case where the ticket is legitimately To Do/Unassigned
    // (e.g. a prior claim's assignee-set 401'd — LS-8773) but another agent
    // already has an open PR against this key. Only fires when the caller
    // supplies `openPrs` — see the field doc above for why this can't be
    // self-checked here.
    if (openPrs && openPrs.length > 0) {
      return makeResult({
        action: 'PR_EXISTS',
        reason: `Open PR(s) already reference ${key}: ${openPrs.map((pr) => `#${pr.number}`).join(', ')}. Check for duplicate work before claiming.`,
        claimed: false,
        ticket: buildTicket(issue, childResult),
        warnings,
        openPrs,
      });
    }

    // --- Transition to In Progress ---
    const inProgressTransition = transitionsResponse.transitions.find(
      (t) =>
        matchesStatus(t.name, 'In Progress') ||
        matchesStatus(t.to.name, 'In Progress'),
    );

    if (!inProgressTransition) {
      const available = transitionsResponse.transitions
        .map((t) => t.to.name)
        .join(', ');
      return makeResult({
        action: 'STOP',
        reason: `No "In Progress" transition available from current status "${status}". Available: ${available}`,
        claimed: false,
        ticket: buildTicket(issue, childResult),
        warnings,
      });
    }

    await jiraRequest({
      method: 'POST',
      path: `/rest/api/3/issue/${key}/transitions`,
      body: { transition: { id: inProgressTransition.id } },
    });

    // --- Assign the ticket ---
    const assignResult = await resolveAndAssign({
      key,
      explicitAssignee: assignee,
      explicitAssigneeAccountId: assigneeAccountId,
      toolName: 'jira_transition',
    });
    warnings.push(...assignResult.warnings);

    return makeResult({
      action: 'PROCEED',
      claimed: true,
      branchRecommendation,
      ticket: buildTicket(issue, childResult),
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to claim ticket ${key}: ${message}`,
        },
      ],
    };
  }
}

function buildTicket(
  issue: JiraIssueResponse,
  childResult:
    | Array<{ key: string; fields: { status: { name: string } } }>
    | undefined,
) {
  const blockers = issue.fields.issuelinks
    .filter(isBlockerLink)
    .map((link) => ({
      key: link.inwardIssue.key,
      status: link.inwardIssue.fields.status.name,
    }));

  const ticket: Record<string, unknown> = {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    type: issue.fields.issuetype.name,
    priority: issue.fields.priority?.name ?? '',
    description: extractAdfText(issue.fields.description),
    assignee: issue.fields.assignee?.displayName ?? '',
    reporter: issue.fields.reporter?.displayName ?? '',
    parent: issue.fields.parent?.key ?? '',
    labels: issue.fields.labels,
    created: issue.fields.created,
    updated: issue.fields.updated,
    blockers,
  };

  if (childResult && childResult.length > 0) {
    const counts = { toDo: 0, inProgress: 0, inReview: 0, done: 0 };
    for (const child of childResult) {
      const s = child.fields.status.name;
      if (matchesStatus(s, 'Done')) counts.done++;
      else if (matchesStatus(s, 'In Review')) counts.inReview++;
      else if (matchesStatus(s, 'In Progress')) counts.inProgress++;
      else counts.toDo++;
    }
    ticket.children = { total: childResult.length, ...counts };
  }

  return ticket;
}

interface ClaimResult {
  action: 'PROCEED' | 'STOP' | 'ALREADY_CLAIMED' | 'PR_EXISTS';
  claimed: boolean;
  reason?: string;
  branchRecommendation?: string;
  ticket: Record<string, unknown>;
  warnings: string[];
  blockers?: Array<{ key: string; status: string }>;
  openPrs?: OpenPrRef[];
}

function makeResult(result: ClaimResult): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: minifiedJson(result),
      },
    ],
  };
}
