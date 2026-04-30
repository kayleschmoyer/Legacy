import {
  getPullRequestContext,
  postShadowComment,
  addLabel,
  removeLabel,
  setCommitStatus,
  isRepoAdmin,
} from './lib/github.mjs';
import {
  parseFindingsFromText,
  tryReformatFindings,
  gateFindingsBySeverity,
  hasCriticalBlockingFinding,
  formatShadowBody,
} from './lib/findings.mjs';
import { buildSystemPrompt, buildUserPrompt } from './lib/prompts/system.mjs';
import { isTrivialPR, runMultiPass } from './lib/multi-pass.mjs';
import { consolidate } from './lib/consolidator.mjs';
import {
  postRealReview,
  postInfraErrorReview,
  postKnownLlmFailureReview,
  addLabelAsApp,
} from './lib/post-review.mjs';
import { buildRecord, emitTelemetry } from './lib/telemetry.mjs';
import { withRetry } from './lib/retry.mjs';
import {
  getPrReviews,
  getPrCommits,
  getPrReviewComments,
  getPrIssueComments,
  postEscalationComment,
  postReviewThreadReply,
} from './lib/review-thread-api.mjs';
import {
  computeCycle,
  isEscalationRequired,
  isInfraErrorReview,
  REVIEWER_BOT_LOGINS,
} from './lib/cycle-counter.mjs';
import {
  buildCycleRoleSection,
  parseTitlesFromReviewBody,
  filterFindingsCycle2,
  filterFindingsCycle3,
  buildAuthorResponsesSection,
  hasCannotComplyResponse,
  getMalformedInlineReplies,
} from './lib/cycle-protocol.mjs';
import { FORMAT_ERROR_MESSAGE } from './lib/parse-author-response.mjs';

const NEEDS_HUMAN_ARBITRATION_LABEL = 'needs-human-arbitration';
const NEEDS_HUMAN_SECURITY_REVIEW_LABEL = 'needs-human-security-review';
const CYCLE_RESET_LABEL = 'bot:reset-cycle-counter';

