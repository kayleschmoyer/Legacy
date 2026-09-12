import { LOGGER } from '@legacy-sports/logging/server';
import { jiraRequest } from './jira-api.js';
import { getJiraCredentials } from './netrc.js';
import { searchJql } from './jql-search.js';
import { type AssigneeCaller, resolveCallerEmail } from './caller-email.js';

export type { AssigneeCaller } from './caller-email.js';

export interface ResolveAssigneeParams {
  key: string;
  /** Explicit email param passed by the caller (e.g. the tool's `assignee` arg). */
  explicitAssignee?: string;
  /** Explicit accountId param passed by the caller (e.g. the tool's `assigneeAccountId` arg). */
  explicitAssigneeAccountId?: string;
  /**
   * Who sent the hosted MCP request (from its bearer token). Present only on
   * the shared Lambda; when present, the single-user env/`/myself` fallbacks
   * are never used, because they cannot tell callers apart.
   */
  caller?: AssigneeCaller;
  /** Tool name used to prefix log lines (e.g. 'jira_transition'). */
  toolName: string;
}

export interface ResolveAndAssignParams extends ResolveAssigneeParams {
  /**
   * Clear the ticket's assignee instead of resolving/assigning a user. Skips
   * every resolution path (no email/env lookups) and PUTs `accountId: null`.
   */
  unassign?: boolean;
}

export interface ResolveAndAssignResult {
  accountId: string | undefined;
  displayName: string | undefined;
  warnings: string[];
}

export type AssigneeResolution =
  | { ok: true; accountId: string; displayName?: string }
  | { ok: false; error: string };

const MACHINE_CALLER_ERROR =
  'this request was authenticated with a machine (client_credentials) token, ' +
  'which identifies no person, so there is nobody to assign. Pass `assignee` ' +
  '(your Jira email) or `assigneeAccountId` explicitly.';

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
    try {
      resolved = await resolveEmailViaJql(email);
    } catch (err) {
      LOGGER.warn(
        `${toolName}: JQL email fallback also failed for assignee lookup`,
        {
          assigneeEmail: email,
          error: err instanceof Error ? err : String(err),
        },
      );
    }
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

export interface ApplyAssigneeChangeParams {
  key: string;
  /** Assignee email from the caller's tool params. Null/"" means "not a value". */
  assignee?: string | null;
  /** Assignee accountId from the caller's tool params. Null/"" means "not a value". */
  assigneeAccountId?: string | null;
  toolName: string;
}

/**
 * Standalone assignee editing entry point for `jira_edit_ticket` /
 * `jira_bulk_edit` (LS-9607). Assigns via {@link resolveAndAssign} when either
 * param carries a non-empty value (accountId takes precedence); unassigns
 * (`accountId: null`) when both are null/empty/omitted-together. Callers
 * gate on `assignee !== undefined || assigneeAccountId !== undefined` first
 * — this only decides which `resolveAndAssign` branch to take.
 */
export async function applyAssigneeChange({
  key,
  assignee,
  assigneeAccountId,
  toolName,
}: ApplyAssigneeChangeParams): Promise<ResolveAndAssignResult> {
  const hasAssignValue = Boolean(assigneeAccountId) || Boolean(assignee);
  return hasAssignValue
    ? resolveAndAssign({
        key,
        explicitAssignee: assignee ?? undefined,
        explicitAssigneeAccountId: assigneeAccountId ?? undefined,
        toolName,
      })
    : resolveAndAssign({ key, toolName, unassign: true });
}

async function resolveEmailOrFail(
  email: string,
  source: string,
  toolName: string,
  key: string,
): Promise<AssigneeResolution> {
  const resolved = await resolveEmailToAccountId(email, toolName);
  if (resolved) {
    return {
      ok: true,
      accountId: resolved.accountId,
      displayName: resolved.displayName ?? email,
    };
  }
  LOGGER.warn(`${toolName}: no Jira user found for assignee`, {
    assigneeEmail: email,
    key,
  });
  return {
    ok: false,
    error:
      `no Jira user found for email "${email}" (${source}). Email resolution ` +
      'falls back to a JQL lookup, which only finds users who already have at ' +
      'least one issue assigned to them. Remedy: pass `assigneeAccountId` ' +
      'explicitly to skip email resolution entirely.',
  };
}

/**
 * Decide who a ticket should be assigned to, without writing anything.
 *
 * Precedence: explicit `assigneeAccountId` (no lookup) > explicit `assignee`
 * email > the hosted caller's own email (from their bearer token). On the
 * hosted Lambda (`caller` present) that is the end of the list — a machine
 * token or an unresolvable caller is an error, never a fixed fallback
 * account, because the Lambda is shared by every user.
 *
 * Without a caller (the local stdio server, which has exactly one user) the
 * single-user fallbacks follow: `JIRA_ASSIGNEE_ACCOUNT_ID` >
 * `JIRA_ASSIGNEE_EMAIL` > `GET /rest/api/3/myself`. `/myself` needs
 * `read:jira-user`, which OAuth client-credentials tokens cannot carry
 * (LS-7891), so it only runs under basic auth.
 *
 * Email resolution is two-stage — see {@link resolveEmailToAccountId}.
 */
