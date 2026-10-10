import {
  postShadowComment,
  addLabel,
  removeLabel,
  setCommitStatus,
  isRepoAdmin,
  listPrReviewsFresh,
  findHumanMaintainerApproval,
  findLatestLabelActor,
  resolveOverrideApplier,
  dismissReview,
} from './lib/github.mjs';
import { cleanupOperationalLabels } from './lib/labels.mjs';
import {
  parseFindingsFromText,
  tryReformatFindings,
  gateFindingsBySeverity,
  hasCriticalBlockingFinding,
  formatShadowBody,
} from './lib/findings.mjs';
import { buildSystemPrompt, buildUserPrompt } from './lib/prompts/system.mjs';
import {
  isTrivialPR,
  runMultiPass,
  createResumeState,
} from './lib/multi-pass.mjs';
import { consolidate } from './lib/consolidator.mjs';
import {
  postRealReview,
  postInfraErrorReview,
  postKnownLlmFailureReview,
  addLabelAsApp,
  postOverrideApproveReview,
} from './lib/post-review.mjs';
import { buildRecord, emitTelemetry } from './lib/telemetry.mjs';
import { withRetry } from './lib/retry.mjs';
import { CostCap } from './lib/cost-cap.mjs';
import {
  postEscalationComment,
  postReviewThreadReply,
} from './lib/review-thread-api.mjs';
import { fetchPrData } from './lib/graphql-fetch.mjs';
import {
  computeCycle,
  isEscalationRequired,
  isInfraErrorReview,
  isThreadReplyArtifactReview,
  shouldAutoResetArbitrationCycle,
  REVIEWER_BOT_LOGINS,
} from './lib/cycle-counter.mjs';
import {
  buildCycleRoleSection,
  parseTitlesFromReviewBody,
  filterFindingsCycle2,
  filterFindingsCycle3,
  buildAuthorResponsesSection,
  buildAuthorResolvedTitles,
  collectCannotComplyResponses,
  withCannotComplyTitles,
  unresolvedCannotComplyEntries,
  getMalformedInlineReplies,
} from './lib/cycle-protocol.mjs';
import { FORMAT_ERROR_MESSAGE } from './lib/parse-author-response.mjs';
import {
  resolveCitedEvidence,
  formatEvidenceResolutionSection,
} from './lib/evidence-resolver.mjs';
import { createFallbackProvider } from './lib/fallback.mjs';
import { verifyReferencedPaths } from './lib/ref-verifier.mjs';
import {
  extractIntegrationResults,
  formatIntegrationResultsSection,
} from './lib/integration-results.mjs';
import {
  fetchContext,
  formatContextForPrompt,
  parseChangedFilePaths,
} from './lib/context.mjs';
import {
  fetchBaseBranchFailingChecks,
  formatBaseBranchCiSection,
} from './lib/base-branch-ci.mjs';
import { filterStaleMissingArtifactFindings } from './lib/head-artifacts.mjs';
import { filterFabricatedFindings } from './lib/finding-verifier.mjs';
import { reclassifyAffirmationFindings } from './lib/affirmation-guard.mjs';
import {
  checkDiffUnchangedSinceApproval,
  buildReaffirmNotice,
} from './lib/unchanged-diff.mjs';

// Cap on the current-HEAD file context injected into the review prompt (LS-7768).
// Keeps a large PR from blowing the prompt size; the diff is always included in
// full regardless of this budget.
const FULL_FILE_CONTEXT_MAX_BYTES = 48_000;

const STRIP_LOG_MAX_FINDINGS = 3;
const STRIP_LOG_MAX_TITLE_LEN = 60;

/**
 * Escape a string for safe embedding inside a GitHub Actions workflow command.
 * The runner parses `::cmd key=value::message` from stdout; unescaped %, CR, and LF
 * in the message field can corrupt the command or inject additional annotations.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeWorkflowCommandValue(str) {
  return str.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/**
 * Format a truncated summary of stripped findings for annotation log output.
 * Caps titles at STRIP_LOG_MAX_TITLE_LEN chars and lists at most STRIP_LOG_MAX_FINDINGS
 * entries to avoid unbounded log growth from model-generated content.
 * Titles are sanitized for safe embedding in GitHub Actions workflow commands.
 *
 * @param {import('./lib/cycle-protocol.mjs').StrippedFinding[]} stripped
 * @returns {string}
 */
function formatStrippedLog(stripped) {
  const preview = stripped.slice(0, STRIP_LOG_MAX_FINDINGS).map((f) => {
    const truncated =
      f.title.length > STRIP_LOG_MAX_TITLE_LEN
        ? `${f.title.slice(0, STRIP_LOG_MAX_TITLE_LEN)}…`
        : f.title;
    return `"${escapeWorkflowCommandValue(truncated)}" (${f.strip_reason})`;
  });
  const overflow = stripped.length - STRIP_LOG_MAX_FINDINGS;
  return overflow > 0
    ? `${preview.join(', ')} +${overflow} more`
    : preview.join(', ');
}

/**
 * Format a truncated summary of reclassified (affirmation-polarity) findings
 * for annotation log output, mirroring formatStrippedLog's truncation rules.
 *
 * @param {import('./lib/affirmation-guard.mjs').ReclassifiedFinding[]} reclassified
 * @returns {string}
 */
function formatReclassifiedLog(reclassified) {
  const preview = reclassified.slice(0, STRIP_LOG_MAX_FINDINGS).map((f) => {
    const truncated =
      f.title.length > STRIP_LOG_MAX_TITLE_LEN
        ? `${f.title.slice(0, STRIP_LOG_MAX_TITLE_LEN)}…`
        : f.title;
    return `"${escapeWorkflowCommandValue(truncated)}" (${f.from_severity} → observation)`;
  });
  const overflow = reclassified.length - STRIP_LOG_MAX_FINDINGS;
  return overflow > 0
    ? `${preview.join(', ')} +${overflow} more`
    : preview.join(', ');
}

const NEEDS_HUMAN_ARBITRATION_LABEL = 'needs-human-arbitration';
const NEEDS_HUMAN_SECURITY_REVIEW_LABEL = 'needs-human-security-review';
const NEEDS_HUMAN_REVIEW_LABEL = 'needs-human-review';
const CYCLE_RESET_LABEL = 'bot:reset-cycle-counter';
// Terminal marker for "the reviewer is out of API credits" (LS-9812). Kept
// distinct from `review-bot-degraded` so /unblock-prs, the watch scripts, and
// agents can tell "retry me" apart from "escalate to a human" without reading
// the run log. Deliberately NOT a trigger label in review.yml — re-applying it
// must not re-fire a run that cannot succeed.
const REVIEW_BOT_BILLING_LABEL = 'review-bot-billing';

/**
 * Wall-clock budget the run may spend *waiting out* provider retries, measured
 * from process start (LS-9983).
 *
 * The reviewer job's `timeout-minutes` is the hard ceiling: a run killed by it
 * writes no terminal `bot-review` status and leaves the PR stranded on a
 * stale-pending footprint for the merge-queue processor to heal (LS-8299 /
 * LS-9209). So the retry ladder is bounded by this budget rather than by the
 * ladder's own length, and `review.yml` sets `timeout-minutes` comfortably
 * above it so posting the review, labels and terminal status always fits in
 * the remainder. Keep the two in sync when changing either.
 */
const DEFAULT_RETRY_BUDGET_MS = 20 * 60 * 1000;

