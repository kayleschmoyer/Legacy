import { LOGGER } from '@legacy-sports/logging';
import {
  createCheckRun,
  getInstallationToken,
  getPrReviews,
  getPrReviewThreads,
} from './github-app';

// Review Bot GitHub App ID (registered in LS-3002 with checks:write)
const REVIEW_BOT_APP_ID = 3142924;

// Logins used by Copilot in review thread comments and reviews
const COPILOT_LOGINS = new Set([
  'copilot-pull-request-reviewer',
  'copilot-pull-request-reviewer[bot]',
  'Copilot',
]);

interface PullRequestReviewThreadPayload {
  action: string;
  pull_request: {
    number: number;
    head: { sha: string };
  };
  repository: {
    name: string;
    owner: { login: string };
  };
  installation?: { id: number };
}

/**
 * Handle a `pull_request_review_thread` webhook event.
 *
 * On `action === "resolved"`:
 *   1. Gets an installation token for the Review Bot using its private key.
 *   2. Queries all review threads on the PR.
 *   3. If all non-outdated threads are resolved → sets bot-review to success.
 *   4. If any unresolved threads remain → sets bot-review to failure.
 *
 * On `action === "unresolved"`:
 *   Same steps — a re-opened thread must flip bot-review back to failure.
 *
 * Returns a human-readable result string for logging.
 */
export async function handleReviewThreadEvent(
  payload: PullRequestReviewThreadPayload,
  botAppPrivateKey: string,
): Promise<string> {
  if (payload.action !== 'resolved' && payload.action !== 'unresolved') {
    return `Ignored action="${payload.action}"`;
  }

  const prNumber = payload.pull_request.number;
  const headSha = payload.pull_request.head.sha;
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;

  const installationId = payload.installation?.id;
  if (!installationId) {
    LOGGER.warn(
      'Ignoring pull_request_review_thread event without installation.id — webhook source may be misconfigured',
      { action: payload.action, prNumber, owner, repo, headSha },
    );
    return `Ignored pull_request_review_thread event for PR #${prNumber}: missing installation.id`;
  }

  LOGGER.info('Handling pull_request_review_thread event', {
    action: payload.action,
    prNumber,
    owner,
    repo,
    headSha,
  });

  const token = await getInstallationToken(
    REVIEW_BOT_APP_ID,
    botAppPrivateKey,
    installationId,
  );

  const [threads, reviews] = await Promise.all([
    getPrReviewThreads(token, owner, repo, prNumber),
    getPrReviews(token, owner, repo, prNumber),
  ]);

  // Mirror the workflow's copilotCleared logic: when Copilot explicitly approved
  // or couldn't review any files, its own threads are superseded and don't block.
  const copilotReviews = reviews
    .filter((r) => COPILOT_LOGINS.has(r.userLogin))
    .sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );
  const latestCopilot = copilotReviews[0];
  const copilotCleared =
    latestCopilot != null &&
    (latestCopilot.state === 'APPROVED' ||
      (latestCopilot.body?.includes("wasn't able to review any files") ??
        false));

  const unresolvedThreads = threads.filter((t) => {
    if (t.isOutdated || t.isResolved) return false;
    // When Copilot cleared, its own threads are superseded — only block on non-Copilot threads
    if (
      copilotCleared &&
      t.authorLogin !== null &&
      COPILOT_LOGINS.has(t.authorLogin)
    )
      return false;
    return true;
  });

  if (unresolvedThreads.length > 0) {
    LOGGER.info(
      'Unresolved review threads remain — setting bot-review to failure',
      {
        prNumber,
        unresolved: unresolvedThreads.length,
        copilotCleared,
      },
    );
    await createCheckRun(token, owner, repo, {
      name: 'bot-review',
      headSha,
      conclusion: 'failure',
      title: 'Review blocked',
      summary: `PR has ${unresolvedThreads.length} unresolved comment(s)`,
    });
    return `Set bot-review=failure for PR #${prNumber}: ${unresolvedThreads.length} unresolved thread(s)`;
  }

  await createCheckRun(token, owner, repo, {
    name: 'bot-review',
    headSha,
    conclusion: 'success',
    title: 'All review threads resolved',
    summary: 'All review threads resolved',
  });

  return `Set bot-review=success for PR #${prNumber} (${owner}/${repo}@${headSha.slice(0, 7)})`;
}
