import { LOGGER } from '@legacy-sports/logging';
import { getRepoInstallationToken, REQUEST_TIMEOUT_MS } from './github-app';

/**
 * Minimal shape of a GitHub pull_request_review_thread webhook payload.
 * Only the fields we act on are typed; extras are ignored.
 */
interface ReviewThreadPayload {
  action?: string;
  pull_request?: {
    number?: number;
    labels?: Array<{ name: string }>;
  };
}

/**
 * Handle a GitHub pull_request_review_thread webhook event.
 *
 * Fires a merge-queue workflow_dispatch when a review thread is resolved on a
 * PR that carries the `merge-when-ready` label. Other actions (unresolved) and
 * PRs without the label are silently ignored.
 *
 * The merge-queue workflow runs under a concurrency group with
 * cancel-in-progress: false, so rapid successive thread resolutions queue up
 * safely without race conditions — no additional debounce is needed here.
 *
 * @param payload       - Parsed GitHub webhook body
 * @param appPrivateKey - PEM private key for the Agent Author GitHub App
 * @param appId         - Numeric GitHub App ID for the Agent Author app
 * @param githubRepo    - "owner/repo" string (e.g. "bkrupa/legacy-sports")
 * @returns Description of the action taken, for logging
 */
export async function handleReviewThreadResolvedEvent(
  payload: ReviewThreadPayload,
  appPrivateKey: string,
  appId: number,
  githubRepo: string,
): Promise<string> {
  if (payload.action !== 'resolved') {
    return `Ignored action="${payload.action ?? 'unknown'}"`;
  }

  const prNumber = payload.pull_request?.number;
  if (!prNumber) {
    return 'Ignored — missing pull_request.number in payload';
  }

  const hasLabel = payload.pull_request?.labels?.some(
    (l) => l.name === 'merge-when-ready',
  );
  if (!hasLabel) {
    return `Ignored PR #${prNumber} — merge-when-ready label not present`;
  }

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

  LOGGER.info('Dispatching merge-queue workflow_dispatch', {
    prNumber,
    owner,
    repo,
  });

  const installationToken = await getRepoInstallationToken(
    appId,
    appPrivateKey,
    owner,
    repo,
  );

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/merge-queue.yml/dispatches`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${installationToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `merge-queue dispatch failed: HTTP ${response.status} — ${text}`,
    );
  }

  return `Dispatched merge-queue.yml for PR #${prNumber} after thread resolved`;
}