function resolveRetryBudgetMs() {
  const raw = Number(process.env.REVIEWER_RETRY_BUDGET_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RETRY_BUDGET_MS;
}

const RETRY_DEADLINE_MS = Date.now() + resolveRetryBudgetMs();

/**
 * Render a wait as a short human duration for the commit-status description
 * (GitHub caps descriptions at 140 characters).
 *
 * @param {number} ms
 * @returns {string}
 */
function formatWait(ms) {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.round(seconds / 60)}m` : `${seconds}s`;
}

/**
 * Build the `withRetry` options for this run: the shared retry deadline plus a
 * progress publisher that keeps `bot-review` on **pending** while the reviewer
 * is waiting out a per-minute throttle.
 *
 * This is the AC2 distinction (LS-9983). A throttled cycle used to jump
 * straight to a `failure` status telling the author to re-apply
 * `bot:ready-for-review` — which, under repo-wide saturation, sent every
 * Author Agent to spend quota the rest of the queue was already waiting on.
 * "Queued behind quota, no action needed" is a pending state; only an
 * exhausted budget is a failure.
 *
 * @param {string} sha
 * @returns {{ deadlineMs: number, onWait: (info: object) => void }}
 */
function buildRetryOpts(sha) {
  return {
    deadlineMs: RETRY_DEADLINE_MS,
    onWait({ attempt, maxAttempts, waitMs, kind }) {
      if (kind !== 'rate-limit' || !sha) return;
      setCommitStatus(
        sha,
        'pending',
        `Queued behind reviewer rate limit — auto-retry in ~${formatWait(waitMs)} (attempt ${attempt}/${maxAttempts}); no action needed`,
      );
    },
  };
}

/**
 * Write a failure bot-review status UNLESS a human maintainer APPROVE now
 * exists on the PR (re-checked fresh at write time). Closes the race where a
 * human approves — and W5 sets bot-review=success — while this run is in
 * flight: the run's terminal failure write must not clobber the human
 * override. On the override path the status is written as success instead so
 * the required check reflects the human approval even if W5's write lost the
 * race entirely.
 *
 * @param {number} prNumber
 * @param {string} sha
 * @param {string} description  failure description
 * @returns {boolean}  true if the human override suppressed the failure write
 */
function setFailureStatusUnlessHumanApproved(prNumber, sha, description) {
  let approver = null;
  try {
    approver = findHumanMaintainerApproval(listPrReviewsFresh(prNumber));
  } catch (err) {
    process.stderr.write(
      `[reviewer] Fresh review re-check failed (writing failure as planned): ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  if (approver) {
    process.stdout.write(
      `[reviewer] Human maintainer @${approver} approved mid-run — suppressing bot-review failure ("${description}")\n`,
    );
    try {
      setCommitStatus(
        sha,
        'success',
        `Human review by @${approver} supersedes bot review`,
      );
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to set bot-review success: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    return true;
  }
  setCommitStatus(sha, 'failure', description);
  return false;
}

function maybeThrowForceFailError() {
  if (process.env.REVIEWER_FORCE_FAIL !== 'true') return;
  const err = new Error(
    '[REVIEWER_FORCE_FAIL] Simulated transient LLM failure for testing',
  );
  err.retryable = true;
  err.kind = 'transient';
  throw err;
}

async function main() {
  const prNumber = Number(process.env.PR_NUMBER);
  if (!prNumber) {
    process.stderr.write('[reviewer] PR_NUMBER env var is required\n');
    process.exit(1);
  }

  const providerName = process.env.LLM_PROVIDER ?? 'github-models';
  const sha = process.env.PR_HEAD_SHA ?? '';

  // Batch-fetch all PR data in a single GraphQL request (+ one REST call for
  // the diff). Replaces 5–6 individual REST reads to reduce rate-limit usage.
  let ctx;
  let allReviews;
  let prAllCommits;
  let prReviewComments;
  let prIssueComments;
  try {
    ({
      prContext: ctx,
      reviews: allReviews,
      commits: prAllCommits,
      reviewComments: prReviewComments,
      issueComments: prIssueComments,
    } = fetchPrData(prNumber));
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to fetch PR data: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    try {
      setCommitStatus(sha, 'failure', 'Review failed: could not fetch PR data');
    } catch (statusErr) {
      process.stderr.write(
        `[reviewer] Failed to set commit status: ${statusErr instanceof Error ? statusErr.message : String(statusErr)}\n`,
      );
    }
    process.exit(1);
  }

  // Skip conditions: draft PRs and fork PRs. Author identity is NOT a skip condition.
  if (ctx.isDraft) {
    process.stdout.write('[reviewer] Skipping: draft PR\n');
    return;
  }
  if (ctx.isCrossRepository) {
    process.stdout.write('[reviewer] Skipping: fork PR\n');
    return;
  }

  // Author identity: informational only — used for telemetry, not behavior.
  const authorLogin = ctx.author?.login ?? '';
  const isBotAuthor = ctx.author?.is_bot ?? authorLogin.endsWith('[bot]');
  const authorType = isBotAuthor ? 'bot' : 'human';
  process.stdout.write(`[reviewer] Author: ${authorLogin} (${authorType})\n`);

  // --- Human-review override: a human maintainer APPROVE supersedes the bot
  // review entirely (fully-automated pipeline policy). Checked BEFORE the
  // pending write so a run triggered after a human approval never clobbers
  // the bot-review=success that W5 (review-bot-override.yml) set. The label
  // and status handling mirror the auto-approve path; no LLM review runs.
  const humanApprover = findHumanMaintainerApproval(allReviews);
  if (humanApprover) {
    process.stdout.write(
      `[reviewer] Standing down: human maintainer @${humanApprover} has approved — human review supersedes bot review\n`,
    );
    try {
      setCommitStatus(
        sha,
        'success',
        `Human review by @${humanApprover} supersedes bot review`,
      );
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to set bot-review success: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    try {
      cleanupOperationalLabels(prNumber, { preserveReadyLabel: true });
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to clean up operational labels: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    return;
  }

  // Set bot-review to pending — reviewer is starting
  try {
    setCommitStatus(sha, 'pending', 'Review in progress');
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to set bot-review pending: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  // --- Auto-approve path: review-bot-override label ---
  // Skip LLM review entirely and post APPROVE directly. The commit status,
  // merge-when-ready label, and operational label cleanup all run on this path
  // as on the normal APPROVED path.
  //
  // LS-10965: the label's presence is NOT sufficient — verify that whoever
  // applied it is a maintainer (same bar as W5). Otherwise fall through to a
  // normal LLM review: the run has already set bot-review to pending, and a
  // real verdict is the only safe terminal status. W5 concurrently removes
  // the unauthorized label and posts the rejection comment.
  let autoApprove = process.env.REVIEWER_AUTO_APPROVE === 'true';
  if (autoApprove) {
    const { applier, authorized } = resolveOverrideApplier(prNumber, {
      eventSender: process.env.OVERRIDE_LABEL_SENDER ?? '',
    });
    if (!authorized) {
      autoApprove = false;
      process.stdout.write(
        `[reviewer] Ignoring review-bot-override — applier '${applier || '<unknown>'}' is not a maintainer; running a normal review (LS-10965)\n`,
      );
    }
  }
  if (autoApprove) {
    process.stdout.write(
      '[reviewer] Auto-approve: review-bot-override label detected — skipping LLM review\n',
    );
    try {
      setCommitStatus(sha, 'success', 'Review passed (override)');
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to set bot-review success: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    try {
      await postOverrideApproveReview(prNumber);
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to post override-approve review: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    try {
      addLabel(prNumber, 'merge-when-ready');
      process.stdout.write(
        `[reviewer] Added 'merge-when-ready' label to PR #${prNumber}\n`,
      );
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to add label 'merge-when-ready': ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    try {
      cleanupOperationalLabels(prNumber, { preserveReadyLabel: true });
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to clean up operational labels: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    return;
  }

  // --- Cycle counter (T22) ---
  // Derive cycle from immutable PR review history for all PRs (not just bot-authored).
  let cycle = 1;
  let priorTitles = [];
  let postReviewCommitShas = [];
  let lastBotReview = null;

  cycle = computeCycle(allReviews);
  process.stdout.write(`[reviewer] Computed review cycle: ${cycle}\n`);

  // Per-reason exclusion counts for telemetry (computed once, reused below).
  const botReviewsAll = allReviews.filter((r) =>
    REVIEWER_BOT_LOGINS.has(r.userLogin),
  );
  const cycleExcludedDismissed = botReviewsAll.filter(
    (r) => r.state === 'DISMISSED',
  ).length;
  const cycleExcludedInfra = botReviewsAll.filter(
    (r) => r.state !== 'DISMISSED' && isInfraErrorReview(r),
  ).length;
  const cycleExcludedThreadReplyArtifact = botReviewsAll.filter(
    (r) =>
      r.state !== 'DISMISSED' &&
      !isInfraErrorReview(r) &&
      isThreadReplyArtifactReview(r),
  ).length;
  if (cycleExcludedThreadReplyArtifact > 0) {
    process.stdout.write(
      `[reviewer] Excluded ${cycleExcludedThreadReplyArtifact} thread-reply artifact review(s) from cycle counter (LS-4474)\n`,
    );
  }

  // --- Admin cycle reset (bot:reset-cycle-counter label) ---
  // CYCLE_RESET_SENDER is set by the workflow when triggered by this label.
  // If a non-admin applies the label the bot posts a rejection notice and removes it.
  //
  // Fallback (LS-4178): if the label is currently present on the PR but the env
  // var is empty, the original reset-trigger run was likely cancelled by a sibling
  // labeled event (cancel-in-progress concurrency). Recover the labeler from the
  // timeline so the reset still applies on whichever surviving run picks it up.
  let cycleResetByAdmin = false;
  let cycleResetSender = process.env.CYCLE_RESET_SENDER ?? '';
  const prLabels = ctx.labels ?? [];
  if (!cycleResetSender && prLabels.includes(CYCLE_RESET_LABEL)) {
    cycleResetSender = findLatestLabelActor(prNumber, CYCLE_RESET_LABEL);
    if (cycleResetSender) {
      process.stdout.write(
        `[reviewer] Recovered cycle-reset labeler '${cycleResetSender}' from timeline (env var was empty)\n`,
      );
    }
  }
  if (cycleResetSender) {
    try {
      if (isRepoAdmin(cycleResetSender)) {
        const priorBotReviews = allReviews.filter((r) =>
          REVIEWER_BOT_LOGINS.has(r.userLogin),
        );
        // Dismiss prior dismissable bot reviews FIRST so the reset persists
        // even if this run is cancelled by a sibling `bot:ready-for-review`
        // event before it can remove the label or post a fresh review
        // (LS-4474). Dismissal state is server-side and survives cancellation,
        // and the cycle counter already excludes DISMISSED reviews — so the
        // next run will compute cycle=1 from review history alone.
        const dismissibleStates = new Set(['CHANGES_REQUESTED', 'APPROVED']);
        const reviewsToDismiss = priorBotReviews.filter(
          (r) =>
            r.state !== 'DISMISSED' &&
            dismissibleStates.has(r.state) &&
            !isInfraErrorReview(r),
        );
        for (const r of reviewsToDismiss) {
          dismissReview(
            prNumber,
            r.id,
            `Superseded by cycle-counter reset by ${cycleResetSender}`,
          );
          // Mark in-memory state so subsequent logic in this run also treats
          // these as dismissed (in case the GH API hasn't propagated yet).
          r.state = 'DISMISSED';
        }
        const now = new Date().toISOString();
        postEscalationComment(
          prNumber,
          `> [!NOTE]\n> Cycle counter reset by \`${cycleResetSender}\` at ${now}. ` +
            `Prior ${priorBotReviews.length} bot review(s) excluded from counter ` +
            `(${reviewsToDismiss.length} dismissed). ` +
            `Bot will treat next review as Cycle 1.`,
        );
        removeLabel(prNumber, CYCLE_RESET_LABEL);
        cycleResetByAdmin = true;
        cycle = 1;
        process.stdout.write(
          `[reviewer] Cycle counter reset by admin '${cycleResetSender}'; prior ${priorBotReviews.length} review(s) excluded (${reviewsToDismiss.length} dismissed)\n`,
        );
      } else {
        postEscalationComment(
          prNumber,
          `> [!WARNING]\n> The \`${CYCLE_RESET_LABEL}\` label was applied by \`${cycleResetSender}\`, ` +
            `who does not have admin permission. Label ignored — cycle counter not reset.`,
        );
        removeLabel(prNumber, CYCLE_RESET_LABEL);
        process.stdout.write(
          `[reviewer] Ignoring ${CYCLE_RESET_LABEL} — sender '${cycleResetSender}' lacks admin permission\n`,
        );
      }
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to process ${CYCLE_RESET_LABEL}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  // The last review that actually counted toward the cycle total (mirrors
  // computeCycle's inclusion set) — used both to decide whether a labeled
  // event represents a genuine post-arbitration push below, and to build the
  // escalation comment further down.
  const lastCountedBotReview =
    allReviews
      .filter((r) => REVIEWER_BOT_LOGINS.has(r.userLogin))
      .slice()
      .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1))
      .findLast(
        (r) =>
          r.state !== 'DISMISSED' &&
          r.state !== 'APPROVED' &&
          !isInfraErrorReview(r) &&
          !isThreadReplyArtifactReview(r),
      ) ?? null;

  // Auto-reset when new commits are pushed during arbitration (LS-4857).
  // A synchronize event means the author pushed new code that has not been
  // reviewed yet — it deserves a fresh cycle even if the prior cycle limit
  // was hit. Mirrors the admin bot:reset-cycle-counter path but fires
  // automatically so the author does not need maintainer intervention for
  // every post-arbitration fix push.
  //
  // LS-9756: a qualifying push's own review job can be skipped (the
  // check-runner-access "Evaluate review gate" step computes should-review
  // false for that specific run — timing, a gate-evaluation quirk, or a
  // concurrency cancellation), in which case TRIGGERED_BY_SYNCHRONIZE never
  // reaches this code and the PR is stranded in arbitration with no way back
  // short of a maintainer override. The label remove+re-add self-heal trick
  // (already used to force a fresh review in that situation) fires a
  // `labeled` event instead of `synchronize`, so also accept
  // TRIGGERED_BY_READY_LABEL here — gated on the head SHA having actually
  // moved past the last cycle-counted review so a redundant label cycle on
  // an already-reviewed SHA can't loop-reset the counter without new code.
  const triggeredBySynchronize =
    process.env.TRIGGERED_BY_SYNCHRONIZE === 'true';
  const triggeredByReadyForReviewLabel =
    process.env.TRIGGERED_BY_READY_LABEL === 'true';
  let arbitrationCycleAutoReset = false;
  if (
    shouldAutoResetArbitrationCycle({
      cycle,
      arbitrationLabelPresent: prLabels.includes(NEEDS_HUMAN_ARBITRATION_LABEL),
      triggeredBySynchronize,
      triggeredByReadyForReviewLabel,
      headSha: sha,
      lastCountedBotReviewCommitId: lastCountedBotReview?.commitId ?? null,
    })
  ) {
    const priorBotReviews = allReviews.filter((r) =>
      REVIEWER_BOT_LOGINS.has(r.userLogin),
    );
    const dismissibleStates = new Set(['CHANGES_REQUESTED', 'APPROVED']);
    const reviewsToDismiss = priorBotReviews.filter(
      (r) =>
        r.state !== 'DISMISSED' &&
        dismissibleStates.has(r.state) &&
        !isInfraErrorReview(r),
    );
    for (const r of reviewsToDismiss) {
      dismissReview(
        prNumber,
        r.id,
        'Superseded by post-arbitration push — cycle counter auto-reset',
      );
      r.state = 'DISMISSED';
    }
    const now = new Date().toISOString();
    postEscalationComment(
      prNumber,
      `> [!NOTE]\n> New commit(s) pushed after arbitration at ${now}. ` +
        `Cycle counter auto-reset (${reviewsToDismiss.length} prior bot review(s) dismissed). ` +
        `Bot will treat this review as Cycle 1.`,
    );
    removeLabel(prNumber, NEEDS_HUMAN_ARBITRATION_LABEL);
    cycle = 1;
    arbitrationCycleAutoReset = true;
    process.stdout.write(
      `[reviewer] Auto-reset cycle counter after post-arbitration push; ${reviewsToDismiss.length} review(s) dismissed\n`,
    );
  }

  // Cycle > MAX_CYCLE → escalate instead of reviewing
  if (isEscalationRequired(cycle)) {
    await escalateToHumanArbitration(
      prNumber,
      sha,
      `Cycle ${cycle} exceeds MAX_CYCLE — applying '${NEEDS_HUMAN_ARBITRATION_LABEL}' label and exiting`,
      {
        body: buildCycleLimitArbitrationComment(cycle, lastCountedBotReview),
      },
    );
    return;
  }

  // --- Unchanged-diff re-affirmation (LS-10963) ---
  // A merge from the base branch, `update-branch`, or a clean rebase moves the
  // head SHA without changing the PR's own diff, yet (with
  // bot:ready-for-review persisting) still fires this workflow. When the bot's
  // latest verdict is an APPROVE and the diff is identical to the one it
  // approved, re-post that verdict on the new head and skip the LLM entirely:
  // no spend, and no nondeterministic non-APPROVE burning a cycle on code
  // that has not changed. Every gate above (human stand-down, override,
  // cycle-reset handling, arbitration auto-reset, MAX_CYCLE escalation) has
  // already run; only the LLM passes are skipped. An explicit reset, an
  // arbitration label, shadow mode or the REVIEWER_FORCE_FAIL test hook force
  // a full review. Fails open — any comparison error means a full review.
  const forceFullReviewReason = cycleResetByAdmin
    ? 'admin cycle-counter reset'
    : arbitrationCycleAutoReset ||
        prLabels.includes(NEEDS_HUMAN_ARBITRATION_LABEL)
      ? `'${NEEDS_HUMAN_ARBITRATION_LABEL}' present`
      : process.env.REVIEWER_SHADOW_MODE === 'true'
        ? 'shadow mode'
        : process.env.REVIEWER_FORCE_FAIL === 'true'
          ? 'REVIEWER_FORCE_FAIL'
          : null;
  if (forceFullReviewReason) {
    process.stdout.write(
      `[reviewer] Unchanged-diff check skipped (${forceFullReviewReason}) — running full review\n`,
    );
  } else {
    const unchanged = checkDiffUnchangedSinceApproval({
      reviews: allReviews,
      issueComments: prIssueComments,
      headSha: sha,
      baseRef: ctx.baseRefName,
    });
    if (unchanged.unchanged) {
      await reaffirmUnchangedApproval(prNumber, sha, unchanged.approvedSha, {
        provider: providerName,
        cycle,
        authorLogin,
        authorType,
        cycleCounterExclusions: {
          infra_failure: cycleExcludedInfra,
          dismissed: cycleExcludedDismissed,
          thread_reply_artifact: cycleExcludedThreadReplyArtifact,
          admin_reset: cycleResetByAdmin,
        },
      });
      return;
    }
    process.stdout.write(
      `[reviewer] Unchanged-diff check: ${unchanged.reason} — running full review\n`,
    );
  }

  // Gather prior review context for C2/C3 post-LLM validators.
  // Sort by submittedAt ascending so findLast reliably picks the most-recent
  // real bot review regardless of the order GitHub returns reviews in the API.
  // Infra-error and DISMISSED reviews are excluded so priorTitles is always
  // populated from a real review body (mirrors the exclusion in computeCycle).
  const botReviews = allReviews
    .filter((r) => REVIEWER_BOT_LOGINS.has(r.userLogin))
    .slice()
    .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1));
  lastBotReview =
    botReviews.findLast(
      (r) =>
        r.state !== 'DISMISSED' &&
        !isInfraErrorReview(r) &&
        !isThreadReplyArtifactReview(r),
    ) ?? null;
  const priorBotReviewBody = lastBotReview?.body ?? '';
  priorTitles = parseTitlesFromReviewBody(priorBotReviewBody);

  // Commits added since the last bot review (used by Cycle 2 validator).
  // Data already fetched by fetchPrData — no extra API call needed.
  if (cycle === 2 && lastBotReview) {
    const reviewedAtIdx = prAllCommits.indexOf(lastBotReview.commitId);
    if (reviewedAtIdx === -1) {
      // C1 review commitId not found — likely a force-push or rebase after C1.
      // Fall back to treating all current commits as post-C1 so new findings
      // that cite any current PR commit are not incorrectly stripped.
      postReviewCommitShas = prAllCommits;
      process.stdout.write(
        '[reviewer] Cycle 2: C1 review commitId not in current commit list (force-push/rebase?) — treating all commits as post-C1\n',
      );
    } else {
      postReviewCommitShas = prAllCommits.slice(reviewedAtIdx + 1);
      process.stdout.write(
        `[reviewer] Cycle 2: ${postReviewCommitShas.length} commit(s) added since C1 review\n`,
      );
    }
  }

  // Process author replies (JUSTIFY/FIX comments) for Cycle 2+ so the LLM can
  // evaluate them when adjudicating or verifying findings.
  // Data already fetched by fetchPrData — no extra API calls needed.
  let authorResponsesSection = '';
  let authorFormatErrors = 0;
  let resolvedTitles = new Set();
  let justifiedTitles = new Set();
  let cannotComplyTitles = new Set();
  let cannotComplyReasons = new Map();
  // Title-augmented CANNOT-COMPLY entries, checked against the Cycle 3
  // post-LLM validator output below (LS-8337) — populated here so the bot
  // gets a chance to accept or refute-with-reason before any escalation.
  let cannotComplyEntries = [];
  let evidenceResolutionSection = '';
  if (cycle >= 2 && lastBotReview) {
    try {
      const authorResponses = buildAuthorResponsesSection(
        prReviewComments,
        prIssueComments,
        lastBotReview.submittedAt,
        REVIEWER_BOT_LOGINS,
        lastBotReview.body ?? '',
      );
      authorResponsesSection = authorResponses.section;
      authorFormatErrors = authorResponses.formatErrors;
      if (authorResponses.ambiguousPrLevelReplies > 0) {
        process.stdout.write(
          `[reviewer] Cycle ${cycle}: ${authorResponses.ambiguousPrLevelReplies} PR-level FIX/JUSTIFY reply(ies) could not be resolved to a finding (no issue-id cited, multiple PR-level findings open) — will not suppress re-raises\n`,
        );
      }

      // Build sets of FIX'd/JUSTIFY'd/CANNOT-COMPLY'd finding titles for
      // post-LLM validators and prompt guidance.
      // FIX: replies with a valid PR SHA are treated as resolved even if the LLM
      // re-raises the finding — the author's commit is stronger evidence than the LLM.
      const resolved = buildAuthorResolvedTitles(
        authorResponses.items,
        prAllCommits,
      );
      resolvedTitles = resolved.resolvedTitles;
      justifiedTitles = resolved.justifiedTitles;
      cannotComplyTitles = resolved.cannotComplyTitles;
      cannotComplyReasons = resolved.cannotComplyReasons;
      if (resolvedTitles.size > 0) {
        process.stdout.write(
          `[reviewer] Cycle ${cycle}: ${resolvedTitles.size} finding(s) resolved via FIX: reply — will suppress if re-raised\n`,
        );
      }
      if (justifiedTitles.size > 0) {
        process.stdout.write(
          `[reviewer] Cycle ${cycle}: ${justifiedTitles.size} finding(s) with JUSTIFY: reply — will suppress if re-raised\n`,
        );
      }
      if (cannotComplyTitles.size > 0) {
        process.stdout.write(
          `[reviewer] Cycle ${cycle}: ${cannotComplyTitles.size} finding(s) with CANNOT-COMPLY: reply — bot will accept or refute-with-reason\n`,
        );
      }

      // Resolve any PR number / commit SHA / CI run ID the author cited in a
      // JUSTIFY/CANNOT-COMPLY rationale against GitHub, so the LLM treats a
      // verified citation as fact instead of dismissing it as unverifiable
      // (LS-8336). Non-fatal — a bad citation or gh failure never blocks the
      // review; the citation is simply omitted from the section.
      try {
        const resolvedCitations = resolveCitedEvidence(
          authorResponses.items,
          prAllCommits,
        );
        evidenceResolutionSection =
          formatEvidenceResolutionSection(resolvedCitations);
        if (resolvedCitations.length > 0) {
          process.stdout.write(
            `[reviewer] Cycle ${cycle}: evidence resolver resolved ${resolvedCitations.length} cited reference(s)\n`,
          );
        }
      } catch (err) {
        process.stderr.write(
          `[reviewer] Evidence resolver failed (non-fatal): ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }

      if (authorResponsesSection) {
        process.stdout.write(
          `[reviewer] Cycle ${cycle}: author response(s) found — injecting into user prompt\n`,
        );
      } else {
        process.stdout.write(
          `[reviewer] Cycle ${cycle}: no author responses found\n`,
        );
      }

      // Post FORMAT_ERROR_MESSAGE in-thread for each MALFORMED inline reply.
      const malformedRootIds = getMalformedInlineReplies(
        prReviewComments,
        lastBotReview.submittedAt,
        REVIEWER_BOT_LOGINS,
      );
      for (const rootId of malformedRootIds) {
        try {
          postReviewThreadReply(prNumber, rootId, FORMAT_ERROR_MESSAGE);
          process.stdout.write(
            `[reviewer] Cycle ${cycle}: posted format-error reply to thread ${rootId}\n`,
          );
        } catch (postErr) {
          process.stderr.write(
            `[reviewer] Failed to post format-error reply to thread ${rootId}: ${postErr instanceof Error ? postErr.message : String(postErr)}\n`,
          );
        }
      }

      // Collect CANNOT-COMPLY entries (title-augmented) for the Cycle 3
      // post-validator escalation check below. Unlike the prior behavior,
      // this no longer short-circuits before the LLM runs — the bot is given
      // accept/refute-with-reason guidance via buildCycleRoleSection and only
      // escalates if a claim is still unresolved after its Cycle 3
      // verification pass (LS-8337).
      if (cycle >= 3) {
        cannotComplyEntries = withCannotComplyTitles(
          collectCannotComplyResponses(
            prReviewComments,
            prIssueComments,
            lastBotReview.submittedAt,
            REVIEWER_BOT_LOGINS,
            authorLogin,
          ),
          prReviewComments,
          REVIEWER_BOT_LOGINS,
        );
      }
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to process author replies for cycle ${cycle}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      // Non-fatal: proceed without author response context
    }
  }

  // Dynamic imports so module resolution doesn't fail when dependency PRs
  // (T7 CopilotCLIProvider, T8 AnthropicProvider) haven't merged yet.
  let provider;
  try {
    if (providerName === 'anthropic') {
      const { AnthropicProvider } =
        await import('./lib/providers/anthropic.mjs');
      provider = new AnthropicProvider();
    } else if (providerName === 'github-models') {
      const { GitHubModelsProvider } =
        await import('./lib/providers/github-models.mjs');
      provider = new GitHubModelsProvider();
    } else if (providerName === 'gemini') {
      const { GeminiProvider } = await import('./lib/providers/gemini.mjs');
      provider = new GeminiProvider();
    } else {
      const { CopilotCLIProvider } =
        await import('./lib/providers/copilot-cli.mjs');
      provider = new CopilotCLIProvider();
    }
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to init provider '${providerName}': ${err instanceof Error ? err.message : String(err)}\n`,
    );
    // Route through the same typed-failure handler as runtime errors so the
    // PR author gets actionable guidance. Missing-API-key errors (the most
    // common init failure) are tagged as `auth` so the maintainer-action
    // message fires; other init failures fall through to the generic
    // infra-error review.
    const taggedErr = _classifyInitError(err, providerName);
    await handleLlmFailure(prNumber, taggedErr);
    process.exit(0);
  }

  // Verify file paths referenced in changed .md files against the base branch
  // so the LLM doesn't flag correctly-documented cross-references as "missing
  // implementation" (LS-4330). Non-fatal — proceed without context on error.
  let existingCrossReferences = [];
  try {
    existingCrossReferences = verifyReferencedPaths(ctx.diff, ctx.baseRefName);
    if (existingCrossReferences.length > 0) {
      process.stdout.write(
        `[reviewer] Reference verifier: ${existingCrossReferences.length} cross-reference(s) verified in ${ctx.baseRefName}: ${existingCrossReferences.join(', ')}\n`,
      );
    }
  } catch (err) {
    process.stderr.write(
      `[reviewer] Reference verifier failed (non-fatal): ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  // Parse <integration-results> PR comments so the LLM can confirm a touched
  // integration spec has structured evidence before flagging it (LS-4617).
  const integrationResults = extractIntegrationResults(prIssueComments);
  if (integrationResults.length > 0) {
    process.stdout.write(
      `[reviewer] Integration results: parsed ${integrationResults.length} spec result(s) from PR comments\n`,
    );
  }
  const integrationResultsSection =
    formatIntegrationResultsSection(integrationResults);

  // Fetch the current HEAD content of changed files (plus their imports, test
  // counterparts, and eslintrc overrides) so the LLM evaluates findings against
  // present file state, not just diff context lines (LS-7768). Non-fatal —
  // proceed with the diff alone on any error.
  let fullFileContextSection = '';
  try {
    const changedFiles = parseChangedFilePaths(ctx.diff);
    if (changedFiles.length > 0) {
      const reviewCtx = await fetchContext({
        changedFiles,
        prBody: ctx.body ?? '',
      });
      fullFileContextSection = formatContextForPrompt(reviewCtx, {
        maxBytes: FULL_FILE_CONTEXT_MAX_BYTES,
      });
      if (fullFileContextSection) {
        process.stdout.write(
          `[reviewer] Full-file context: injected current HEAD content for ${changedFiles.length} changed file(s)\n`,
        );
      }
    }
  } catch (err) {
    process.stderr.write(
      `[reviewer] Full-file context fetch failed (non-fatal): ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  // Fetch the base branch's current CI state so the LLM can classify a check
  // that is already failing on the base branch as pre-existing (non-blocking)
  // rather than a regression this PR introduced (LS-8312, AC1). Non-fatal —
  // proceed without the section on any error.
  let baseBranchCiSection = '';
  try {
    const baseFailingChecks = fetchBaseBranchFailingChecks(ctx.baseRefName);
    if (baseFailingChecks.length > 0) {
      baseBranchCiSection = formatBaseBranchCiSection(
        baseFailingChecks,
        ctx.baseRefName,
      );
      process.stdout.write(
        `[reviewer] Base-branch CI: ${baseFailingChecks.length} check(s) failing on ${ctx.baseRefName}: ${baseFailingChecks.join(', ')}\n`,
      );
    }
  } catch (err) {
    process.stderr.write(
      `[reviewer] Base-branch CI fetch failed (non-fatal): ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  // Build prompts — fail open on infra errors (e.g. missing reviewer-rules.md)
  let systemPrompt, userPrompt;
  try {
    const cycleRoleSection = buildCycleRoleSection(
      cycle,
      priorTitles,
      postReviewCommitShas,
      resolvedTitles,
      justifiedTitles,
      cannotComplyTitles,
      cannotComplyReasons,
    );
    systemPrompt = buildSystemPrompt(cycleRoleSection);
    userPrompt = buildUserPrompt(
      ctx,
      authorResponsesSection,
      existingCrossReferences,
      integrationResultsSection,
      fullFileContextSection,
      baseBranchCiSection,
      evidenceResolutionSection,
    );
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to build prompts: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    try {
      setCommitStatus(sha, 'failure', 'Review failed: prompt build error');
    } catch {
      // best-effort status update; already exiting due to the prompt-build failure above
    }
    process.exit(0);
  }

  // Decide between single-pass and multi-pass based on diff size / sensitive paths
  const diff = typeof ctx.diff === 'string' ? ctx.diff : '';
  if (!diff.trim()) {
    process.stdout.write(
      '[reviewer] Skipping: no diff available (failed or empty diff must not be treated as trivial)\n',
    );
    try {
      setCommitStatus(sha, 'failure', 'No diff available — review skipped');
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to set bot-review failure: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    return;
  }
  const trivial = isTrivialPR(diff);
  const costCap = new CostCap({ prNumber, provider: providerName });
  let reviewText;
  let reviewUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };
  let latencyMs = 0;
  let usedFallbackModel = null;
  const retryOpts = buildRetryOpts(sha);

  if (trivial) {
    process.stdout.write(
      '[reviewer] Trivial PR — running single-pass review\n',
    );
    try {
      const t0 = Date.now();
      const result = await withRetry(
        () => {
          maybeThrowForceFailError();
          const estimate = costCap.estimateCost(
            systemPrompt.length + userPrompt.length,
            providerName,
          );
          costCap.checkBefore(estimate);
          return provider.review({ system: systemPrompt, user: userPrompt });
        },
        undefined,
        retryOpts,
      );
      latencyMs = Date.now() - t0;
      reviewText = result.text;
      reviewUsage = result.usage ?? reviewUsage;
      costCap.add(result.usage);
      costCap.checkAfter();
    } catch (err) {
      process.stderr.write(
        `[reviewer] Provider error after all retries: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      const fallbackProvider = await createFallbackProvider(err, providerName);
      let lastErr = err;
      if (fallbackProvider) {
        process.stdout.write(
          `[reviewer] Primary model unavailable; retrying with fallback model ${fallbackProvider.model}\n`,
        );
        try {
          const t0 = Date.now();
          const result = await withRetry(
            () => {
              const estimate = costCap.estimateCost(
                systemPrompt.length + userPrompt.length,
                fallbackProvider.model,
              );
              costCap.checkBefore(estimate);
              return fallbackProvider.review({
                system: systemPrompt,
                user: userPrompt,
              });
            },
            [30_000],
            retryOpts,
          );
          latencyMs = Date.now() - t0;
          reviewText = result.text;
          reviewUsage = result.usage ?? reviewUsage;
          costCap.add(result.usage);
          costCap.checkAfter();
          usedFallbackModel = fallbackProvider.model;
        } catch (fallbackErr) {
          lastErr = fallbackErr;
          process.stderr.write(
            `[reviewer] Fallback model also failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}\n`,
          );
        }
      }
      if (!usedFallbackModel) {
        await handleLlmFailure(prNumber, lastErr, {
          provider: providerName,
          cycle,
          usage: reviewUsage,
          latencyMs,
          authorLogin,
          authorType,
          cycleCounterExclusions: {
            infra_failure: cycleExcludedInfra,
            dismissed: cycleExcludedDismissed,
            thread_reply_artifact: cycleExcludedThreadReplyArtifact,
            admin_reset: cycleResetByAdmin,
          },
        });
        process.exit(1);
      }
    }
  } else {
    process.stdout.write(
      '[reviewer] Non-trivial PR — running multi-pass review (correctness → security → contract → docs)\n',
    );
    // Shared across retry attempts — and across the primary→fallback model
    // handover — so a throttled pass resumes instead of re-spending quota on
    // the passes that already succeeded (LS-9983).
    const resumeState = createResumeState();
    try {
      const t0 = Date.now();
      const { passes, usage: multiPassUsage } = await withRetry(
        () => {
          maybeThrowForceFailError();
          return runMultiPass(provider, systemPrompt, userPrompt, {
            costCap,
            providerName,
            resumeState,
          });
        },
        undefined,
        retryOpts,
      );
      latencyMs = Date.now() - t0;
      reviewText = consolidate(passes);
      reviewUsage = multiPassUsage;
    } catch (err) {
      process.stderr.write(
        `[reviewer] Multi-pass error after all retries: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      const fallbackProvider = await createFallbackProvider(err, providerName);
      let lastErr = err;
      if (fallbackProvider) {
        process.stdout.write(
          `[reviewer] Primary model unavailable; retrying multi-pass with fallback model ${fallbackProvider.model}\n`,
        );
        try {
          const t0 = Date.now();
          const { passes, usage: multiPassUsage } = await withRetry(
            () => {
              return runMultiPass(fallbackProvider, systemPrompt, userPrompt, {
                costCap,
                providerName: fallbackProvider.model,
                resumeState,
              });
            },
            [30_000],
            retryOpts,
          );
          latencyMs = Date.now() - t0;
          reviewText = consolidate(passes);
          reviewUsage = multiPassUsage;
          usedFallbackModel = fallbackProvider.model;
        } catch (fallbackErr) {
          lastErr = fallbackErr;
          process.stderr.write(
            `[reviewer] Fallback model also failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}\n`,
          );
        }
      }
      if (!usedFallbackModel) {
        await handleLlmFailure(prNumber, lastErr, {
          provider: providerName,
          cycle,
          usage: reviewUsage,
          latencyMs,
          authorLogin,
          authorType,
          cycleCounterExclusions: {
            infra_failure: cycleExcludedInfra,
            dismissed: cycleExcludedDismissed,
            thread_reply_artifact: cycleExcludedThreadReplyArtifact,
            admin_reset: cycleResetByAdmin,
          },
        });
        process.exit(1);
      }
    }
  }

  const shadowMode = process.env.REVIEWER_SHADOW_MODE === 'true';

  // Parse findings from the full, untruncated reviewText so that a large
  // multi-pass response is not silently turned into invalid JSON before
  // parsing. Truncation is applied later to the formatted output body only.
  let parsed = parseFindingsFromText(reviewText);
  if (!parsed.ok) {
    process.stderr.write(
      '[reviewer] Model output could not be parsed as JSON — attempting reformat via LLM\n',
    );
    const RAW_SNIPPET_CHARS = 500;
    process.stderr.write(
      `[reviewer] Raw model output (${Math.min(reviewText.length, RAW_SNIPPET_CHARS)} of ${reviewText.length} chars): ${reviewText.slice(0, RAW_SNIPPET_CHARS)}\n`,
    );
    parsed = await tryReformatFindings(reviewText, provider);
    if (parsed.ok) {
      process.stdout.write('[reviewer] Reformat retry succeeded\n');
    } else {
      process.stderr.write('[reviewer] Reformat retry also failed\n');
    }
  }

  let verdict = 'UNPARSEABLE';
  if (!parsed.ok) {
    await emitTelemetry(
      buildRecord({
        pr: prNumber,
        sha: process.env.PR_HEAD_SHA ?? '',
        model: process.env.REVIEWER_MODEL ?? 'codex',
        provider: providerName,
        cycle,
        verdict,
        reviewType: 'real',
        findings: [],
        usage: reviewUsage,
        latencyMs,
        shadow: shadowMode,
        authorLogin,
        authorType,
        formatErrors: authorFormatErrors,
        cycleCounterExclusions: {
          infra_failure: cycleExcludedInfra,
          dismissed: cycleExcludedDismissed,
          admin_reset: cycleResetByAdmin,
        },
      }),
    );
    try {
      setCommitStatus(sha, 'failure', 'Review output could not be parsed');
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to set bot-review failure: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    if (shadowMode) {
      // GitHub issue comment body limit is 65,536 chars; truncate the raw
      // fallback text (not the findings JSON) before posting.
      const GITHUB_BODY_LIMIT = 60_000;
      const truncated =
        reviewText.length > GITHUB_BODY_LIMIT
          ? reviewText.slice(0, GITHUB_BODY_LIMIT) +
            '\n\n_[Review truncated — body exceeded GitHub comment size limit]_'
          : reviewText;
      const fallback = `> ⚠️ **Unparsed output** — the model did not return valid JSON. Raw output:\n\n${truncated}`;
      try {
        await postShadowComment(prNumber, fallback);
      } catch (err) {
        process.stderr.write(
          `[reviewer] Failed to post fallback comment: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    } else {
      try {
        await postInfraErrorReview(prNumber);
      } catch (err) {
        process.stderr.write(
          `[reviewer] Failed to post infra error review: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
      // Apply the terminal label first; only clean up the operational
      // labels after it sticks. If `addLabelAsApp` fails, leave the existing
      // operational labels intact so the labeled-event self-heal trigger
      // can still fire on the next attempt.
      try {
        await addLabelAsApp(prNumber, 'review-bot-degraded');
        cleanupOperationalLabels(prNumber, {
          except: 'review-bot-degraded',
          preserveReadyLabel: true,
        });
      } catch (err) {
        process.stderr.write(
          `[reviewer] Failed to apply review-bot-degraded label: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
    return;
  }

  // HEAD-artifact validator (LS-8312, AC2): strip "missing tests/file" findings
  // whose cited artifact already exists at HEAD (the reviewer runs on the PR-head
  // checkout, so working-tree existence is HEAD existence). Runs before the
  // cycle validators and on every cycle.
  const headArtifactFilter = filterStaleMissingArtifactFindings(
    parsed.findings,
  );
  if (headArtifactFilter.stripped.length > 0) {
    process.stdout.write(
      `::warning::[reviewer] HEAD-artifact validator: stripped ${headArtifactFilter.stripped.length} stale "missing artifact" finding(s) — ${formatStrippedLog(headArtifactFilter.stripped)}\n`,
    );
  }

  // Fabricated-evidence guard (LS-9729): strip findings whose cited
  // `file:line` doesn't actually contain the code pattern the finding quotes,
  // or whose cited commit SHA doesn't resolve in git history. Runs
  // unconditionally on every cycle — unlike the cycle 2/3 validators below,
  // a fabricated citation isn't specific to a particular review cycle.
  const fabricationGuard = filterFabricatedFindings(headArtifactFilter.kept);
  if (fabricationGuard.stripped.length > 0) {
    process.stdout.write(
      `::warning::[reviewer] Fabrication guard: stripped ${fabricationGuard.stripped.length} finding(s) with fabricated citations — ${formatStrippedLog(fabricationGuard.stripped)}\n`,
    );
  }

  // Affirmation/defect polarity guard (LS-8576): reclassify findings whose
  // language is pure praise ("directly addresses…", "excellent refactor")
  // to `observation` severity regardless of the severity the model assigned.
  // Runs before gateFindingsBySeverity on every cycle so a review that is
  // 100% affirmations always gates to zero blocking findings — i.e. always
  // verdicts APPROVED, never "Changes Required".
  const affirmationGuard = reclassifyAffirmationFindings(fabricationGuard.kept);
  if (affirmationGuard.reclassified.length > 0) {
    process.stdout.write(
      `::warning::[reviewer] Affirmation guard: reclassified ${affirmationGuard.reclassified.length} finding(s) to observation severity — ${formatReclassifiedLog(affirmationGuard.reclassified)}\n`,
    );
  }

  // Apply cycle-specific post-LLM validator (T22).
  let filteredFindings = affirmationGuard.kept;
  let strippedFindings = [
    ...headArtifactFilter.stripped,
    ...fabricationGuard.stripped,
  ];
  if (cycle === 2) {
    const { kept, stripped } = filterFindingsCycle2(
      filteredFindings,
      priorTitles,
      postReviewCommitShas,
      resolvedTitles,
      justifiedTitles,
    );
    if (stripped.length > 0) {
      process.stdout.write(
        `::warning::[reviewer] Cycle 2 validator: stripped ${stripped.length} finding(s) — ${formatStrippedLog(stripped)}\n`,
      );
    }
    filteredFindings = kept;
    strippedFindings = [...strippedFindings, ...stripped];
  } else if (cycle === 3) {
    const { kept, stripped } = filterFindingsCycle3(
      filteredFindings,
      priorTitles,
      resolvedTitles,
      justifiedTitles,
    );
    if (stripped.length > 0) {
      process.stdout.write(
        `::warning::[reviewer] Cycle 3 validator: stripped ${stripped.length} finding(s) — ${formatStrippedLog(stripped)}\n`,
      );
    }
    filteredFindings = kept;
    strippedFindings = [...strippedFindings, ...stripped];

    // CANNOT-COMPLY: escalate only if a claim is still unresolved after the
    // bot's Cycle 3 verification pass — not merely because a CANNOT-COMPLY
    // token was posted (LS-8337 AC4). Cycle 3 is the final review cycle, so
    // a still-unresolved claim here is a genuine standoff worth a human
    // decision rather than waiting for the generic MAX_CYCLE overflow.
    if (cannotComplyEntries.length > 0) {
      const unresolved = unresolvedCannotComplyEntries(
        cannotComplyEntries,
        filteredFindings,
      );
      if (unresolved.length > 0) {
        await escalateToHumanArbitration(
          prNumber,
          sha,
          `Cycle ${cycle}: CANNOT-COMPLY claim(s) still unresolved after bot verification — applying '${NEEDS_HUMAN_ARBITRATION_LABEL}' label and exiting`,
          {
            body: buildCannotComplyArbitrationComment(
              prNumber,
              cycle,
              unresolved,
            ),
          },
        );
        return;
      }
      process.stdout.write(
        `[reviewer] Cycle ${cycle}: all ${cannotComplyEntries.length} CANNOT-COMPLY claim(s) resolved by the bot (accepted or refuted) — no escalation\n`,
      );
    }
  }

  const gated = gateFindingsBySeverity(filteredFindings);
  process.stdout.write(
    `[reviewer] Gating: ${gated.blocking.length} blocking, ${gated.nonBlocking.length} non-blocking, ${gated.observations.length} observations, ${gated.dropped.length} trivia dropped\n`,
  );
  verdict = gated.blocking.length === 0 ? 'APPROVED' : 'REQUEST_CHANGES';

  // Set bot-review commit status based on verdict. Failure writes re-check
  // for a mid-run human maintainer APPROVE (which supersedes the bot verdict)
  // so W5's override is never clobbered by a slower in-flight review.
  try {
    if (verdict === 'APPROVED') {
      setCommitStatus(sha, 'success', 'Review passed');
    } else {
      setFailureStatusUnlessHumanApproved(
        prNumber,
        sha,
        'Blocking findings require changes',
      );
    }
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to set bot-review status: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  // Emit telemetry before posting — survives comment/review API failures
  await emitTelemetry(
    buildRecord({
      pr: prNumber,
      sha: process.env.PR_HEAD_SHA ?? '',
      model: process.env.REVIEWER_MODEL ?? 'codex',
      provider: providerName,
      cycle,
      verdict,
      reviewType: 'real',
      findings: filteredFindings,
      strippedFindings,
      usage: reviewUsage,
      latencyMs,
      shadow: shadowMode,
      authorLogin,
      authorType,
      formatErrors: authorFormatErrors,
      cycleCounterExclusions: {
        infra_failure: cycleExcludedInfra,
        dismissed: cycleExcludedDismissed,
        thread_reply_artifact: cycleExcludedThreadReplyArtifact,
        admin_reset: cycleResetByAdmin,
      },
    }),
  );

  // Post shadow comment or real review — fail open on infra errors
  if (shadowMode) {
    // Truncate formatted shadow body to GitHub comment size limit.
    const GITHUB_BODY_LIMIT = 60_000;
    let shadowBody = formatShadowBody(gated);
    if (shadowBody.length > GITHUB_BODY_LIMIT) {
      shadowBody =
        shadowBody.slice(0, GITHUB_BODY_LIMIT) +
        '\n\n_[Review truncated — body exceeded GitHub comment size limit]_';
    }
    try {
      await postShadowComment(prNumber, shadowBody);
      process.stdout.write(
        `[reviewer] Shadow review posted on PR #${prNumber} (${trivial ? 'single' : 'multi'}-pass, cycle ${cycle})\n`,
      );
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to post shadow comment: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(0);
    }
  } else {
    if (hasCriticalBlockingFinding(gated.blocking)) {
      try {
        await addLabelAsApp(prNumber, NEEDS_HUMAN_SECURITY_REVIEW_LABEL);
        process.stdout.write(
          `[reviewer] Applied '${NEEDS_HUMAN_SECURITY_REVIEW_LABEL}' label to PR #${prNumber} (critical finding)\n`,
        );
      } catch (err) {
        process.stderr.write(
          `[reviewer] Failed to apply security escalation label: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
    try {
      await postRealReview(prNumber, {
        ...gated,
        fallbackModel: usedFallbackModel ?? undefined,
        // Enables pre-validation of inline comment positions against the diff
        // hunks so one bad position no longer drops every thread (LS-8499).
        diff,
      });
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to post real review: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(0);
    }
    if (verdict === 'APPROVED') {
      // Note: only `merge-when-ready` is applied here — including on stacked
      // (non-main-base) PRs. Stacked PRs merge base-first: the child waits for
      // its parent to land, at which point the merge queue's
      // retargetDependentPRs re-bases it onto main and it proceeds through the
      // normal queue path. `merge-to-parent` is a deliberate manual escape
      // hatch for collapsing a child into its parent branch, never applied by
      // the bot (LS-8489).
      try {
        addLabel(prNumber, 'merge-when-ready');
        process.stdout.write(
          `[reviewer] Added 'merge-when-ready' label to PR #${prNumber}\n`,
        );
      } catch (err) {
        process.stderr.write(
          `[reviewer] Failed to add label 'merge-when-ready': ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
    // Keep `bot:ready-for-review` through merge — not only while the cycle is
    // mid-flight. Stripping it on APPROVED leaves subsequent pushes (post-
    // approval polish, typo fixes) with no Reviewer (W1) trigger: the new
    // HEAD SHA has no `bot-review` commit status, and the ruleset requires
    // that status on HEAD, so merge silently stalls. Preserving the label
    // means every push fires a fresh cycle until the PR merges (at which
    // point label state is irrelevant). See LS-4678.
    cleanupOperationalLabels(prNumber, {
      preserveReadyLabel: true,
    });
  }
}

/**
 * Re-post the bot's APPROVE verdict on `sha` without running the LLM, because
 * the PR's diff is unchanged since the approval at `approvedSha` (LS-10963).
 *
 * Mirrors the tail of the normal APPROVED path in main() — `bot-review`
 * success, telemetry, an APPROVE review via postRealReview (so the
 * ci-orchestrator's restore-merge-label and everything else keyed on an
 * active bot approval behave exactly as after a clean review),
 * `merge-when-ready`, and operational-label cleanup preserving
 * `bot:ready-for-review`. The new APPROVED review is excluded from the cycle
 * counter like every approval (computeCycle), so this never consumes a cycle.
 *
 * @param {number} prNumber
 * @param {string} sha
 * @param {string} approvedSha
 * @param {{ provider: string, cycle: number, authorLogin: string, authorType: string, cycleCounterExclusions: object }} telemetryCtx
 */
async function reaffirmUnchangedApproval(
  prNumber,
  sha,
  approvedSha,
  telemetryCtx,
) {
  const shortSha = approvedSha.slice(0, 7);
  process.stdout.write(
    `[reviewer] Diff unchanged since approved ${shortSha} — re-affirming APPROVE on ${sha.slice(0, 7)} without LLM review (LS-10963)\n`,
  );
  try {
    setCommitStatus(
      sha,
      'success',
      `Review passed (diff unchanged since approved ${shortSha})`,
    );
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to set bot-review success: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  await emitTelemetry(
    buildRecord({
      pr: prNumber,
      sha,
      model: process.env.REVIEWER_MODEL ?? 'codex',
      provider: telemetryCtx.provider,
      cycle: telemetryCtx.cycle,
      verdict: 'APPROVED',
      reviewType: 'reaffirmed',
      findings: [],
      usage: undefined,
      latencyMs: 0,
      shadow: false,
      authorLogin: telemetryCtx.authorLogin,
      authorType: telemetryCtx.authorType,
      cycleCounterExclusions: telemetryCtx.cycleCounterExclusions,
    }),
  );
  try {
    await postRealReview(prNumber, {
      blocking: [],
      nonBlocking: [],
      observations: [],
      notice: buildReaffirmNotice(approvedSha),
    });
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to post re-affirmed approval review: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(0);
  }
  try {
    addLabel(prNumber, 'merge-when-ready');
    process.stdout.write(
      `[reviewer] Added 'merge-when-ready' label to PR #${prNumber}\n`,
    );
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to add label 'merge-when-ready': ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  // Keep bot:ready-for-review through merge (LS-4678), as on the normal path.
  cleanupOperationalLabels(prNumber, { preserveReadyLabel: true });
}

/**
 * Apply the `needs-human-arbitration` label and set the bot-review commit
 * status to failure. Shared by the cycle>MAX_CYCLE and CANNOT-COMPLY
 * escalation paths so their error-handling stays in sync.
 *
 * Caller must `return` after awaiting to exit the review flow.
 *
 * @param {number} prNumber
 * @param {string} sha
 * @param {string} logReason  Written to stdout before acting
 * @param {{ body?: string }} [details]  Optional issue-level comment summarizing
 *   what specifically needs human arbitration — surfaced as a top-level PR
 *   comment so a maintainer entering the PR knows where to start. If `body` is
 *   empty/omitted no comment is posted (the label and failing status still set).
 */
/**
 * Hidden marker embedded in the arbitration summary comment so the
 * label-pager workflow (W4) can find it and surface a snippet in the
 * Discord escalation page. Keep in sync with `.github/workflows/label-pager.yml`.
 */
const ARBITRATION_COMMENT_MARKER = '<!-- arbitration-details:v1 -->';

async function escalateToHumanArbitration(
  prNumber,
  sha,
  logReason,
  details = {},
) {
  process.stdout.write(`[reviewer] ${logReason}\n`);
  // Post the arbitration summary BEFORE applying the label so the W4
  // label-pager (which fires on `labeled`) can inline it into the Discord
  // page without racing the comment write.
  const commentBody = details.body?.trim();
  if (commentBody) {
    const markedBody = `${ARBITRATION_COMMENT_MARKER}\n${commentBody}`;
    try {
      await postEscalationComment(prNumber, markedBody);
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to post arbitration summary comment: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
  // Apply the terminal label after the comment; only clean up operational
  // labels after it sticks. If `addLabelAsApp` fails the operational labels
  // stay intact so the next labeled event can still self-heal.
  try {
    await addLabelAsApp(prNumber, NEEDS_HUMAN_ARBITRATION_LABEL);
    // LS-ARBITRATION-PRESERVE: keep bot:ready-for-review so a post-arbitration
    // push triggers Reviewer (W1) via synchronize, enabling the auto-reset path.
    cleanupOperationalLabels(prNumber, { preserveReadyLabel: true });
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to apply escalation label: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  try {
    setFailureStatusUnlessHumanApproved(
      prNumber,
      sha,
      'Escalated to human arbitration',
    );
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to set bot-review failure: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

const MAX_ARBITRATION_REASON_LEN = 400;
const MAX_ARBITRATION_TITLES = 10;

/**
 * Truncate a multi-line reason to a single block of at most
 * `MAX_ARBITRATION_REASON_LEN` characters, preserving newlines so the
 * blockquote in the arbitration comment renders cleanly.
 *
 * @param {string} text
 * @returns {string}
 */
function truncateReason(text) {
  if (text.length <= MAX_ARBITRATION_REASON_LEN) return text;
  return `${text.slice(0, MAX_ARBITRATION_REASON_LEN).trimEnd()}…`;
}

/**
 * Build the GitHub URL for a PR comment so maintainers can jump straight to
 * the relevant thread from the arbitration summary. Returns null when the
 * repository slug is not available (e.g. local runs without
 * GITHUB_REPOSITORY); callers fall back to plain text in that case.
 *
 * @param {number} prNumber
 * @param {'review' | 'issue'} source
 * @param {number} commentId
 * @returns {string | null}
 */
function buildCommentUrl(prNumber, source, commentId) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return null;
  const anchor =
    source === 'review'
      ? `discussion_r${commentId}`
      : `issuecomment-${commentId}`;
  return `https://github.com/${repo}/pull/${prNumber}#${anchor}`;
}

/**
 * Build the issue-level comment posted when the cycle counter exceeds
 * MAX_CYCLE. Lists the open mandate titles from the most recent bot review
 * so a maintainer entering the PR can see what the bot was still flagging.
 *
 * @param {number} cycle
 * @param {{ body: string | null } | null} lastBotReview
 * @returns {string}
 */
function buildCycleLimitArbitrationComment(cycle, lastBotReview) {
  const titles = parseTitlesFromReviewBody(lastBotReview?.body ?? '');
  const lines = [
    '> [!IMPORTANT]',
    `> **Human arbitration needed — review cycle limit (${cycle}) exceeded.**`,
    '',
    'The bot and the author could not converge after the maximum number of review cycles. A human reviewer is needed to adjudicate the outstanding findings below.',
  ];
  if (titles.length === 0) {
    lines.push(
      '',
      '_No findings could be extracted from the last bot review body._',
    );
  } else {
    const shown = titles.slice(0, MAX_ARBITRATION_TITLES);
    lines.push('', '**Outstanding findings from the last bot review:**', '');
    for (const t of shown) lines.push(`- ${t}`);
    if (titles.length > shown.length) {
      lines.push(
        `- _…and ${titles.length - shown.length} more (see the latest bot review)_`,
      );
    }
  }
  lines.push(
    '',
    '**Author agent:** push new commits addressing the outstanding findings above. The bot will automatically reset the cycle counter and post a fresh review on the next push — no manual `bot:reset-cycle-counter` needed.',
    '',
    '**Maintainer:** if the author cannot push a code fix (e.g. the bot is wrong), apply `review-bot-override` to bypass, or `bot:reset-cycle-counter` to manually grant another cycle without requiring a push.',
  );
  return lines.join('\n');
}

/**
 * Build the issue-level comment posted when a CANNOT-COMPLY claim is still
 * unresolved after the bot's Cycle 3 verification pass. Lists every
 * still-unresolved entry with its issue-id, the author's reason, and a link
 * to the originating comment so a maintainer can jump straight to the
 * disputed thread. The bot has already had a chance to accept or
 * refute-with-reason each claim (LS-8337) — reaching this comment means it
 * could not resolve at least one of them on its own.
 *
 * @param {number} prNumber
 * @param {number} cycle
 * @param {import('./lib/cycle-protocol.mjs').CannotComplyEntry[]} entries
 * @returns {string}
 */
function buildCannotComplyArbitrationComment(prNumber, cycle, entries) {
  const lines = [
    '> [!IMPORTANT]',
    `> **Human arbitration needed — \`CANNOT-COMPLY\` claim still unresolved (cycle ${cycle}).**`,
    '',
    'The author declared one or more findings impossible to fix. The bot evaluated each claim and could not resolve it (accept or refute-with-reason) on its own — a human reviewer is needed to adjudicate.',
    '',
  ];
  if (entries.length === 0) {
    lines.push('_No CANNOT-COMPLY entries could be extracted._');
  } else {
    for (const e of entries) {
      const url = buildCommentUrl(prNumber, e.source, e.commentId);
      const linkLabel =
        e.source === 'review' ? 'review thread' : 'issue comment';
      const link = url
        ? `[${linkLabel}](${url})`
        : `${linkLabel} #${e.commentId}`;
      const reason = truncateReason(e.reason)
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
      lines.push(`- **\`${e.issueId}\`** — ${link}`, '', reason, '');
    }
  }
  lines.push(
    '**What to do:** for each entry above, decide whether to (a) accept the claim and apply `review-bot-override`, or (b) reject it and ask the author to push a fix (then apply `bot:reset-cycle-counter` to resume bot review).',
  );
  return lines.join('\n');
}

/**
 * Wrap a provider-init error with a `kind` so it routes through the same
 * typed-failure path as runtime errors. The most common init failure is a
 * missing API key (e.g. `GEMINI_CODE_REVIEW_API_KEY` secret unset / typo) —
 * those get tagged `auth` so the maintainer-action message posts. Anything
 * else falls through to the generic infra-error review (kind=null).
 *
 * The returned object is a plain Error (not a typed provider error class) —
 * `classifyProviderError` reads `.kind` directly off it.
 *
 * @param {unknown} err
 * @param {string} providerName
 * @returns {Error & {kind?: string}}
 */
function _classifyInitError(err, providerName) {
  const msg = err instanceof Error ? err.message : String(err);
  const wrapped = err instanceof Error ? err : new Error(msg);
  // Missing-API-key signal: every provider's constructor throws with the
  // word "API key" (Gemini, Anthropic) or "auth token" (GitHub Models) when
  // its required env var isn't set.
  if (/no\s+(?:API\s+key|auth\s+token)/i.test(msg)) {
    wrapped.kind = 'auth';
  }
  wrapped.providerName = providerName;
  return wrapped;
}

/**
 * Map a provider error to its known kind. Returns null for errors that aren't
 * categorized (treated as generic infra failures).
 *
 * @param {unknown} err
 * @returns {'rate-limit'|'quota'|'billing'|'auth'|'context-too-large'|'cost-cap'|null}
 */
function classifyProviderError(err) {
  if (!err || typeof err !== 'object') return null;
  if (err.name === 'CostCapExceededError') return 'cost-cap';
  const k = err.kind;
  if (
    k === 'rate-limit' ||
    k === 'quota' ||
    k === 'billing' ||
    k === 'auth' ||
    k === 'context-too-large'
  ) {
    return k;
  }
  return null;
}

/**
 * Status text shown on the `bot-review` commit status for each known
 * failure kind. Branch protection treats `failure` as not-passing; the
 * description disambiguates so maintainers can see the cause without
 * opening the run logs.
 *
 * @param {string|null} kind
 * @returns {string}
 */
function statusDescriptionForFailure(kind) {
  switch (kind) {
    // Reached only after the run has already auto-waited its full retry
    // budget (LS-9983) — the "queued behind quota, no action needed" pending
    // status covers the waiting. Word it as the retry-required half of that
    // distinction so an agent can tell the two apart from the status alone.
    case 'rate-limit':
      return 'Reviewer quota still saturated after auto-waiting the full retry budget; retry required';
    case 'billing':
      return 'Reviewer billing credits depleted — account owner must top up; retrying will not help';
    case 'quota':
      return 'Reviewer daily quota exhausted (free tier)';
    case 'auth':
      return 'Reviewer auth failed — maintainer action required';
    case 'context-too-large':
      return 'PR exceeds reviewer model context window';
    case 'cost-cap':
      return 'Reviewer cost cap exceeded — split PR or raise cap';
    default:
      return 'Review bot encountered an infrastructure error';
  }
}

/**
 * Fail-closed handler: route typed provider errors (rate-limit, daily quota,
 * auth, context-too-large) and CostCapExceededError to author-facing
 * messages with actionable guidance. Falls back to the generic
 * "infrastructure error" review for unknown failures.
 *
 * @param {number} prNumber
 * @param {unknown} err
 * @param {{ provider: string, cycle: number, usage: object, latencyMs: number, authorLogin: string, authorType: string, cycleCounterExclusions: object } | null} [ctx]
 */
async function handleLlmFailure(prNumber, err, ctx = null) {
  const sha = process.env.PR_HEAD_SHA ?? '';
  const kind = classifyProviderError(err);

  try {
    setFailureStatusUnlessHumanApproved(
      prNumber,
      sha,
      statusDescriptionForFailure(kind),
    );
  } catch (statusErr) {
    process.stderr.write(
      `[reviewer] Failed to set bot-review failure: ${statusErr instanceof Error ? statusErr.message : String(statusErr)}\n`,
    );
  }

  if (kind) {
    const details = {};
    if (typeof err.retryAfterSeconds === 'number') {
      details.retryAfterSeconds = err.retryAfterSeconds;
    }
    if (typeof err.cumulative === 'number') {
      details.cumulativeUsd = err.cumulative;
    }
    if (typeof err.cap === 'number') {
      details.capUsd = err.cap;
    }
    try {
      await postKnownLlmFailureReview({ prNumber, kind, details });
    } catch (postErr) {
      process.stderr.write(
        `[reviewer] Failed to post known-failure review (kind=${kind}): ${postErr instanceof Error ? postErr.message : String(postErr)}\n`,
      );
    }
  } else {
    try {
      await postInfraErrorReview(prNumber);
    } catch (postErr) {
      process.stderr.write(
        `[reviewer] Failed to post infra error review: ${postErr instanceof Error ? postErr.message : String(postErr)}\n`,
      );
    }
  }

  // Cost-cap abort requires human review (split the PR or raise the cap) —
  // not a transient failure, so review-bot-degraded self-heal retry is wrong.
  // Billing exhaustion is likewise un-retryable, but needs its own label
  // rather than needs-human-review: the PR is fine, the reviewer's funding is
  // not, and the fix is an account-owner top-up (LS-9812). All other failure
  // kinds get review-bot-degraded so the labeled trigger can self-heal on
  // retry.
  const failureLabel =
    kind === 'cost-cap'
      ? NEEDS_HUMAN_REVIEW_LABEL
      : kind === 'billing'
        ? REVIEW_BOT_BILLING_LABEL
        : 'review-bot-degraded';
  // Apply the terminal label first; only clean up the operational labels
  // after it sticks. If `addLabelAsApp` fails the operational labels stay
  // intact so the labeled-event self-heal trigger can still fire on retry.
  try {
    await addLabelAsApp(prNumber, failureLabel);
    cleanupOperationalLabels(prNumber, {
      except: failureLabel,
      preserveReadyLabel: failureLabel === 'review-bot-degraded',
    });
  } catch (labelErr) {
    process.stderr.write(
      `[reviewer] Failed to apply ${failureLabel} label: ${labelErr instanceof Error ? labelErr.message : String(labelErr)}\n`,
    );
  }

  // Emit telemetry for all failure kinds so the bot_review_infra_failures metric is
  // populated and cost-cap aborts (AC5 of LS-3915) continue to be recorded.
  //
  // review_type mirrors the <!-- bot-infra-failure --> marker in the review body:
  //   - transient failures (rate-limit, quota, auth, generic null) → 'infra-failure'
  //   - author-actionable failures (cost-cap, context-too-large) → 'real'
  //     (no marker in review body; these represent real signal for the PR author)
  if (ctx) {
    const isInfra = _isTransientFailureKind(kind);
    const infraCause = isInfra ? _infraFailureCauseForKind(kind) : null;
    const reviewType = isInfra ? 'infra-failure' : 'real';
    const verdict =
      kind === 'cost-cap'
        ? 'cost-cap-exceeded'
        : kind === 'context-too-large'
          ? 'context-too-large'
          : 'infra-failure';
    try {
      await emitTelemetry(
        buildRecord({
          pr: prNumber,
          sha,
          model: process.env.REVIEWER_MODEL ?? 'codex',
          provider: ctx.provider,
          cycle: ctx.cycle,
          verdict,
          reviewType,
          infraFailureCause: infraCause,
          findings: [],
          usage: ctx.usage,
          latencyMs: ctx.latencyMs,
          shadow: process.env.REVIEWER_SHADOW_MODE === 'true',
          authorLogin: ctx.authorLogin,
          authorType: ctx.authorType,
          cycleCounterExclusions: ctx.cycleCounterExclusions,
          costCapExceeded: kind === 'cost-cap',
        }),
      );
    } catch (telErr) {
      process.stderr.write(
        `[reviewer] Failed to emit failure telemetry (kind=${kind ?? 'null'}): ${telErr instanceof Error ? telErr.message : String(telErr)}\n`,
      );
    }
  }
}

/**
 * Returns true for transient, non-author-actionable failure kinds that carry the
 * <!-- bot-infra-failure --> marker and are excluded from the cycle counter.
 * Author-actionable failures (cost-cap, context-too-large) return false.
 *
 * @param {'rate-limit'|'quota'|'billing'|'auth'|'context-too-large'|'cost-cap'|null} kind
 * @returns {boolean}
 */
function _isTransientFailureKind(kind) {
  return (
    kind === 'rate-limit' ||
    kind === 'quota' ||
    kind === 'billing' ||
    kind === 'auth' ||
    kind === null
  );
}

/**
 * Map a transient failure kind to its bot_review_infra_failures metric cause label.
 * Only call this when _isTransientFailureKind(kind) is true.
 *
 * @param {'rate-limit'|'quota'|'billing'|'auth'|null} kind
 * @returns {'rate_limit'|'billing'|'api_error'}
 */
function _infraFailureCauseForKind(kind) {
  if (kind === 'rate-limit') return 'rate_limit';
  // Billing gets its own cause so bot_review_infra_failures separates
  // "provider throttled us" from "we ran out of money" — the two have
  // completely different remediations (LS-9812).
  if (kind === 'billing') return 'billing';
  return 'api_error';
}

main().catch((err) => {
  process.stderr.write(
    `[reviewer] Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  // LS-8299: best-effort leave a terminal bot-review status so review.yml's
  // invariant check can distinguish this crash from a never-resolving
  // pending. Never let this fail silently mask the real exit code below.
  const sha = process.env.PR_HEAD_SHA;
  if (sha) {
    try {
      setCommitStatus(sha, 'failure', 'Review crashed unexpectedly');
    } catch (statusErr) {
      process.stderr.write(
        `[reviewer] Failed to set bot-review failure after crash: ${statusErr instanceof Error ? statusErr.message : String(statusErr)}\n`,
      );
    }
  }
  process.exit(1);
});
