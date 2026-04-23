import { LOGGER } from '@legacy-sports/logging';
import {
  addLabel,
  createCheckRun,
  getInstallationToken,
  getPrReviews,
  getRepoInstallationToken,
  requestCopilotReview,
} from './github-app';

const REVIEW_BOT_APP_ID = 3142924;

// All known logins Copilot uses. Must stay in sync with the equivalent sets
// in handle-pull-request-review.ts, handle-review-thread.ts, handle-workflow-run.ts,
// and copilot-review-handler.yml.
const COPILOT_LOGINS = new Set([
  'copilot-pull-request-reviewer',
  'copilot-pull-request-reviewer[bot]',
  'Copilot',
]);

// PRs authored by these bots are auto-passed — Copilot won't review them.
const BOT_AUTHOR_LOGINS = new Set([
  'dependabot[bot]',
  'legacy-sports-code-bot[bot]',
]);

interface PullRequestPayload {
  action: string;
  pull_request: {
    number: number;
    draft: boolean;
    head: { sha: string; repo: { full_name: string } };
    base: { repo: { full_name: string } };
    user: { login: string };
  };
  requested_reviewer?: { login: string };
  repository: { name: string; owner: { login: string } };
  installation?: { id: number };
}

/**
 * Handle a `pull_request` webhook event.
 *
 * opened / synchronize / reopened / ready_for_review:
 *   - Bot-authored PRs → auto-pass bot-review (Copilot won't review them)
 *   - Draft PRs → ignore
 *   - Fork PRs → ignore (no installation token available for cross-repo PRs)
 *   - Otherwise → request Copilot review (no in_progress check run created;
 *     the check appears as a missing required status until Copilot finishes)
 *
 * review_request_removed (Copilot removed as reviewer):
 *   - Wait 5s for any concurrently-submitted review to propagate
 *   - If Copilot posted a review for the current SHA → let pull_request_review handle it
 *   - If not → Copilot declined/aborted → set bot-review=success (clean pass)
 */
export async function handlePullRequestEvent(
  payload: PullRequestPayload,
  botAppPrivateKey: string,
): Promise<string> {
  const { action, pull_request: pr, repository } = payload;
  const prNumber = pr.number;
  const headSha = pr.head.sha;
  const owner = repository.owner.login;
  const repo = repository.name;
  const authorLogin = pr.user.login;

  LOGGER.info('Handling pull_request event', {
    action,
    prNumber,
    owner,
    repo,
    headSha,
    authorLogin,
  });

  // Fork PRs don't have access to secrets — skip them.
  if (pr.head.repo.full_name !== pr.base.repo.full_name) {
    return `Ignored pull_request ${action} for PR #${prNumber}: fork PR`;
  }

  // Filter unhandled actions before fetching the installation token to avoid
  // unnecessary API calls for events like labeled/edited/closed/etc.
  const HANDLED_LIFECYCLE_ACTIONS = new Set([
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
  ]);
  if (
    action !== 'review_request_removed' &&
    !HANDLED_LIFECYCLE_ACTIONS.has(action)
  ) {
    return `Ignored pull_request action="${action}"`;
  }

  // For review_request_removed, bail early if the removed reviewer is not Copilot
  // — no token needed to perform this check.
  if (action === 'review_request_removed') {
    const removedLogin = payload.requested_reviewer?.login ?? '';
    if (!COPILOT_LOGINS.has(removedLogin)) {
      return `Ignored review_request_removed for non-Copilot reviewer @${removedLogin}`;
    }
  }

  // For lifecycle actions, ignore draft PRs before touching the GitHub API.
  if (action !== 'review_request_removed' && pr.draft) {
    return `Ignored pull_request ${action} for draft PR #${prNumber}`;
  }

  // pull_request events from plain git pushes (non-App context) don't carry
  // installation.id. Fall back to a repo lookup when it's absent.
  const installationId = payload.installation?.id;
  const token = installationId
    ? await getInstallationToken(
        REVIEW_BOT_APP_ID,
        botAppPrivateKey,
        installationId,
      )
    : await getRepoInstallationToken(
        REVIEW_BOT_APP_ID,
        botAppPrivateKey,
        owner,
        repo,
      );

  // ── review_request_removed ────────────────────────────────────────────────

  if (action === 'review_request_removed') {
    // Brief wait: review_request_removed can fire fractionally before the
    // submitted review appears in listReviews when Copilot finishes normally.
    await new Promise<void>((r) => setTimeout(r, 5_000));

    const reviews = await getPrReviews(token, owner, repo, prNumber);
    const copilotReviewsForSha = reviews.filter(
      (r) => COPILOT_LOGINS.has(r.userLogin) && r.commitId === headSha,
    );

    if (copilotReviewsForSha.length > 0) {
      return `PR #${prNumber}: Copilot posted a review for current SHA — pull_request_review handler will set status`;
    }

    // Copilot removed without posting a review — treat as clean pass.
    LOGGER.info(
      'Copilot removed without review for current SHA — setting clean pass',
      { prNumber, owner, repo, headSha },
    );
    await createCheckRun(token, owner, repo, {
      name: 'bot-review',
      headSha,
      conclusion: 'success',
      title: 'Copilot review passed',
      summary: 'Copilot removed without posting a review — clean pass',
    });
    await addLabel(token, owner, repo, prNumber, 'merge-when-ready');
    return `Set bot-review=success for PR #${prNumber}: Copilot removed without review`;
  }

  // ── PR lifecycle events ───────────────────────────────────────────────────

  // Auto-pass bot-authored PRs — Copilot will not review them.
  if (BOT_AUTHOR_LOGINS.has(authorLogin)) {
    await createCheckRun(token, owner, repo, {
      name: 'bot-review',
      headSha,
      conclusion: 'success',
      title: 'Copilot review skipped',
      summary: `Copilot review skipped for ${authorLogin}`,
    });
    await addLabel(token, owner, repo, prNumber, 'merge-when-ready');
    return `Auto-passed bot-review for ${authorLogin} PR #${prNumber}`;
  }

  await requestCopilotReview(token, owner, repo, prNumber);

  return `Requested Copilot review for PR #${prNumber}`;
}