async function main() {
  const prNumber = Number(process.env.PR_NUMBER);
  if (!prNumber) {
    process.stderr.write('[reviewer] PR_NUMBER env var is required\n');
    process.exit(1);
  }

  const providerName = process.env.LLM_PROVIDER ?? 'github-models';

  // Fetch PR context — fail open on infra errors
  let ctx;
  try {
    ctx = getPullRequestContext(prNumber);
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to fetch PR context: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(0);
  }

  const sha = process.env.PR_HEAD_SHA ?? '';

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

  // Set bot-review to pending — reviewer is starting
  try {
    setCommitStatus(sha, 'pending', 'Review in progress');
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to set bot-review pending: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  // --- Cycle counter (T22) ---
  // Derive cycle from immutable PR review history for all PRs (not just bot-authored).
  let cycle = 1;
  let priorTitles = [];
  let postReviewCommitShas = [];
  let lastBotReview = null;

  let allReviews;
  try {
    allReviews = getPrReviews(prNumber);
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to fetch PR reviews: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    try {
      setCommitStatus(
        sha,
        'failure',
        'Review failed: could not fetch PR history',
      );
    } catch (_) {}
    process.exit(0);
  }

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

  // --- Admin cycle reset (bot:reset-cycle-counter label) ---
  // CYCLE_RESET_SENDER is set by the workflow when triggered by this label.
  // If a non-admin applies the label the bot posts a rejection notice and removes it.
  let cycleResetByAdmin = false;
  const cycleResetSender = process.env.CYCLE_RESET_SENDER ?? '';
  if (cycleResetSender) {
    try {
      if (isRepoAdmin(cycleResetSender)) {
        const priorBotReviewCount = allReviews.filter((r) =>
          REVIEWER_BOT_LOGINS.has(r.userLogin),
        ).length;
        const now = new Date().toISOString();
        postEscalationComment(
          prNumber,
          `> [!NOTE]\n> Cycle counter reset by \`${cycleResetSender}\` at ${now}. ` +
            `Prior ${priorBotReviewCount} bot review(s) excluded from counter. ` +
            `Bot will treat next review as Cycle 1.`,
        );
        removeLabel(prNumber, CYCLE_RESET_LABEL);
        cycleResetByAdmin = true;
        cycle = 1;
        process.stdout.write(
          `[reviewer] Cycle counter reset by admin '${cycleResetSender}'; prior ${priorBotReviewCount} review(s) excluded\n`,
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

  // Cycle > MAX_CYCLE → escalate instead of reviewing
  if (isEscalationRequired(cycle)) {
    await escalateToHumanArbitration(
      prNumber,
      sha,
      `Cycle ${cycle} exceeds MAX_CYCLE — applying '${NEEDS_HUMAN_ARBITRATION_LABEL}' label and exiting`,
    );
    return;
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
      (r) => r.state !== 'DISMISSED' && !isInfraErrorReview(r),
    ) ?? null;
  const priorBotReviewBody = lastBotReview?.body ?? '';
  priorTitles = parseTitlesFromReviewBody(priorBotReviewBody);

  // Commits added since the last bot review (used by Cycle 2 validator).
  if (cycle === 2 && lastBotReview) {
    try {
      const allCommitShas = getPrCommits(prNumber);
      const reviewedAtIdx = allCommitShas.indexOf(lastBotReview.commitId);
      if (reviewedAtIdx === -1) {
        // C1 review commitId not found — likely a force-push or rebase after C1.
        // Fall back to treating all current commits as post-C1 so new findings
        // that cite any current PR commit are not incorrectly stripped.
        postReviewCommitShas = allCommitShas;
        process.stdout.write(
          '[reviewer] Cycle 2: C1 review commitId not in current commit list (force-push/rebase?) — treating all commits as post-C1\n',
        );
      } else {
        postReviewCommitShas = allCommitShas.slice(reviewedAtIdx + 1);
        process.stdout.write(
          `[reviewer] Cycle 2: ${postReviewCommitShas.length} commit(s) added since C1 review\n`,
        );
      }
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to fetch PR commits for cycle 2 filter: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      // Fail closed: no post-C1 commits known → validator will strip new findings.
    }
  }

  // Fetch author replies (JUSTIFY/FIX comments) for Cycle 2+ so the LLM can
  // evaluate them when adjudicating or verifying findings.
  let authorResponsesSection = '';
  let authorFormatErrors = 0;
  if (cycle >= 2 && lastBotReview) {
    try {
      const reviewComments = getPrReviewComments(prNumber);
      const issueComments = getPrIssueComments(prNumber);
      const authorResponses = buildAuthorResponsesSection(
        reviewComments,
        issueComments,
        lastBotReview.submittedAt,
        REVIEWER_BOT_LOGINS,
      );
      authorResponsesSection = authorResponses.section;
      authorFormatErrors = authorResponses.formatErrors;
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
        reviewComments,
        lastBotReview.submittedAt,
        REVIEWER_BOT_LOGINS,
      );
      for (const rootId of malformedRootIds) {
        try {
          postReviewThreadReply(rootId, FORMAT_ERROR_MESSAGE);
          process.stdout.write(
            `[reviewer] Cycle ${cycle}: posted format-error reply to thread ${rootId}\n`,
          );
        } catch (postErr) {
          process.stderr.write(
            `[reviewer] Failed to post format-error reply to thread ${rootId}: ${postErr instanceof Error ? postErr.message : String(postErr)}\n`,
          );
        }
      }

      // Cycle 3+: CANNOT-COMPLY short-circuit — escalate before calling the LLM.
      // The LLM's VERIFY-mode prompt focuses on code state and silently ignores
      // compliance claims, so escalation must happen here rather than in the prompt.
      if (
        cycle >= 3 &&
        hasCannotComplyResponse(
          reviewComments,
          issueComments,
          lastBotReview.submittedAt,
          REVIEWER_BOT_LOGINS,
          authorLogin,
        )
      ) {
        await escalateToHumanArbitration(
          prNumber,
          sha,
          `Cycle ${cycle}: CANNOT-COMPLY detected — applying '${NEEDS_HUMAN_ARBITRATION_LABEL}' label and exiting`,
        );
        return;
      }
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to fetch author replies for cycle ${cycle}: ${err instanceof Error ? err.message : String(err)}\n`,
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

  // Build prompts — fail open on infra errors (e.g. missing reviewer-rules.md)
  let systemPrompt, userPrompt;
  try {
    const cycleRoleSection = buildCycleRoleSection(cycle, priorTitles);
    systemPrompt = buildSystemPrompt(cycleRoleSection);
    userPrompt = buildUserPrompt(ctx, authorResponsesSection);
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to build prompts: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    try {
      setCommitStatus(sha, 'failure', 'Review failed: prompt build error');
    } catch (_) {}
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
  let reviewText;
  let reviewUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };
  let latencyMs = 0;

  if (trivial) {
    process.stdout.write(
      '[reviewer] Trivial PR — running single-pass review\n',
    );
    try {
      const t0 = Date.now();
      const result = await withRetry(() =>
        provider.review({ system: systemPrompt, user: userPrompt }),
      );
      latencyMs = Date.now() - t0;
      reviewText = result.text;
      reviewUsage = result.usage ?? reviewUsage;
    } catch (err) {
      process.stderr.write(
        `[reviewer] Provider error after all retries: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      await handleLlmFailure(prNumber, err);
      process.exit(1);
    }
  } else {
    process.stdout.write(
      '[reviewer] Non-trivial PR — running multi-pass review (correctness → security → contract)\n',
    );
    try {
      const t0 = Date.now();
      const { passes, usage: multiPassUsage } = await withRetry(() =>
        runMultiPass(provider, systemPrompt, userPrompt),
      );
      latencyMs = Date.now() - t0;
      reviewText = consolidate(passes);
      reviewUsage = multiPassUsage;
    } catch (err) {
      process.stderr.write(
        `[reviewer] Multi-pass error after all retries: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      await handleLlmFailure(prNumber, err);
      process.exit(1);
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
      try {
        await addLabelAsApp(prNumber, 'review-bot-degraded');
      } catch (err) {
        process.stderr.write(
          `[reviewer] Failed to apply review-bot-degraded label: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
    return;
  }

  // Apply cycle-specific post-LLM validator (T22).
  let filteredFindings = parsed.findings;
  let strippedFindings = [];
  if (cycle === 2) {
    const { kept, stripped } = filterFindingsCycle2(
      parsed.findings,
      priorTitles,
      postReviewCommitShas,
    );
    if (stripped.length > 0) {
      process.stdout.write(
        `[reviewer] Cycle 2 validator: stripped ${stripped.length} finding(s) that raised new issues outside author's changes\n`,
      );
    }
    filteredFindings = kept;
    strippedFindings = stripped;
  } else if (cycle === 3) {
    const { kept, stripped } = filterFindingsCycle3(
      parsed.findings,
      priorTitles,
    );
    if (stripped.length > 0) {
      process.stdout.write(
        `[reviewer] Cycle 3 validator: stripped ${stripped.length} finding(s) outside Cycle 2 mandates\n`,
      );
    }
    filteredFindings = kept;
    strippedFindings = stripped;
  }

  const gated = gateFindingsBySeverity(filteredFindings);
  process.stdout.write(
    `[reviewer] Gating: ${gated.blocking.length} blocking, ${gated.nonBlocking.length} non-blocking, ${gated.dropped.length} trivia dropped\n`,
  );
  verdict = gated.blocking.length === 0 ? 'APPROVED' : 'REQUEST_CHANGES';

  // Set bot-review commit status based on verdict
  try {
    setCommitStatus(
      sha,
      verdict === 'APPROVED' ? 'success' : 'failure',
      verdict === 'APPROVED'
        ? 'Review passed'
        : 'Blocking findings require changes',
    );
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
      await postRealReview(prNumber, gated);
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to post real review: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(0);
    }
    for (const label of ['bot:ready-for-review', 'review-bot-degraded']) {
      try {
        removeLabel(prNumber, label);
      } catch (err) {
        process.stderr.write(
          `[reviewer] Failed to remove label '${label}': ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
    if (verdict === 'APPROVED') {
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
  }
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
 */
async function escalateToHumanArbitration(prNumber, sha, logReason) {
  process.stdout.write(`[reviewer] ${logReason}\n`);
  try {
    await addLabelAsApp(prNumber, NEEDS_HUMAN_ARBITRATION_LABEL);
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to apply escalation label: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  try {
    setCommitStatus(sha, 'failure', 'Escalated to human arbitration');
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to set bot-review failure: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
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
 * @returns {'rate-limit'|'quota'|'auth'|'context-too-large'|'cost-cap'|null}
 */
function classifyProviderError(err) {
  if (!err || typeof err !== 'object') return null;
  if (err.name === 'CostCapExceededError') return 'cost-cap';
  const k = err.kind;
  if (
    k === 'rate-limit' ||
    k === 'quota' ||
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
    case 'rate-limit':
      return 'Reviewer rate-limited (per-minute quota); re-apply bot:ready-for-review to retry';
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
 */
async function handleLlmFailure(prNumber, err) {
  const sha = process.env.PR_HEAD_SHA ?? '';
  const kind = classifyProviderError(err);

  try {
    setCommitStatus(sha, 'failure', statusDescriptionForFailure(kind));
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

  // Always apply review-bot-degraded so the labeled trigger can self-heal on
  // retry — covers transient rate-limit waits and longer-tail infra issues
  // alike. Daily-quota and auth failures still get the label so a maintainer
  // can manually retry by re-applying it after the underlying issue is fixed.
  try {
    await addLabelAsApp(prNumber, 'review-bot-degraded');
  } catch (labelErr) {
    process.stderr.write(
      `[reviewer] Failed to apply review-bot-degraded label: ${labelErr instanceof Error ? labelErr.message : String(labelErr)}\n`,
    );
  }
}

main().catch((err) => {
  process.stderr.write(
    `[reviewer] Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(0);
});
