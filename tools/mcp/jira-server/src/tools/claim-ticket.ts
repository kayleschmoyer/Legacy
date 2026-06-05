import { LOGGER } from '@legacy-sports/logging/server';
import { jiraRequest } from '../jira-api.js';
import { searchJqlAll } from '../jql-search.js';
import { extractAdfText } from '../adf.js';
import { matchesStatus } from '../locale.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface ClaimTicketParams {
  key: string;
  /**
   * Email of the user to assign the ticket to. Overrides the
   * `JIRA_ASSIGNEE_EMAIL` env var. When neither is provided, the ticket is
   * assigned to the authenticated service account.
   */
  assignee?: string;
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
  const { key, assignee } = params;

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
      }).catch(() => undefined as undefined),
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
      return makeResult({
        action: 'ALREADY_CLAIMED',
        reason: `Ticket is already In Progress. Check for an existing PR before continuing to avoid duplicate work.`,
        claimed: false,
        ticket: buildTicket(issue, childResult),
        warnings,
      });
    }

    // --- Blocker check ---
    const blockerLinks = issue.fields.issuelinks.filter(
      (link) =>
        link.inwardIssue &&
        link.type.inward.toLowerCase().includes('is blocked by'),
    );

    let branchRecommendation = 'base off main';

    if (blockerLinks.length > 0) {
      const blockers = blockerLinks.map((link) => ({
        key: link.inwardIssue!.key,
        status: link.inwardIssue!.fields.status.name,
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
    // Precedence: explicit `assignee` param > JIRA_ASSIGNEE_EMAIL env var >
    // the authenticated service account (self).
    const assigneeEmail = assignee ?? process.env['JIRA_ASSIGNEE_EMAIL'];
    try {
      let accountId: string | undefined;

      if (assigneeEmail) {
        const userSearch = await jiraRequest<{ accountId: string }[]>({
          method: 'GET',
          path: '/rest/api/3/user/search',
          query: { query: assigneeEmail, maxResults: '1' },
        });
        accountId = userSearch?.[0]?.accountId;
        if (!accountId) {
          LOGGER.warn(
            'jira_claim_ticket: no Jira user found for assignee; skipping assignee',
            { assigneeEmail, key },
          );
          warnings.push(
            `Could not assign ticket: no Jira user found for email "${assigneeEmail}".`,
          );
        }
      } else {
        // No email configured — default to the authenticated service account.
        const self = await jiraRequest<{ accountId: string }>({
          method: 'GET',
          path: '/rest/api/3/myself',
        });
        accountId = self?.accountId;
      }

      if (accountId) {
        await jiraRequest({
          method: 'PUT',
          path: `/rest/api/3/issue/${key}/assignee`,
          body: { accountId },
        });
      }
    } catch (assignErr) {
      const msg =
        assignErr instanceof Error ? assignErr.message : String(assignErr);
      LOGGER.error(
        'jira_claim_ticket: assignee update failed (non-fatal)',
        assignErr instanceof Error ? assignErr : new Error(msg),
        { key },
      );
      warnings.push(`Assignee update failed (non-fatal): ${msg}`);
    }

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
    .filter(
      (link) =>
        link.inwardIssue &&
        link.type.inward.toLowerCase().includes('is blocked by'),
    )
    .map((link) => ({
      key: link.inwardIssue!.key,
      status: link.inwardIssue!.fields.status.name,
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
  action: 'PROCEED' | 'STOP' | 'ALREADY_CLAIMED';
  claimed: boolean;
  reason?: string;
  branchRecommendation?: string;
  ticket: Record<string, unknown>;
  warnings: string[];
  blockers?: Array<{ key: string; status: string }>;
}

function makeResult(result: ClaimResult): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
