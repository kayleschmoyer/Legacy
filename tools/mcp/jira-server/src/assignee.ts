import { LOGGER } from '@legacy-sports/logging/server';
import { jiraRequest } from './jira-api.js';
import { searchJql } from './jql-search.js';

export interface ResolveAndAssignParams {
  key: string;
  /** Explicit email param passed by the caller (e.g. the tool's `assignee` arg). */
  explicitAssignee?: string;
  /** Explicit accountId param passed by the caller (e.g. the tool's `assigneeAccountId` arg). */
  explicitAssigneeAccountId?: string;
  /** Tool name used to prefix log lines (e.g. 'jira_transition'). */
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

interface ResolvedUser {
  accountId: string;
  displayName?: string;
}

/**
 * Process-lifetime cache of email -> resolved user. A Lambda container serves
 * many claims, and the resolution costs a Jira round trip that always returns
 * the same answer for a given email.
 */
const emailResolutionCache = new Map<string, ResolvedUser>();

/**
 * Resolve an email to an accountId via `GET /rest/api/3/user/search`.
 *
 * Requires the `read:jira-user` scope. Local basic-auth sessions have it;
 * the hosted Lambda's client-credentials token does not, so this 401s there
 * (LS-7891) and the caller falls through to {@link resolveEmailViaJql}.
 */
async function resolveEmailViaUserSearch(
  email: string,
): Promise<ResolvedUser | undefined> {
  const results = await jiraRequest<
    { accountId: string; displayName?: string }[]
  >({
    method: 'GET',
    path: '/rest/api/3/user/search',
    query: { query: email, maxResults: '1' },
  });
  const accountId = results?.[0]?.accountId;
  if (accountId === undefined) return undefined;
  return { accountId, displayName: results[0]?.displayName };
}

interface AssigneeField {
  assignee: { accountId: string; displayName?: string } | null;
}

/**
 * Resolve an email to an accountId using only `read:jira-work`.
 *
 * JQL accepts an email address as a user reference, and issue search is
 * permitted under `read:jira-work` — unlike every user-lookup endpoint
 * (`/myself`, `/user/search`, `/user/assignable/search`,
 * `/user/permission/search`, `/user/bulk`), all of which 401 with
 * "Unauthorized; scope does not match" under the hosted Lambda's
 * client-credentials token. `read:jira-user` is not currently grantable to
 * the service app either (the token endpoint rejects it as `invalid_scope`),
 * so this is the only email-based path that works there.
 *
 * Any issue already assigned to that email carries the accountId we need in
 * `fields.assignee.accountId`, which is exactly what
 * `PUT /issue/{key}/assignee` expects.
 *
 * Limitation: the target user must already have at least one issue assigned
 * somewhere on the site. A brand-new user with no assignments cannot be
 * resolved this way — that case falls through to a warning.
 */
async function resolveEmailViaJql(
  email: string,
): Promise<ResolvedUser | undefined> {
  // The email is interpolated into a JQL string, so a stray double quote
  // would terminate the literal early. Jira escapes it with a backslash.
  const escaped = email.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const result = await searchJql<AssigneeField>({
    jql: `assignee = "${escaped}" ORDER BY updated DESC`,
    fields: ['assignee'],
    maxResults: 1,
  });
  const assignee = result.issues[0]?.fields.assignee;
  if (!assignee) return undefined;
  return { accountId: assignee.accountId, displayName: assignee.displayName };
}

/**
 * Resolve an email to an accountId, trying the direct user-lookup endpoint
 * first and falling back to JQL when it is unavailable (hosted Lambda) or
 * returns no match.
 */
async function resolveEmailToAccountId(
  email: string,
  toolName: string,
): Promise<ResolvedUser | undefined> {
  const cached = emailResolutionCache.get(email);
  if (cached) return cached;

  let resolved: ResolvedUser | undefined;

  try {
    resolved = await resolveEmailViaUserSearch(email);
  } catch (err) {
    LOGGER.info(
      `${toolName}: /user/search unavailable for assignee lookup, falling back to JQL`,
      {
        assigneeEmail: email,
        // Pass the Error instance itself, not just its message — Rollbar
        // extracts the stack trace from an Error and cannot from a string.
        error: err instanceof Error ? err : String(err),
      },
    );
  }

  if (!resolved) {
    resolved = await resolveEmailViaJql(email);
  }

  if (resolved) {
    emailResolutionCache.set(email, resolved);
  }
  return resolved;
}

/** Reset the email->accountId cache (for testing). */
export function _resetAssigneeCache(): void {
  emailResolutionCache.clear();
}

/**
 * Resolve an assignee accountId and PUT it onto the ticket.
 *
 * Precedence: explicit `assigneeAccountId` param (direct, no lookup) >
 * explicit `assignee` email param > `JIRA_ASSIGNEE_ACCOUNT_ID` env var
 * (direct, no lookup) > `JIRA_ASSIGNEE_EMAIL` env var > the authenticated
 * service account (via `GET /rest/api/3/myself`).
 *
 * accountId-based paths are checked before their email counterparts because
 * they need no lookup at all. Email resolution itself is two-stage — see
 * {@link resolveEmailToAccountId}: `/rest/api/3/user/search` where the
 * `read:jira-user` scope is available, otherwise a JQL search that works
 * under `read:jira-work` (LS-9513). The `/myself` last resort still 401s on
 * the hosted Lambda (LS-7891) and remains a local-session-only path.
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
      const resolved = await resolveEmailToAccountId(emailToLookUp, toolName);
      accountId = resolved?.accountId;
      displayName = resolved?.displayName ?? emailToLookUp;
      if (!accountId) {
        LOGGER.warn(
          `${toolName}: no Jira user found for assignee; skipping assignee`,
          { assigneeEmail: emailToLookUp, key },
        );
        warnings.push(
          `Could not assign ticket: no Jira user found for email "${emailToLookUp}". ` +
            'Email resolution falls back to a JQL lookup, which only finds users who ' +
            'already have at least one issue assigned to them.',
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
