import { LOGGER } from '@legacy-sports/logging';
import {
  addLabel,
  createCheckRun,
  getInstallationToken,
  getPrReviews,
  getPrReviewThreads,
} from './github-app';

const REVIEW_BOT_APP_ID = 3142924;

const COPILOT_LOGINS = new Set([
  'copilot-pull-request-reviewer',
  'copilot-pull-request-reviewer[bot]',
  'Copilot',
]);

interface PullRequestReviewPayload {
  action: string;
  review: {
    state: string;
    body: string | null;
    user: { login: string };
  };
  pull_request: {
    number: number;
    draft: boolean;
    head: { sha: string; repo: { full_name: string } };
    base: { repo: { full_name: string } };
  };
  repository: { name: string; owner: { login: string } };
  installation?: { id: number };
}

/**
 * Evaluate all review threads and set bot-review accordingly.
 * Returns the conclusion that was set.
 */
async function evaluateAndSetBotReview(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  copilotCleared: boolean,
): Promise<'success' | 'failure' | 'no-copilot-review'> {
  const [threads, reviews] = await Promise.all([
    getPrReviewThreads(token, owner, repo, prNumber),
    getPrReviews(token, owner, repo, prNumber),
  ]);

  const hasCopilotReviewForHeadSha = reviews.some(
    (r) => COPILOT_LOGINS.has(r.userLogin) && r.commitId === headSha,
  );
  if (!hasCopilotReviewForHeadSha) {
    // No Copilot review for the current head SHA yet — leave bot-review in_progress
    // set by the pull_request handler so we don't act on a stale review.
    LOGGER.info(
      'No Copilot review for current head SHA yet — leaving bot-review in_progress',
      { prNumber, headSha },
    );
    return 'no-copilot-review';
  }

  const unresolvedThreads = threads.filter((t) => {
    if (t.isResolved || t.isOutdated) return false;
    if (
      copilotCleared &&
      t.authorLogin !== null &&
      COPILOT_LOGINS.has(t.authorLogin)
    )
      return false;
    return true;
  });

  if (unresolvedThreads.length > 0) {
    LOGGER.info('Unresolved threads remain — setting bot-review=failure', {
      prNumber,
      unresolved: unresolvedThreads.length,
      copilotCleared,
    });
    await createCheckRun(token, owner, repo, {
      name: 'bot-review',
      headSha,
      conclusion: 'failure',
      title: 'Review blocked',
      summary: `PR has ${unresolvedThreads.length} unresolved comment(s)`,
    });
    return 'failure';
  }

  await createCheckRun(token, owner, repo, {
    name: 'bot-review',
    headSha,
    conclusion: 'success',
    title: 'Copilot review passed',
    summary: 'All review threads resolved',
  });
  await addLabel(token, owner, repo, prNumber, 'merge-when-ready');
  return 'success';
}

/**
 * Handle a `pull_request_review` webhook event.
 *
 * Copilot APPROVED / "wasn't able to review any files":
 *   Copilot cleared its own threads. Check remaining non-Copilot threads and
 *   set bot-review=success/failure accordingly.
 *
 * Copilot COMMENTED / CHANGES_REQUESTED:
 *   Copilot left inline comments. Set bot-review=failure immediately.
 *   pull_request_review_thread resolved events will re-evaluate once the
 *   developer addresses the comments.
 *
 * Non-Copilot review submitted:
 *   A human may have added new threads. Re-evaluate all threads (with a brief
 *   delay to allow any newly-created threads to propagate) and set bot-review.
 */
export async function handlePullRequestReviewEvent(
  payload: PullRequestReviewPayload,
  botAppPrivateKey: string,
): Promise<string> {
  const { action, review, pull_request: pr, repository } = payload;

  if (action !== 'submitted') {
    return `Ignored pull_request_review action="${action}"`;
  }

  if (pr.draft) {
    return `Ignored pull_request_review for draft PR #${pr.number}`;
  }

  // Fork PRs don't have access to secrets.
  if (pr.head.repo.full_name !== pr.base.repo.full_name) {
    return `Ignored pull_request_review for fork PR #${pr.number}`;
  }

  const prNumber = pr.number;
  const headSha = pr.head.sha;
  const owner = repository.owner.login;
  const repo = repository.name;
  const reviewerLogin = review.user.login;
  const isCopilot = COPILOT_LOGINS.has(reviewerLogin);

  LOGGER.info('Handling pull_request_review event', {
    prNumber,
    owner,
    repo,
    headSha,
    reviewerLogin,
    reviewState: review.state,
    isCopilot,
  });

  const installationId = payload.installation?.id;
  if (!installationId) {
    LOGGER.warn('Ignoring pull_request_review without installation.id', {
      prNumber,
    });
    return `Ignored pull_request_review for PR #${prNumber}: missing installation.id`;
  }

  const token = await getInstallationToken(
    REVIEW_BOT_APP_ID,
    botAppPrivateKey,
    installationId,
  );

  if (isCopilot) {
    const copilotCleared =
      review.state === 'APPROVED' ||
      (review.body?.includes("wasn't able to review any files") ?? false);

    if (!copilotCleared) {
      // Copilot left review comments. Set failure immediately — the developer
      // will resolve threads, and pull_request_review_thread.resolved events
      // will re-evaluate and flip to success when all are addressed.
      LOGGER.info(
        'Copilot submitted COMMENTED/CHANGES_REQUESTED review — setting failure',
        { prNumber, reviewState: review.state },
      );
      await createCheckRun(token, owner, repo, {
        name: 'bot-review',
        headSha,
        conclusion: 'failure',
        title: 'Review blocked',
        summary:
          'Copilot left review comments — resolve all threads to proceed',
      });
      return `Set bot-review=failure for PR #${prNumber}: Copilot left comments (state=${review.state})`;
    }

    // Copilot approved or couldn't review files. Check any non-Copilot threads.
    const conclusion = await evaluateAndSetBotReview(
      token,
      owner,
      repo,
      prNumber,
      headSha,
      true,
    );
    return `Set bot-review=${conclusion} for PR #${prNumber}: Copilot cleared (state=${review.state})`;
  }

  // Non-Copilot review: re-evaluate all threads. A brief delay allows any
  // newly-added threads from the submitted review to propagate in GitHub's API.
  await new Promise<void>((r) => setTimeout(r, 3_000));

  const copilotReviews = await getPrReviews(token, owner, repo, prNumber).then(
    (reviews) =>
      reviews
        .filter(
          (r) => COPILOT_LOGINS.has(r.userLogin) && r.commitId === headSha,
        )
        .sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() -
            new Date(a.submittedAt).getTime(),
        ),
  );
  const latestCopilot = copilotReviews[0];
  const copilotCleared =
    latestCopilot != null &&
    (latestCopilot.state === 'APPROVED' ||
      (latestCopilot.body?.includes("wasn't able to review any files") ??
        false));

  const conclusion = await evaluateAndSetBotReview(
    token,
    owner,
    repo,
    prNumber,
    headSha,
    copilotCleared,
  );
  return `Set bot-review=${conclusion} for PR #${prNumber}: non-Copilot review by @${reviewerLogin}`;
}
