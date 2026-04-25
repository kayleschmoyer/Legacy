import { LOGGER } from '@legacy-sports/logging';
import {
  createCheckRun,
  getCheckRunNamesForRef,
  getPrMeta,
  getPrReviews,
  getRepoInstallationToken,
  requestCopilotReview,
} from './github-app';
import {
  enqueueRaceCheck,
  MAX_RACE_CHECK_ATTEMPTS,
  RACE_CHECK_DELAY_SECONDS,
  type RaceCheckMessage,
} from './sqs-client';

const REVIEW_BOT_APP_ID = 3142924;

// All known logins Copilot uses. Must stay in sync with the equivalent sets
// in handle-pull-request.ts, handle-pull-request-review.ts, handle-review-thread.ts,
// handle-workflow-run.ts, and copilot-review-handler.yml.
const COPILOT_LOGINS = new Set([
  'copilot-pull-request-reviewer',
  'copilot-pull-request-reviewer[bot]',
  'Copilot',
]);

/**
 * Handle a delayed race-check self-invocation (see `RaceCheckMessage`).
 *
 * Runs ~90s after `pull_request.synchronize`. Inspects current state and
 * self-heals Copilot re-review race condition #2 (documented in
 * `.agents/skills/pr-lifecycle/references/copilot-auto-approve-flow.md`):
 *
 *   1. PR closed/merged → drop (no action needed)
 *   2. `headSha` has moved on → drop (newer synchronize will enqueue its own check)
 *   3. PR is draft → drop (no bot-review required)
 *   4. `bot-review` check already exists for headSha → done
 *   5. Copilot review already exists for headSha → normal flow will finish
 *   6. Copilot in `requested_reviewers` → still processing, done
 *   7. Otherwise → Race 2 detected:
 *      • `attempt < MAX` → re-request Copilot + enqueue next attempt
 *      • `attempt >= MAX` → write bot-review=failure with visible explainer
 */
export async function handleRaceCheckMessage(
  message: RaceCheckMessage,
  botAppPrivateKey: string,
): Promise<string> {
  if (message.type !== 'race-check') {
    return `Ignored unknown SQS message type="${message.type as string}"`;
  }

  const { owner, repo, prNumber, headSha, attempt } = message;

  LOGGER.info('Handling race-check message', {
    owner,
    repo,
    prNumber,
    headSha,
    attempt,
  });

  const token = await getRepoInstallationToken(
    REVIEW_BOT_APP_ID,
    botAppPrivateKey,
    owner,
    repo,
  );

  // 1–3. PR-level fast exits.
  const prMeta = await getPrMeta(token, owner, repo, prNumber);

  if (prMeta.state !== 'open') {
    return `Race-check PR #${prNumber}: PR is ${prMeta.state} — dropping`;
  }
  if (prMeta.headSha !== headSha) {
    return `Race-check PR #${prNumber}: headSha moved from ${headSha.slice(0, 7)} to ${prMeta.headSha.slice(0, 7)} — dropping`;
  }
  if (prMeta.draft) {
    return `Race-check PR #${prNumber}: PR is draft — dropping`;
  }

  // 4. bot-review already written? Done.
  const checkNames = await getCheckRunNamesForRef(
    token,
    owner,
    repo,
    headSha,
    'bot-review',
  );
  if (checkNames.length > 0) {
    return `Race-check PR #${prNumber}: bot-review already set for ${headSha.slice(0, 7)} — done`;
  }

  // 5. Copilot review already exists for this SHA? Done — normal flow finishes.
  const reviews = await getPrReviews(token, owner, repo, prNumber);
  const copilotReviewedThisSha = reviews.some(
    (r) => COPILOT_LOGINS.has(r.userLogin) && r.commitId === headSha,
  );
  if (copilotReviewedThisSha) {
    return `Race-check PR #${prNumber}: Copilot reviewed ${headSha.slice(0, 7)} — normal flow will finish`;
  }

  // 6. Copilot still queued as reviewer? Still processing.
  const copilotStillRequested = prMeta.requestedReviewerLogins.some((login) =>
    COPILOT_LOGINS.has(login),
  );
  if (copilotStillRequested) {
    return `Race-check PR #${prNumber}: Copilot still in requested_reviewers — still processing`;
  }

  // 7. Race detected — Copilot was requested but has disappeared without reviewing.
  LOGGER.warn('Copilot re-review race detected — attempting recovery', {
    prNumber,
    headSha,
    attempt,
  });

  if (attempt >= MAX_RACE_CHECK_ATTEMPTS) {
    // Out of retries — surface a failure so the user gets a clear signal
    // rather than indefinite silence.
    await createCheckRun(token, owner, repo, {
      name: 'bot-review',
      headSha,
      conclusion: 'failure',
      title: 'Copilot review could not be triggered',
      summary:
        `After ${MAX_RACE_CHECK_ATTEMPTS} attempts (~${MAX_RACE_CHECK_ATTEMPTS * RACE_CHECK_DELAY_SECONDS}s), Copilot did not pick up ` +
        'the re-review request for this commit. This is a known GitHub ' +
        'platform issue (Copilot re-review race). Push an empty commit ' +
        '(`git commit --allow-empty -m "chore: re-trigger Copilot review" && git push`) ' +
        'to re-trigger, or request the review manually from the UI.',
    });
    return `Race-check PR #${prNumber}: exhausted ${MAX_RACE_CHECK_ATTEMPTS} attempts — wrote bot-review=failure`;
  }

  // Retry: re-request Copilot and enqueue the next check.
  await requestCopilotReview(token, owner, repo, prNumber);
  await enqueueRaceCheck(
    {
      type: 'race-check',
      owner,
      repo,
      prNumber,
      headSha,
      attempt: attempt + 1,
    },
    RACE_CHECK_DELAY_SECONDS,
  );

  return `Race-check PR #${prNumber}: re-requested Copilot (attempt ${attempt}/${MAX_RACE_CHECK_ATTEMPTS}) — next check in ${RACE_CHECK_DELAY_SECONDS}s`;
}
