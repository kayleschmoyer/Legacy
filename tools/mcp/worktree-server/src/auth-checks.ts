/**
 * Jira sub-check for `auth_check_all`.
 *
 * The `legacy-sports-jira` MCP server the agent actually talks to is hosted
 * (Lambda), not a local process — its own credentials (JIRA_CLIENT_ID /
 * JIRA_CLIENT_SECRET / JIRA_CLOUD_ID) live in AWS Secrets Manager and are
 * injected server-side (see `tools/mcp/jira-server/src/lambda.ts`), never in
 * this process's env. What *is* visible locally is whatever lets this
 * session reach that hosted server:
 *   - local / worktree sessions: MCP_JIRA_URL + MCP_MACHINE_CLIENT_ID +
 *     MCP_MACHINE_CLIENT_SECRET, mirrored into every session's env by
 *     `scripts/mcp-auth.mjs` (docs/rfcs/draft-seamless-mcp-auth.md).
 *   - Copilot cloud sessions: MCP_JIRA_URL + a pre-minted MCP_JIRA_BEARER
 *     (`.github/workflows/copilot-setup-steps.yml`).
 * Direct env (JIRA_EMAIL/JIRA_API_TOKEN, JIRA_CLIENT_ID/SECRET/CLOUD_ID) and
 * ~/.netrc remain valid fallbacks for a jira-server run as a direct stdio
 * process.
 */
export interface JiraAuthCheckResult {
  ok: boolean;
  method?: 'env:basic' | 'env:oauth' | 'netrc' | 'hosted:oauth';
}

/**
 * `auth_check_all` (and its per-service sub-checks) verify local credential/
 * config *presence* only — env vars, cache files, netrc entries, or (for AWS)
 * a live STS call against the credential this process itself holds. None of
 * that can observe whether the *hosted* github/jira/ci/db/rollbar MCP
 * connectors are actually reachable this session: those run as separate
 * OAuth-authenticated connectors registered in claude.ai, and their
 * connection/session state is owned by the Claude Code client, not by this
 * (or any) repo-side process — there is no API this server can call to ask
 * "is the jira connector's OAuth session currently valid?"
 *
 * This gap has been proposed as an `auth_check_all` fix three times
 * (LS-9439, LS-9370, LS-9924) after each recurrence of hosted connectors
 * reporting healthy here while every real call to them failed with
 * "Incompatible auth server: does not support dynamic client registration"
 * or CONNECTION_CLOSED. It has not been actioned because it is not
 * reachable from this server's process boundary, not because it was
 * overlooked — do not re-propose it as a code fix without first explaining
 * what changed about that boundary. Surface the limitation instead so
 * agents don't trust a green result over a real tool-call error; see
 * `.agents/skills/mcp-first/references/diagnostics.md` for the recovery
 * protocol (re-probe ToolSearch by bare tool name; proceed on the
 * documented CLI/REST fallback; report the outage in the gap audit).
 */
export const HOSTED_CONNECTOR_CAVEAT =
  'Presence-only: confirms local credentials/config exist, not that the hosted ' +
  'github/jira/ci/db/rollbar connectors are currently reachable this session. ' +
  'Cannot detect a connector-layer outage (e.g. "Incompatible auth server: does ' +
  'not support dynamic client registration", CONNECTION_CLOSED) — those have ' +
  'reported allAuthenticated: true throughout real outages (LS-9439, LS-9370, ' +
  'LS-9924). Trust an actual tool-call error over this result; see ' +
  '.agents/skills/mcp-first/references/diagnostics.md for recovery steps. ' +
  'Pass `sessionToolNames` (the tool names visible in your own session) to get ' +
  'a roster cross-check that catches the stronger case of the connector being ' +
  'entirely absent from the tool list, not just unreachable (LS-9749) — see ' +
  '`rosterAbsent` on each service below.';

/**
 * Tool-name patterns identifying each hosted connector's tools as they'd
 * appear in a session's tool roster. Used only when the caller supplies
 * `sessionToolNames` (this server's own process cannot see the caller's tool
 * roster — that lives in the Claude Code client, not here) to catch the case
 * where a service's credentials/config look present but its MCP server never
 * appeared in the session at all (LS-9749) — a stronger, more misleading
 * false-green than the already-documented "connector present but OAuth
 * session dead" gap above.
 */
export const ROSTER_TOOL_PATTERNS: Readonly<Record<string, RegExp>> = {
  github: /^(mcp__legacy-sports-github__|github_)/,
  jira: /^(mcp__legacy-sports-jira__|jira_)/,
  ci: /^(mcp__legacy-sports-ci-local__|ci_)/,
};

/**
 * Returns `undefined` (unknown — caller didn't opt in) when `sessionToolNames`
 * is omitted, `true` if a matching tool name is present, `false` if the
 * caller's roster demonstrably has none.
 */
export function rosterHasService(
  service: keyof typeof ROSTER_TOOL_PATTERNS,
  sessionToolNames: readonly string[] | undefined,
): boolean | undefined {
  if (sessionToolNames === undefined) return undefined;
  const pattern = ROSTER_TOOL_PATTERNS[service];
  return sessionToolNames.some((name) => pattern.test(name));
}

export function checkJiraAuth(
  env: NodeJS.ProcessEnv,
  checkNetrc: (machine: string) => boolean,
): JiraAuthCheckResult {
  const jiraBasic = !!(env.JIRA_EMAIL && env.JIRA_API_TOKEN);
  const jiraOAuth = !!(
    env.JIRA_CLIENT_ID &&
    env.JIRA_CLIENT_SECRET &&
    env.JIRA_CLOUD_ID
  );
  const jiraNetrc =
    checkNetrc('atlassian.net') ||
    checkNetrc('bkrupa.atlassian.net') ||
    checkNetrc('id.atlassian.com');
  const jiraHosted = !!(
    env.MCP_JIRA_URL &&
    (env.MCP_JIRA_BEARER ||
      (env.MCP_MACHINE_CLIENT_ID && env.MCP_MACHINE_CLIENT_SECRET))
  );

  if (jiraBasic) return { ok: true, method: 'env:basic' };
  if (jiraOAuth) return { ok: true, method: 'env:oauth' };
  if (jiraNetrc) return { ok: true, method: 'netrc' };
  if (jiraHosted) return { ok: true, method: 'hosted:oauth' };
  return { ok: false };
}
