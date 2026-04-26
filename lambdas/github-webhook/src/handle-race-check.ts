import { LOGGER } from '@legacy-sports/logging';
import {
  createCheckRun,
  getCheckRunNamesForRef,
  getCommitTreeSha,
  getPrMeta,
  getPrReviews,
  getPrReviewThreads,
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

interface CopilotReviewSummary {
  state: string;
  body: string | null;
  userLogin: string;
  submittedAt: string;
  commitId: string;
}

interface CarryForwardResult {
  conclusion: 'success' | 'failure';
  title: string;
  summary: string;
  priorSha: string;
}

/**
 * Attempt to carry forward a prior Copilot review's verdict when the current
 * commit has the same git tree SHA — i.e. byte-identical file contents — as
 * a commit Copilot has already reviewed. Common shapes this catches:
 *   - Empty re-trigger commits (`git commit --allow-empty`)
 *   - Rebases that preserve content (no functional changes)
 *
 * For both, there is nothing for Copilot to re-review, but the platform
 * frequently fails to deliver a re-review event. Carrying the prior verdict
 * forward to the new SHA unblocks these PRs without involving Copilot at all.
 *
 * Returns null when no prior Copilot review on this PR has the same tree SHA
 * as `headSha`. The prior review is selected newest-first so any updates
 * Copilot made between reviews use the latest determination.
 */
async function tryCarryForward(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  reviews: CopilotReviewSummary[],
): Promise<CarryForwardResult | null> {
  const copilotReviews = reviews
    .filter((r) => COPILOT_LOGINS.has(r.userLogin) && r.commitId)
    .sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );
  if (copilotReviews.length === 0) return null;

  // Fan out: fetch the head tree SHA in parallel with all unique prior-review
  // commit tree SHAs. Each commit is fetched exactly once even if multiple
  // reviews share a SHA, and the head tree request runs concurrently. This
  // bounds total latency to ~one round-trip and avoids amplifying API load
  // on busy repos with long review histories.
  const uniquePriorShas = [...new Set(copilotReviews.map((r) => r.commitId))];
  const [headTreeSha, ...priorTreeShas] = await Promise.all([
    getCommitTreeSha(token, owner, repo, headSha),
    ...uniquePriorShas.map((sha) => getCommitTreeSha(token, owner, repo, sha)),
  ]);
  if (!headTreeSha) return null;

  const priorTreeBySha = new Map(
    uniquePriorShas.map((sha, i) => [sha, priorTreeShas[i]]),
  );

  for (const review of copilotReviews) {
    const priorTreeSha = priorTreeBySha.get(review.commitId) ?? null;
    if (!priorTreeSha || priorTreeSha !== headTreeSha) continue;

    // Found a prior Copilot review of an identical tree. Apply the same thread
    // evaluation logic as copilot-review-handler.yml so the carry-forward
    // verdict matches what Copilot would have produced on a true re-review.
    const copilotCleared =
      review.state === 'APPROVED' ||
      (review.body ?? '').includes("wasn't able to review any files") ||
      (review.body ?? '').includes('generated no new comments');

    const threads = await getPrReviewThreads(token, owner, repo, prNumber);
    const unresolved = threads.filter((t) => {
      if (t.isResolved || t.isOutdated) return false;
      // When Copilot's prior review cleared, its own threads are superseded.
      if (
        copilotCleared &&
        t.authorLogin !== null &&
        COPILOT_LOGINS.has(t.authorLogin)
      ) {
        return false;
      }
      return true;
    });

    const priorShort = review.commitId.slice(0, 7);
    if (unresolved.length === 0) {
      return {
        conclusion: 'success',
        title: 'Copilot review carried forward',
        summary: `Identical tree SHA to prior reviewed commit ${priorShort} — all review threads resolved`,
        priorSha: review.commitId,
      };
    }
    return {
      conclusion: 'failure',
      title: 'Review blocked',
      summary: `Identical tree SHA to prior reviewed commit ${priorShort} — ${unresolved.length} unresolved review thread(s)`,
      priorSha: review.commitId,
    };
  }
  return null;
}

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
 *   7. Diff-aware carry-forward: a prior Copilot review's commit has the
 *      same tree SHA as headSha → write bot-review directly, skip Copilot
 *   8. Otherwise → Race 2 detected:
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

  // 7. Diff-aware carry-forward — bypass Copilot entirely when an earlier
  // commit on this PR with the same tree SHA already has a Copilot review.
  // Catches empty re-trigger commits and content-preserving rebases, which
  // GitHub's Copilot service routinely refuses to re-review even when asked.
  const carryForward = await tryCarryForward(
    token,
    owner,
    repo,
    prNumber,
    headSha,
    reviews,
  );
  if (carryForward) {
    await createCheckRun(token, owner, repo, {
      name: 'bot-review',
      headSha,
      conclusion: carryForward.conclusion,
      title: carryForward.title,
      summary: carryForward.summary,
    });
    return `Race-check PR #${prNumber}: carried forward bot-review=${carryForward.conclusion} from ${carryForward.priorSha.slice(0, 7)}`;
  }

  // 8. Race detected — Copilot was requested but has disappeared without reviewing.
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

  // Retry: re-request Copilot and enqueue the next check. The request itself
  // may silently no-op when called with an installation token (see
  // requestCopilotReview); the carry-forward step above is the primary
  // recovery path for that failure mode.
  const requestResult = await requestCopilotReview(
    token,
    owner,
    repo,
    prNumber,
  );
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

  let requestNote = '';
  if (!requestResult.added) {
    switch (requestResult.kind) {
      case 'silent-drop':
        requestNote =
          ' (Copilot was silently dropped from requested_reviewers — see logs)';
        break;
      case 'http-422':
        requestNote =
          ' (Copilot reviewer request returned HTTP 422 — see logs)';
        break;
      case 'unparseable-response':
        requestNote = ' (Copilot reviewer response was unparseable — see logs)';
        break;
    }
  }
  return `Race-check PR #${prNumber}: re-requested Copilot (attempt ${attempt}/${MAX_RACE_CHECK_ATTEMPTS}) — next check in ${RACE_CHECK_DELAY_SECONDS}s${requestNote}`;
}
