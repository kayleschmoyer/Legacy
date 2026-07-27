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
