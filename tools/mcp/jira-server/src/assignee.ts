import { LOGGER } from '@legacy-sports/logging/server';
import { jiraRequest } from './jira-api.js';

export interface ResolveAndAssignParams {
  key: string;
  /** Explicit email param passed by the caller (e.g. the tool's `assignee` arg). */
  explicitAssignee?: string;
  /** Explicit accountId param passed by the caller (e.g. the tool's `assigneeAccountId` arg). */
  explicitAssigneeAccountId?: string;
  /** Tool name used to prefix log lines (e.g. 'jira_claim_ticket'). */
  toolName: string;
}

export interface ResolveAndAssignResult {
  accountId: string | undefined;
  displayName: string | undefined;
  warnings: string[];
}

/**
 * The Lambda serving this tool is shared across every caller's session — an
 * env-var-based assignee default has no way to distinguish which user's
 * session is claiming a given ticket, so it silently misattributes every
 * claim that omits an explicit `assignee`/`assigneeAccountId` param to the
 * same fixed account. Surface that loudly (log + returned warning) so it
 * isn't mistaken for correct per-user attribution.
 */
function warnEnvFallback(
  toolName: string,
  key: string,
  envVar: 'JIRA_ASSIGNEE_ACCOUNT_ID' | 'JIRA_ASSIGNEE_EMAIL',
  warnings: string[],
): void {
  const msg =
    `${toolName}: no explicit assignee param was passed for ${key}; falling back to the ` +
    `server-side ${envVar} env var. This Lambda is shared across all callers, so every ` +
    'session that omits an explicit assignee gets attributed to this same fixed account — ' +
    'pass `assignee`/`assigneeAccountId` explicitly to attribute the claim to the caller.';
  LOGGER.warn(msg, { key, toolName, envVar });
  warnings.push(msg);
}

/**
 * Resolve an assignee accountId and PUT it onto the ticket.
 *
 * Precedence: explicit `assigneeAccountId` param (direct, no lookup) >
 * explicit `assignee` email param (via `/rest/api/3/user/search`) >
 * `JIRA_ASSIGNEE_ACCOUNT_ID` env var (direct, no lookup) >
 * `JIRA_ASSIGNEE_EMAIL` env var (via user/search) > the authenticated
 * service account (via `GET /rest/api/3/myself`). accountId-based paths are
 * checked first because `/rest/api/3/user/search` and `/rest/api/3/myself`
 * both require the `read:jira-user` scope, which the hosted Lambda's
 * client-credentials token (read:jira-work write:jira-work) lacks (LS-7891)
 * and therefore always 401s — a pre-resolved accountId is the only mechanism
 * confirmed to actually assign a ticket (LS-9049).
 */
export async function resolveAndAssign({
  key,
  explicitAssignee,
  explicitAssigneeAccountId,
  toolName,
}: ResolveAndAssignParams): Promise<ResolveAndAssignResult> {
  const warnings: string[] = [];

  let accountId: string | undefined;
  let emailToLookUp: string | undefined;

  if (explicitAssigneeAccountId) {
    accountId = explicitAssigneeAccountId;
  } else if (explicitAssignee) {
    emailToLookUp = explicitAssignee;
  } else if (process.env['JIRA_ASSIGNEE_ACCOUNT_ID']) {
    accountId = process.env['JIRA_ASSIGNEE_ACCOUNT_ID'];
    warnEnvFallback(toolName, key, 'JIRA_ASSIGNEE_ACCOUNT_ID', warnings);
  } else if (process.env['JIRA_ASSIGNEE_EMAIL']) {
    emailToLookUp = process.env['JIRA_ASSIGNEE_EMAIL'];
    warnEnvFallback(toolName, key, 'JIRA_ASSIGNEE_EMAIL', warnings);
  }

  try {
    let displayName: string | undefined;

    if (accountId === undefined && emailToLookUp) {
      const userSearch = await jiraRequest<
        { accountId: string; displayName?: string }[]
      >({
        method: 'GET',
        path: '/rest/api/3/user/search',
        query: { query: emailToLookUp, maxResults: '1' },
      });
      accountId = userSearch?.[0]?.accountId;
      displayName = userSearch?.[0]?.displayName ?? emailToLookUp;
      if (!accountId) {
        LOGGER.warn(
          `${toolName}: no Jira user found for assignee; skipping assignee`,
          { assigneeEmail: emailToLookUp, key },
        );
        warnings.push(
          `Could not assign ticket: no Jira user found for email "${emailToLookUp}".`,
        );
      }
    } else if (accountId === undefined) {
      // No explicit/env accountId or email configured — default to the
      // authenticated service account. Requires read:jira-user; works under
      // basic auth, 401s under the Lambda's client-credentials token.
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
      `${toolName}: assignee update failed (non-fatal)`,
      assignErr instanceof Error ? assignErr : new Error(msg),
      { key },
    );
    warnings.push(`Assignee update failed (non-fatal): ${msg}`);
    return { accountId: undefined, displayName: undefined, warnings };
  }
}
