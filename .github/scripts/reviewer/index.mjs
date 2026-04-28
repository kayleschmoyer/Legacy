import {
  getPullRequestContext,
  postShadowComment,
  addLabel,
  removeLabel,
  setCommitStatus,
} from './lib/github.mjs';
import {
  parseFindingsFromText,
  tryReformatFindings,
  gateFindingsBySeverity,
  formatShadowBody,
} from './lib/findings.mjs';
import { buildSystemPrompt, buildUserPrompt } from './lib/prompts/system.mjs';
import { isTrivialPR, runMultiPass } from './lib/multi-pass.mjs';
import { consolidate } from './lib/consolidator.mjs';
import {
  postRealReview,
  postInfraErrorReview,
  addLabelAsApp,
} from './lib/post-review.mjs';
import { buildRecord, emitTelemetry } from './lib/telemetry.mjs';
import { withRetry } from './lib/retry.mjs';
import {
  getPrReviews,
  getPrCommits,
  getPrReviewComments,
  getPrIssueComments,
} from './lib/review-thread-api.mjs';
import {
  computeCycle,
  isEscalationRequired,
  isCodeWriterBotAuthor,
  REVIEWER_BOT_LOGINS,
} from './lib/cycle-counter.mjs';
import {
  buildCycleRoleSection,
  parseTitlesFromReviewBody,
  filterFindingsCycle2,
  filterFindingsCycle3,
  buildAuthorResponsesSection,
} from './lib/cycle-protocol.mjs';

const NEEDS_HUMAN_ARBITRATION_LABEL = 'needs-human-arbitration';

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

  // Skip conditions
  if (ctx.isDraft) {
    process.stdout.write('[reviewer] Skipping: draft PR\n');
    return;
  }
  if (ctx.isCrossRepository) {
    process.stdout.write('[reviewer] Skipping: fork PR\n');
    return;
  }
  // Determine review semantics based on PR author identity.
  // Code Writer Bot PRs → full RAISE/ADJUDICATE/VERIFY cycle protocol (§7).
  // All other PRs (agent-authored under developer identity, or human-authored)
  // → §8a relaxed single-pass review (no cycle counter, no C2/C3 validators,
  //   author replies parsed leniently, each bot:ready-for-review = full re-review).
  const isCodeWriterBotPr = isCodeWriterBotAuthor(ctx.author);
  process.stdout.write(
    `[reviewer] Review mode: ${isCodeWriterBotPr ? 'full cycle protocol (Code Writer Bot)' : 'relaxed single-pass (§8a)'}\n`,
  );

  // Set bot-review to pending — reviewer is starting
  try {
    setCommitStatus(sha, 'pending', 'Review in progress');
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to set bot-review pending: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  // --- Cycle counter (T22) ---
  // Full cycle protocol only: derive cycle from immutable PR review history.
  // §8a relaxed path always uses cycle 1 — no prior-review state to track.
  let cycle = 1;
  let priorTitles = [];
  let postReviewCommitShas = [];

  if (isCodeWriterBotPr) {
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

    // Cycle > MAX_CYCLE → escalate instead of reviewing
    if (isEscalationRequired(cycle)) {
      process.stdout.write(
        `[reviewer] Cycle ${cycle} exceeds MAX_CYCLE — applying '${NEEDS_HUMAN_ARBITRATION_LABEL}' label and exiting\n`,
      );
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
      return;
    }

    // Gather prior review context for C2/C3 post-LLM validators.
    // Sort by submittedAt ascending so .at(-1) reliably picks the most recent
    // bot review regardless of the order GitHub returns reviews in the API.
    const botReviews = allReviews
      .filter((r) => REVIEWER_BOT_LOGINS.has(r.userLogin))
      .slice()
      .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1));
    const lastBotReview = botReviews.at(-1) ?? null;
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
  }

  // Fetch author replies (JUSTIFY/FIX comments) for Cycle 2+ so the LLM can
  // evaluate them when adjudicating or verifying findings.
  let authorResponsesSection = '';
  if (cycle >= 2 && lastBotReview) {
    try {
      const reviewComments = getPrReviewComments(prNumber);
      const issueComments = getPrIssueComments(prNumber);
      authorResponsesSection = buildAuthorResponsesSection(
        reviewComments,
        issueComments,
        lastBotReview.submittedAt,
        REVIEWER_BOT_LOGINS,
      );
      if (authorResponsesSection) {
        process.stdout.write(
          `[reviewer] Cycle ${cycle}: author response(s) found — injecting into user prompt\n`,
        );
      } else {
        process.stdout.write(
          `[reviewer] Cycle ${cycle}: no author responses found\n`,
        );
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
    } else {
      const { CopilotCLIProvider } =
        await import('./lib/providers/copilot-cli.mjs');
      provider = new CopilotCLIProvider();
    }
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to init provider '${providerName}': ${err instanceof Error ? err.message : String(err)}\n`,
    );
    try {
      setCommitStatus(sha, 'failure', 'Review failed: LLM provider error');
    } catch (_) {}
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
      await handleLlmInfraFailure(prNumber);
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
      await handleLlmInfraFailure(prNumber);
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
    }
    return;
  }

  // Apply cycle-specific post-LLM validator (T22).
  // Full cycle protocol only: §8a relaxed path has no cycle state to filter against.
  let filteredFindings = parsed.findings;
  if (isCodeWriterBotPr) {
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
    }
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
      usage: reviewUsage,
      latencyMs,
      shadow: shadowMode,
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
 * Fail-closed handler: post REQUEST_CHANGES infra error review and apply the
 * review-bot-degraded label so the labeled trigger can self-heal on retry.
 *
 * @param {number} prNumber
 */
async function handleLlmInfraFailure(prNumber) {
  const sha = process.env.PR_HEAD_SHA ?? '';
  try {
    setCommitStatus(
      sha,
      'failure',
      'Review bot encountered an infrastructure error',
    );
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to set bot-review failure: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  try {
    await postInfraErrorReview(prNumber);
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to post infra error review: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  try {
    addLabel(prNumber, 'review-bot-degraded');
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to apply review-bot-degraded label: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

main().catch((err) => {
  process.stderr.write(
    `[reviewer] Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(0);
});
