import { LOGGER } from '@legacy-sports/logging';
import { getRepoInstallationToken, REQUEST_TIMEOUT_MS } from './github-app';

/**
 * Minimal shape of a Jira issue_updated webhook payload.
 * Only the fields we act on are typed; extras are ignored.
 */
interface JiraTransitionPayload {
  webhookEvent?: string;
  issue?: {
    key?: string;
  };
  changelog?: {
    items?: Array<{
      field?: string;
      fromString?: string | null;
      toString?: string | null;
    }>;
  };
}

export interface JiraTransitionResult {
  issueKey: string;
  fromStatus: string;
  toStatus: string;
}

/**
 * Handle a Jira issue_updated webhook event.
 *
 * Only fires a GitHub repository_dispatch when the event contains a status
 * field change in the changelog. Other issue_updated events (field edits,
 * comment updates, etc.) are ignored to avoid noisy dispatches.
 *
 * @param payload       - Parsed Jira webhook body
 * @param appPrivateKey - PEM private key for the Agent Author GitHub App
 * @param appId         - Numeric GitHub App ID for the Agent Author app
 * @param githubRepo    - "owner/repo" string (e.g. "bkrupa/legacy-sports")
 * @returns Description of the action taken, for logging
 */
export async function handleJiraTransitionEvent(
  payload: JiraTransitionPayload,
  appPrivateKey: string,
  appId: number,
  githubRepo: string,
): Promise<string> {
  if (payload.webhookEvent !== 'jira:issue_updated') {
    return `Ignored webhookEvent="${payload.webhookEvent ?? 'unknown'}"`;
  }

  const issueKey = payload.issue?.key;
  if (!issueKey) {
    return 'Ignored — missing issue key in payload';
  }

  // Only act on status transitions — ignore other field changes
  const statusChange = payload.changelog?.items?.find(
    (item) => item.field === 'status',
  );
  if (!statusChange) {
    return `Ignored ${issueKey} — no status change in changelog`;
  }

  const fromStatus = statusChange.fromString ?? 'unknown';
  const toStatus = statusChange.toString ?? 'unknown';

  LOGGER.info('Dispatching jira-issue-updated to GitHub', {
    issueKey,
    fromStatus,
    toStatus,
    repo: githubRepo,
  });

  const repoParts = githubRepo
    .trim()
    .split('/')
    .map((part) => part.trim());
  if (
    repoParts.length !== 2 ||
    repoParts[0].length === 0 ||
    repoParts[1].length === 0
  ) {
    throw new Error(
      `Invalid GITHUB_REPO format: "${githubRepo}" — expected "owner/repo"`,
    );
  }
  const [owner, repo] = repoParts;

  // Exchange the app's private key for a short-lived installation token so we
  // don't need to store a long-lived PAT in Secrets Manager.
  const installationToken = await getRepoInstallationToken(
    appId,
    appPrivateKey,
    owner,
    repo,
  );

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/dispatches`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${installationToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        event_type: 'jira-issue-updated',
        client_payload: {
          issue_key: issueKey,
          from_status: fromStatus,
          to_status: toStatus,
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `GitHub dispatch failed: HTTP ${response.status} — ${text}`,
    );
  }

  return `Dispatched jira-issue-updated for ${issueKey} (${fromStatus} → ${toStatus})`;
}
