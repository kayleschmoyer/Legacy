import { LOGGER } from '@legacy-sports/logging';
import {
  addLabel,
  createCheckRun,
  getInstallationToken,
  getPrReviews,
  getPrReviewThreads,
  listPullRequestsForCommit,
} from './github-app';

// Review Bot GitHub App ID (registered in LS-3002 with checks:write)
const REVIEW_BOT_APP_ID = 3142924;

// Only handle the Copilot code review workflow — all other workflow_run events
// (CI, security scans, etc.) are ignored.
const COPILOT_REVIEW_WORKFLOW_NAME = 'Copilot code review';

// All known logins Copilot uses across review thread comments, review
// submissions, and requested_reviewers. Must stay in sync with the equivalent
// sets in handle-pull-request-review.ts, handle-review-thread.ts, and
// copilot-review-handler.yml.
const COPILOT_LOGINS = new Set([
  'copilot-pull-request-reviewer',
  'copilot-pull-request-reviewer[bot]',
  'Copilot',
]);

interface WorkflowRunPayload {
  action: string;
  workflow_run: {
    name: string;
    head_sha: string;
    head_repository?: { full_name: string };
  };
  repository: {
    name: string;
    owner: { login: string };
    full_name: string;
  };
  installation?: { id: number };
}

/**
 * Handle a `workflow_run` webhook event.
 *
 * Only acts on `action === "completed"` for the "Copilot code review" workflow.
 *
 * Why this handler exists:
 *   Copilot (a GitHub App) does not fire `pull_request_review` repository
 *   webhook events — its reviews are App-to-App and never reach the Lambda.
 *   The Lambda creates a `bot-review=in_progress` check run on push using the
 *   Review Bot App token. Only the same App can PATCH that run (GitHub enforces
 *   check-run ownership), so the `copilot-review-handler.yml` workflow
 *   (which runs as GITHUB_TOKEN / github-actions app) cannot close it.
 *
 *   By subscribing the Review Bot GitHub App to `workflow_run` events, the
 *   Lambda receives a webhook when Copilot finishes and can PATCH its own
 *   in_progress run to success or failure — eliminating the stuck run.
 *
 * Prerequisite:
 *   The Review Bot GitHub App must have `workflow_run` checked under
 *   "Subscribe to events" in its settings page on GitHub.
 *
 * The `copilot-review-handler.yml` workflow remains active as a parallel
 * path: it cannot PATCH the Lambda's run (cross-app), so it always POSTs a
 * new completed run. Having both is harmless — GitHub's required status
 * checks use the latest result, so both writers agree.
 */
export async function handleWorkflowRunEvent(
  payload: WorkflowRunPayload,
  botAppPrivateKey: string,
): Promise<string> {
  if (payload.action !== 'completed') {
    return `Ignored workflow_run action="${payload.action}"`;
  }

  if (payload.workflow_run.name !== COPILOT_REVIEW_WORKFLOW_NAME) {
    return `Ignored workflow="${payload.workflow_run.name}"`;
  }

  const headSha = payload.workflow_run.head_sha;
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;

  // Skip fork PRs — the Lambda's in_progress run was never created for them.
  const headRepoFullName = payload.workflow_run.head_repository?.full_name;
  if (headRepoFullName && headRepoFullName !== payload.repository.full_name) {
    return `Ignored fork workflow_run (head_repo=${headRepoFullName})`;
  }

  const installationId = payload.installation?.id;
  if (!installationId) {
    LOGGER.warn(
      'Ignoring workflow_run event without installation.id — webhook source may be misconfigured',
      { owner, repo, headSha },
    );
    return `Ignored workflow_run event for ${owner}/${repo}: missing installation.id`;
  }

  LOGGER.info('Handling workflow_run event for Copilot code review', {
    owner,
    repo,
    headSha,
  });

  const token = await getInstallationToken(
    REVIEW_BOT_APP_ID,
    botAppPrivateKey,
    installationId,
  );

  // workflow_run.pull_requests is always empty for the Copilot code review
  // workflow (triggered by GitHub's internal App machinery, not a pull_request
  // event). Look up the PR by headSha instead.
  const allPrs = await listPullRequestsForCommit(token, owner, repo, headSha);
  const openPrs = allPrs
    .filter(
      (pr) =>
        pr.state === 'open' &&
        pr.headSha === headSha &&
        pr.headRepoFullName === `${owner}/${repo}`,
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  if (openPrs.length === 0) {
    LOGGER.info('No open PR found for commit — skipping', {
      owner,
      repo,
      headSha,
    });
    return `No open PR found for ${owner}/${repo}@${headSha.slice(0, 7)} — skipping`;
  }

  if (openPrs.length > 1) {
    LOGGER.info(
      `Multiple open PRs found for SHA — selecting PR #${openPrs[0].number} (newest updated_at)`,
      { prNumbers: openPrs.map((p) => p.number), headSha },
    );
  }

  const prNumber = openPrs[0].number;

  const [threads, reviews] = await Promise.all([
    getPrReviewThreads(token, owner, repo, prNumber),
    getPrReviews(token, owner, repo, prNumber),
  ]);

  // Mirror the copilotCleared logic from handle-review-thread.ts and
  // handle-pull-request-review.ts: scope to headSha to avoid applying a stale
  // review from an older commit.
  const copilotReviews = reviews
    .filter((r) => COPILOT_LOGINS.has(r.userLogin) && r.commitId === headSha)
    .sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );

  if (copilotReviews.length === 0) {
    LOGGER.info('No Copilot review found for current SHA — skipping', {
      prNumber,
      headSha,
    });
    return `No Copilot review found for PR #${prNumber} @ ${headSha.slice(0, 7)} — skipping`;
  }

  const latestCopilot = copilotReviews[0];
  const copilotCleared =
    latestCopilot.state === 'APPROVED' ||
    (latestCopilot.body?.includes("wasn't able to review any files") ??
      false) ||
    (latestCopilot.body?.includes('generated no new comments') ?? false);

  LOGGER.info('Copilot review found', {
    state: latestCopilot.state,
    copilotCleared,
    prNumber,
  });

  // Same thread filter as handle-review-thread.ts: only block on unresolved
  // Copilot threads when copilotCleared=false (i.e. Copilot actually left
  // inline comments). A PR-overview COMMENTED review has no reviewThreads,
  // so it never triggers a false block here.
  const unresolvedThreads = threads.filter((t) => {
    if (t.isOutdated || t.isResolved) return false;
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
      { prNumber, unresolved: unresolvedThreads.length, copilotCleared },
    );
    await createCheckRun(token, owner, repo, {
      name: 'bot-review',
      headSha,
      conclusion: 'failure',
      title: 'Review blocked',
      summary: `PR has ${unresolvedThreads.length} unresolved review thread(s)`,
    });
    return `Set bot-review=failure for PR #${prNumber}: ${unresolvedThreads.length} unresolved thread(s)`;
  }

  await createCheckRun(token, owner, repo, {
    name: 'bot-review',
    headSha,
    conclusion: 'success',
    title: 'Copilot review passed',
    summary: 'All review threads resolved',
  });
  await addLabel(token, owner, repo, prNumber, 'merge-when-ready');

  return `Set bot-review=success for PR #${prNumber} (${owner}/${repo}@${headSha.slice(0, 7)})`;
}