export async function resolveAssignee({
  key,
  explicitAssignee,
  explicitAssigneeAccountId,
  caller,
  toolName,
}: ResolveAssigneeParams): Promise<AssigneeResolution> {
  if (explicitAssigneeAccountId) {
    return { ok: true, accountId: explicitAssigneeAccountId };
  }
  if (explicitAssignee) {
    return resolveEmailOrFail(
      explicitAssignee,
      'from the `assignee` param',
      toolName,
      key,
    );
  }

  if (caller) {
    if (caller.kind === 'machine') {
      return { ok: false, error: MACHINE_CALLER_ERROR };
    }
    const email = await resolveCallerEmail(caller);
    if (!email) {
      return {
        ok: false,
        error:
          "could not determine the signed-in caller's email from their token " +
          '(Cognito userInfo lookup failed or returned no email). Pass ' +
          '`assignee` (your Jira email) or `assigneeAccountId` explicitly.',
      };
    }
    return resolveEmailOrFail(
      email,
      "the signed-in caller's email",
      toolName,
      key,
    );
  }

  const envAccountId = process.env['JIRA_ASSIGNEE_ACCOUNT_ID'];
  if (envAccountId) return { ok: true, accountId: envAccountId };
  const envEmail = process.env['JIRA_ASSIGNEE_EMAIL'];
  if (envEmail) {
    return resolveEmailOrFail(
      envEmail,
      'from JIRA_ASSIGNEE_EMAIL',
      toolName,
      key,
    );
  }

  try {
    const creds = await getJiraCredentials();
    if (creds.type === 'oauth') {
      return {
        ok: false,
        error:
          'no assignee param and no JIRA_ASSIGNEE_EMAIL/JIRA_ASSIGNEE_ACCOUNT_ID ' +
          "env var were set, and this server's OAuth token cannot resolve the " +
          'current user (GET /rest/api/3/myself always 401s under a ' +
          'client-credentials token — a permanent scope gap, not a transient ' +
          'failure). Remedy: pass `assignee` (email) or `assigneeAccountId` ' +
          'explicitly, or set JIRA_ASSIGNEE_EMAIL / JIRA_ASSIGNEE_ACCOUNT_ID ' +
          'in the environment.',
      };
    }
    const self = await jiraRequest<{ accountId: string; displayName?: string }>(
      { method: 'GET', path: '/rest/api/3/myself' },
    );
    if (self?.accountId) {
      return {
        ok: true,
        accountId: self.accountId,
        displayName: self.displayName,
      };
    }
    return {
      ok: false,
      error:
        'the current-user lookup returned no accountId. Remedy: pass ' +
        '`assignee` (email) or `assigneeAccountId` explicitly, or set ' +
        'JIRA_ASSIGNEE_EMAIL / JIRA_ASSIGNEE_ACCOUNT_ID in the environment.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    LOGGER.error(
      `${toolName}: assignee resolution failed`,
      err instanceof Error ? err : new Error(msg),
      { key },
    );
    return {
      ok: false,
      error:
        `${msg} Remedy: pass \`assignee\` (email) or \`assigneeAccountId\` ` +
        'explicitly, or set JIRA_ASSIGNEE_EMAIL / JIRA_ASSIGNEE_ACCOUNT_ID in ' +
        'the environment, instead of relying on the current-user lookup.',
    };
  }
}

/** PUT a resolved accountId onto the ticket; returns a warning on failure. */
export async function putAssignee(
  key: string,
  accountId: string,
  toolName: string,
): Promise<string | undefined> {
  try {
    await jiraRequest({
      method: 'PUT',
      path: `/rest/api/3/issue/${key}/assignee`,
      body: { accountId },
    });
    return undefined;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    LOGGER.error(
      `${toolName}: assignee update failed (non-fatal)`,
      err instanceof Error ? err : new Error(msg),
      { key },
    );
    return (
      `Assignee update failed (non-fatal): ${msg} Remedy: the PUT to ` +
      '/issue/{key}/assignee itself failed — verify the accountId is valid and ' +
      'the token has write:jira-work, or set the assignee manually in Jira.'
    );
  }
}

/**
 * Resolve an assignee and PUT it onto the ticket, never throwing: an
 * unresolvable assignee or a failed PUT comes back as a warning. Callers that
 * must not proceed without an owner (claims) use {@link resolveAssignee}
 * first instead.
 */
export async function resolveAndAssign({
  unassign,
  ...params
}: ResolveAndAssignParams): Promise<ResolveAndAssignResult> {
  const { key, toolName } = params;
  const warnings: string[] = [];

  if (unassign) {
    try {
      await jiraRequest({
        method: 'PUT',
        path: `/rest/api/3/issue/${key}/assignee`,
        body: { accountId: null },
      });
    } catch (unassignErr) {
      const msg =
        unassignErr instanceof Error
          ? unassignErr.message
          : String(unassignErr);
      LOGGER.error(
        `${toolName}: unassign failed (non-fatal)`,
        unassignErr instanceof Error ? unassignErr : new Error(msg),
        { key },
      );
      warnings.push(`Failed to unassign ${key}: ${msg}`);
    }
    return { accountId: undefined, displayName: undefined, warnings };
  }

  const resolution = await resolveAssignee(params);
  if (!resolution.ok) {
    warnings.push(`Could not assign ${key}: ${resolution.error}`);
    return { accountId: undefined, displayName: undefined, warnings };
  }

  const putWarning = await putAssignee(key, resolution.accountId, toolName);
  if (putWarning) {
    warnings.push(putWarning);
    return { accountId: undefined, displayName: undefined, warnings };
  }
  return {
    accountId: resolution.accountId,
    displayName: resolution.displayName,
    warnings,
  };
}
