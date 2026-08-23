/**
 * Enhanced Merge Queue processor — extracted from merge-queue.yml to stay
 * under GitHub Actions' 21,000-character inline expression limit.
 *
 * Called from the "Process Enhanced Merge Queue" step via:
 *   await require('./.github/scripts/merge-queue-processor.js')({ github, context, isDryRun, forceCheck, isRetry });
 *
 * Logging: uses console.log / console.error throughout — this script runs in
 * the GitHub Actions runner's Node sandbox via actions/github-script and
 * cannot import workspace packages like `@legacy-sports/logging`. Build-time
 * scripts are an explicit exception to the no-console rule (see AGENTS.md,
 * Code Quality → No console.*).
 */

const fs = require('fs');
const path = require('path');

// Excluded from merge-blocking: process-merge-queue (circular — would block itself) and
// delayed-recheck (a 3-minute housekeeping job that is not a quality gate).
const EXCLUDED_CHECKS = new Set(['process-merge-queue', 'delayed-recheck']);

// Config-tracked required checks (LS-7963). The checked-in .github/ruleset.json
// can carry required-check contexts ahead of live enforcement — promoting them
// into the live GitHub ruleset is an admin action (scripts/apply-ruleset.sh)
// that can lag the config indefinitely. During exactly that window, PR #5110
// merged while its head-SHA `🚀 CI Pipeline / e2e-affected` check was in flight
// (and ultimately failing): the queue evaluates only the LIVE required set, so
// the e2e checks were invisible to it. Reading the config here closes that gap
// for queue-driven merges without admin privileges. Union-only: config can
// TIGHTEN the gate beyond the live ruleset, never loosen it.
//
// GITHUB_WORKSPACE is always set on Actions runners (actions/checkout target);
// it is unset in the unit-test harness unless a test opts in.
function loadConfigRequiredChecks() {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) return [];
  const rulesetPath = path.join(workspace, '.github', 'ruleset.json');
  try {
    const ruleset = JSON.parse(fs.readFileSync(rulesetPath, 'utf8'));
    const contexts = [];
    for (const rule of ruleset.rules ?? []) {
      if (rule.type !== 'required_status_checks' || rule._staged) continue;
      for (const check of rule.parameters?.required_status_checks ?? []) {
        if (check._staged || !check.context) continue;
        contexts.push(check.context);
      }
    }
    return contexts;
  } catch (e) {
    console.log(
      `⚠️ Could not load config-tracked required checks from ${rulesetPath} ` +
        `(${e.message}) — relying on live required checks only`,
    );
    return [];
  }
}

// Lightweight checks that auto-register on every push via pull_request.synchronize
// (check-conflicts.yml, jira-branch-sync.yml). They complete before the CI Pipeline
// starts, so their presence must not satisfy the "CI not yet started" guard when
// branch protection is unavailable (e.g. 403 fallback mode). See LS-4111.
//
// Override via MERGE_QUEUE_LIGHTWEIGHT_CHECK_NAMES (comma-separated) to avoid a code
// change if workflows/jobs are renamed.
const _defaultLightweightCheckNames = [
  '🔐 SHA Sanity Check',
  'No Merge Conflicts',
  'Sync Jira Ticket',
];
const LIGHTWEIGHT_CHECK_NAMES = new Set(
  process.env.MERGE_QUEUE_LIGHTWEIGHT_CHECK_NAMES
    ? process.env.MERGE_QUEUE_LIGHTWEIGHT_CHECK_NAMES.split(',')
        .map((n) => n.trim())
        .filter(Boolean)
    : _defaultLightweightCheckNames,
);

// GitHub Actions parses `##[…]` workflow-command escapes from any line of
// stdout/stderr regardless of code-fence context. PR titles, bodies, and
// upstream API error messages occasionally contain quoted `##[error]` or
// similar sequences (e.g. PRs documenting a CI bug). When those strings flow
// into log lines, Actions creates phantom annotations on the merge-queue run.
// Inserting U+200B between the two `#` keeps the text readable while breaking
// the workflow-command escape.
const sanitizeLog = (s) => String(s).replace(/##\[/g, '#\u200b#[');

// The bot-review commit status is only ever posted by Reviewer (W1), and W1's
// review job SKIPS on pull_request.synchronize when the PR lacks the
// bot:ready-for-review label. A final push without that label therefore leaves
// bot-review permanently unregistered on the head SHA \u2014 a check the queue
// waits on forever. When the queue detects that state it re-applies the label,
// whose `labeled` event fires W1 and registers the status (self-heal).
const REVIEW_TRIGGER_LABEL = 'bot:ready-for-review';
const BOT_REVIEW_STATUS_CONTEXT = 'bot-review';
// Cap remediations per run so a backlog doesn't fire dozens of concurrent LLM
// reviews at once; the next queue trigger (each remediated review's submission
// wakes the queue via pull_request_review) picks up the remainder.
const MAX_REVIEW_REMEDIATIONS_PER_RUN = 10;
// LS-9209: each self-heal re-trigger stamps a bot-review pending status whose
// description carries this marker. The SHA's status history is append-only, so
// counting marker statuses gives a durable per-SHA attempt counter with no
// extra storage. After MAX_SELF_HEAL_ATTEMPTS_PER_SHA dead Reviewer (W1) runs
// the queue stops re-triggering and escalates: terminal bot-review failure +
// needs-human-arbitration (paged by Label Pager W4). Never a silent stall,
// never an unbounded retry.
const SELF_HEAL_MARKER = 'self-heal re-trigger';
const MAX_SELF_HEAL_ATTEMPTS_PER_SHA = 2;
const ARBITRATION_LABEL = 'needs-human-arbitration';

// The CI Gate commit status (and the granular 🚀 CI Pipeline / * check runs)
// are only produced by a pull_request-triggered orchestrator run. If that run
// is cancelled — e.g. displaced from the concurrency queue by a later review
// event while still pending (LS-9053, PR #6711) — no future event recreates
// it, and the required contexts stay "(not yet registered)" on the head SHA
// forever. The queue self-heals by re-running the cancelled run.
const ORCHESTRATOR_WORKFLOW_FILE = 'ci-orchestrator.yml';
// Stop re-running a run that keeps getting cancelled — after this many
// attempts something other than a transient displacement is wrong.
const MAX_ORCHESTRATOR_RUN_ATTEMPTS = 3;
// Per-queue-cycle cap, mirroring MAX_REVIEW_REMEDIATIONS_PER_RUN.
const MAX_CI_RERUNS_PER_RUN = 3;

// LS-9490: a non-completed orchestrator run stuck past this long with zero
// jobs ever created is dead (the API-visible signature of a run blocked on a
// manual "Approve and run workflow" gate), not "on its way" — see
// remediateCancelledCiRun. A legitimate run posts its first job within
// seconds.
const STUCK_RUN_MS = 10 * 60 * 1000;

module.exports = async ({ github, context, isDryRun, forceCheck, isRetry }) => {
  const { owner, repo } = context.repo;
  const isTriggeredByWorkflow = context.eventName === 'workflow_run';

  // Log X-RateLimit-Remaining/Used after every GitHub API call so run logs
  // show budget consumption over time. Only log when the bucket (per-100) drops
  // to avoid flooding: e.g. 4900→4800, 500→400, etc.
  let _lastRateLimitBucket = Infinity;
  github.hook.after('request', (response) => {
    const remaining = response.headers?.['x-ratelimit-remaining'];
    if (remaining === undefined) return;
    const n = parseInt(remaining, 10);
    if (isNaN(n)) return;
    const bucket = Math.floor(n / 100);
    if (bucket < _lastRateLimitBucket) {
      _lastRateLimitBucket = bucket;
      const used = response.headers?.['x-ratelimit-used'] ?? '?';
      const limit = response.headers?.['x-ratelimit-limit'] ?? '?';
      console.log(
        `📊 GitHub rate-limit: ${n}/${limit} remaining (${used} used)`,
      );
    }
  });

  // Cache of required check names per base branch, populated lazily.
  // null means branch protection is absent or has no required checks — fall back to evaluating all.
  const requiredChecksCache = Object.create(null);

  console.log(
    `🔄 Starting merge queue processing (${isDryRun ? 'DRY RUN' : 'LIVE'})...`,
  );
  if (isTriggeredByWorkflow) {
    console.log(
      `⚡ Triggered by CI Orchestrator completion - checking merge-ready PRs`,
    );
  }

  // Get PRs with merge-when-ready label (or all if force_check is true).
  // Normal path: label-filtered single-page fetch — avoids paginating all open PRs
  // on every queue run, which was the top consumer of GitHub App rate-limit budget.
  // forceCheck path: still paginates all open PRs so every PR is evaluated.
  let mergeReadyPRs;
  if (forceCheck) {
    const allPRs = await github.paginate(github.rest.pulls.list, {
      owner,
      repo,
      state: 'open',
      per_page: 100,
    });
    mergeReadyPRs = allPRs;
    console.log(
      `📋 Force-check mode: evaluating all ${mergeReadyPRs.length} open PRs`,
    );
  } else {
    // issues.listForRepo supports label filtering, so we only fetch labeled
    // items instead of all open PRs. Paginate to handle edge cases where
    // more than 100 PRs carry the label. It returns both Issues and PRs;
    // filter to PRs only (PR entries carry a pull_request field with href/merged_at).
    const labeledItems = await github.paginate(github.rest.issues.listForRepo, {
      owner,
      repo,
      labels: 'merge-when-ready',
      state: 'open',
      per_page: 100,
    });
    mergeReadyPRs = labeledItems.filter(
      (item) => item.pull_request !== undefined,
    );
    console.log(
      `📋 Found ${mergeReadyPRs.length} PRs with merge-when-ready label`,
    );
  }

  let hasPendingPRs = false;
  let reviewRemediationsThisRun = 0;
  let ciRerunsThisRun = 0;
  const processedPRNumbers = new Set();

  for (const pr of mergeReadyPRs) {
    processedPRNumbers.add(pr.number);
    console.log(`\n🔍 Processing PR #${pr.number}: ${pr.title}`);

    try {
      // Get fresh PR details
      const prDetails = await github.rest.pulls.get({
        owner,
        repo,
        pull_number: pr.number,
      });

      // validatePRForMerge returns the (possibly refreshed) PR object so that
      // performMerge always uses the same data that was validated, including
      // the head SHA that will be pinned in the merge API call.
      const validationResult = await validatePRForMerge(prDetails.data);

      if (validationResult.canMerge) {
        console.log(`✅ PR #${pr.number} is ready for merge`);

        if (!isDryRun) {
          await performMerge(validationResult.pr);
        } else {
          console.log(`🏃 DRY RUN: Would merge PR #${pr.number}`);
        }
      } else {
        console.log(
          `❌ PR #${pr.number} cannot be merged: ${validationResult.reason}`,
        );
        await reportMergeBlocker(prDetails.data, validationResult);
        await remediateStaleBotReview(prDetails.data, validationResult);
        await remediateCancelledCiRun(prDetails.data, validationResult);
      }
    } catch (error) {
      console.error(
        `💥 Error processing PR #${pr.number}: ${sanitizeLog(error.message)}`,
      );
      await reportProcessingError(pr, error);
    }
  }

  // LS-9209: heal review stalls on PRs the queue never sees (no
  // merge-when-ready label). Under forceCheck every open PR already went
  // through the loop above, so the sweep would be redundant.
  if (!forceCheck) {
    await sweepReviewStalls(processedPRNumbers);
  }

  console.log(`\n🏁 Merge queue processing complete`);

  // Self-dispatch one retry if checks were pending and this wasn't triggered by CI completion.
  // Covers the race where the queue fires (label/review event) before CI registers check runs.
  // One retry only (is_retry flag) to prevent cascading. Skipped for workflow_run triggers
  // (CI just completed) and dry-run mode.
  if (
    hasPendingPRs &&
    !isDryRun &&
    !isRetry &&
    context.eventName !== 'workflow_run'
  ) {
    console.log(
      `⏰ Pending checks detected — scheduling self-retry to re-evaluate after CI settles...`,
    );
    try {
      // Use the App token (octokit default) — GITHUB_TOKEN cannot trigger workflow_dispatch
      // by design (GitHub blocks it to prevent infinite loops). The App needs Actions: write.
      await github.request(
        'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
        {
          owner,
          repo,
          workflow_id: 'merge-queue.yml',
          ref: 'main',
          inputs: {
            is_retry: 'true',
            dry_run: isDryRun ? 'true' : 'false',
            force_check: forceCheck ? 'true' : 'false',
          },
        },
      );
      console.log(`✅ Self-retry dispatched`);
    } catch (retryError) {
      console.warn(`⚠️ Could not dispatch self-retry: ${retryError.message}`);
    }
  }

  // ── Helper Functions ──────────────────────────────────────────────────────

  async function validatePRForMerge(pr) {
    if (pr.draft) {
      return { canMerge: false, reason: 'PR is in draft state' };
    }

    // For non-main targets, require the merge-to-parent label. This label is
    // a deliberate manual escape hatch and is never applied by automation
    // (LS-8489): the normal stacked-PR path is base-first — the child waits
    // for its parent to merge, retargetDependentPRs (below) re-targets it to
    // main, and it then flows through the standard main-base queue path.
    // Hand-apply merge-to-parent only to collapse a child into its parent
    // branch ahead of the parent landing.
    if (pr.base.ref !== 'main') {
      const hasMergeToParent = pr.labels.some(
        (l) => l.name === 'merge-to-parent',
      );
      if (!hasMergeToParent) {
        return {
          canMerge: false,
          reason: `PR targets \`${pr.base.ref}\` (non-main). Add the \`merge-to-parent\` label in addition to \`merge-when-ready\` to allow merging into a non-main branch.`,
        };
      }
    }

    // Check mergeable state — poll if GitHub hasn't computed it yet
    // (this commonly happens for all PRs immediately after a merge in the same run)
    if (pr.mergeable === null) {
      console.log(
        `⏳ PR #${pr.number}: mergeable=null, polling for up to 60s...`,
      );
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const refreshed = await github.rest.pulls.get({
          owner,
          repo,
          pull_number: pr.number,
        });
        pr = refreshed.data;
        if (pr.mergeable !== null) {
          console.log(
            `✅ PR #${pr.number}: mergeable resolved to ${pr.mergeable} after ${(i + 1) * 5}s`,
          );
          break;
        }
        console.log(`⏳ PR #${pr.number}: still null after ${(i + 1) * 5}s...`);
      }
    }

    if (pr.mergeable === false) {
      return {
        canMerge: false,
        reason: 'PR has merge conflicts that must be resolved',
      };
    }

    if (pr.mergeable === null) {
      return {
        canMerge: false,
        pr,
        reason:
          'GitHub is still calculating mergeable state after 60s, will retry next cycle',
      };
    }

    // LS-4183: behind-base PRs are intentionally allowed to merge directly.
    // strict_required_status_checks_policy is now false in .github/ruleset.json, so
    // GitHub no longer rejects the merge API when a branch is behind base. The queue
    // therefore does NOT call pulls.updateBranch() — that call previously created
    // Merge-main commits on every queued PR and serialized merges (~1 PR per CI cycle).
    // Textual conflicts are still blocked above by the mergeable===false guard;
    // semantic conflicts (rare) are caught by post-merge CI on main.

    // If the bot has an active (non-dismissed) APPROVED review, it has already
    // adjudicated all threads — including JUSTIFY threads accepted in Cycle 2.
    // The branch ruleset's dismiss_stale_reviews_on_push ensures the bot APPROVE
    // is dismissed on every new push, so a non-dismissed APPROVED review is always
    // current. Skip the thread check to avoid false positives where Cycle-1 threads
    // remain physically unresolved after a Cycle-2 LGTM.
    const hasBotApproval = await checkBotApproval(pr.number);
    if (!hasBotApproval) {
      const unresolvedResult = await checkUnresolvedReviewThreads(pr.number);
      if (unresolvedResult.hasUnresolved) {
        return {
          canMerge: false,
          reason: `PR has ${unresolvedResult.count} unresolved review comment thread(s)`,
          unresolvedThreads: unresolvedResult.threads,
        };
      }
    }

    // Block merges that are not fully approved — reviewDecision values:
    //   APPROVED           → all required reviews given, allow merge
    //   REVIEW_REQUIRED    → CODEOWNER approval pending, block
    //   CHANGES_REQUESTED  → reviewer requested changes, block
    //   null               → no review requirements on this PR, allow merge
    const reviewDecision = await getPRReviewDecision(pr.number);
    if (reviewDecision !== null && reviewDecision !== 'APPROVED') {
      return {
        canMerge: false,
        reviewDecision,
        reason:
          reviewDecision === 'REVIEW_REQUIRED'
            ? 'PR requires CODEOWNER approval for sensitive path(s)'
            : `PR cannot be merged: reviewDecision is ${reviewDecision}`,
      };
    }

    // Check status checks
    const checksResult = await validateStatusChecks(pr.head.sha, pr.base.ref);
    if (!checksResult.allPassing) {
      return {
        canMerge: false,
        reason:
          'Status checks failing: ' + checksResult.failingChecks.join(', '),
        failingChecks: checksResult.failingChecks,
      };
    }

    if (checksResult.inProgress) {
      return {
        canMerge: false,
        reason:
          'Waiting for status checks to complete: ' +
          checksResult.pendingChecks.join(', '),
        isPending: true,
        pendingChecks: checksResult.pendingChecks,
      };
    }

    return { canMerge: true, pr };
  }

  async function getPRReviewDecision(prNumber) {
    const query = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewDecision
          }
        }
      }
    `;
    const result = await github.graphql(query, {
      owner,
      repo,
      number: prNumber,
    });
    return result.repository.pullRequest.reviewDecision;
  }

  async function checkUnresolvedReviewThreads(prNumber) {
    const query = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) {
              nodes {
                isResolved
                isOutdated
                comments(first: 1) {
                  nodes {
                    author {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await github.graphql(query, {
      owner,
      repo,
      number: prNumber,
    });

    const allThreads = result.repository.pullRequest.reviewThreads.nodes;
    // Outdated threads (on stale diffs) don't block merge
    const unresolvedThreads = allThreads.filter(
      (t) => !t.isResolved && !t.isOutdated,
    );

    return {
      hasUnresolved: unresolvedThreads.length > 0,
      count: unresolvedThreads.length,
      threads: unresolvedThreads.map(
        (t) => t.comments.nodes[0]?.author?.login ?? 'unknown',
      ),
    };
  }

  async function checkBotApproval(prNumber) {
    const reviews = await github.paginate(github.rest.pulls.listReviews, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });
    return reviews.some(
      (r) =>
        r.user.login === 'legacy-sports-review-bot[bot]' &&
        r.state === 'APPROVED',
    );
  }

  async function getRequiredChecks(branch) {
    if (branch in requiredChecksCache) return requiredChecksCache[branch];

    const names = new Set();

    // Classic branch protection required checks
    try {
      const bp = await github.rest.repos.getBranchProtection({
        owner,
        repo,
        branch,
      });
      const rsc = bp.data.required_status_checks;
      if (rsc) {
        for (const ctx of rsc.contexts || []) names.add(ctx);
        for (const c of rsc.checks || []) names.add(c.context);
      }
    } catch (e) {
      const status = e && typeof e === 'object' ? e.status : undefined;
      if (status === 404) {
        console.log(
          `ℹ️ No classic branch protection found for '${branch}' (404)`,
        );
      } else if (status === 403) {
        console.log(
          `⚠️ Classic branch protection read returned 403 for '${branch}' — Merge Queue App lacks ` +
            `the "Administration: Read-only" repository permission. ` +
            `Fix: grant the Merge Queue GitHub App the "Administration: Read-only" repository permission (LS-4111).`,
        );
      } else {
        console.log(
          `⚠️ Failed to fetch classic branch protection for '${branch}' (${status ?? e?.message ?? 'unknown error'})`,
        );
      }
    }

    // Repository ruleset required checks — the primary source for CI Pipeline checks.
    // Classic branch protection does not surface ruleset-defined required_status_checks.
    try {
      const { data: branchRules } = await github.request(
        'GET /repos/{owner}/{repo}/rules/branches/{branch}',
        { owner, repo, branch },
      );
      for (const rule of branchRules) {
        if (
          rule.type === 'required_status_checks' &&
          rule.parameters?.required_status_checks
        ) {
          for (const check of rule.parameters.required_status_checks) {
            names.add(check.context);
          }
        }
      }
      console.log(
        `📋 Branch rules for '${branch}': ${branchRules.length} rule(s), ` +
          `${names.size} required check name(s) total`,
      );
    } catch (e) {
      const status = e && typeof e === 'object' ? e.status : undefined;
      console.log(
        `⚠️ Failed to fetch branch rules for '${branch}' (${status ?? e?.message ?? 'unknown error'}) — ` +
          `ruleset checks excluded; relying on classic branch protection checks only`,
      );
    }

    // Union in the config-tracked required checks (LS-7963). Only for 'main':
    // the checked-in ruleset targets ~DEFAULT_BRANCH, so applying its contexts
    // to non-main bases (stacked merge-to-parent PRs) would demand checks that
    // never register there.
    if (branch === 'main') {
      const liveCount = names.size;
      for (const ctx of loadConfigRequiredChecks()) names.add(ctx);
      const added = names.size - liveCount;
      if (added > 0) {
        console.log(
          `📋 Config-tracked required checks: +${added} from .github/ruleset.json ` +
            `not yet in the live ruleset (LS-7963) — ${names.size} total`,
        );
      }
    }

    const result = names.size > 0 ? names : null;
    if (result === null) {
      console.log(
        `ℹ️ No required checks found for '${branch}' — evaluating all checks`,
      );
    }
    requiredChecksCache[branch] = result;
    return result;
  }

  async function validateStatusChecks(sha, baseBranch) {
    // Only evaluate checks that branch protection actually requires.
    // This prevents manually dispatched or nightly workflows that post check runs
    // to the same SHA from blocking the merge queue when the PR's own CI passed.
    // Falls back to evaluating all checks when branch protection is absent or
    // has no required checks configured.
    const requiredCheckNames = await getRequiredChecks(baseBranch);

    // Paginate both endpoints — popular PRs accumulate >100 check runs (CI
    // reruns, security scans, etc.) and >100 commit statuses. Without
    // pagination, required checks living on later pages (e.g. "No Merge
    // Conflicts", which posts early and gets pushed off page 1 by later runs)
    // appear absent and are spuriously flagged as "(not yet registered)",
    // blocking the merge queue. See LS-4672.
    const [checkRuns, commitStatuses] = await Promise.all([
      github.paginate(github.rest.checks.listForRef, {
        owner,
        repo,
        ref: sha,
        per_page: 100,
      }),
      github.paginate(github.rest.repos.listCommitStatusesForRef, {
        owner,
        repo,
        ref: sha,
        per_page: 100,
      }),
    ]);
    // Preserve the downstream call sites that read .data.check_runs / .data.
    const checks = { data: { check_runs: checkRuns } };
    const statuses = { data: commitStatuses };

    const failingChecks = [];
    const pendingChecks = [];

    // Build the set of check runs to evaluate:
    // - always skip EXCLUDED_CHECKS
    // - when branch protection specifies required checks, skip anything not in that set
    // - deduplicate by name, keeping the most recent completed run (prevents stale
    //   cancelled runs from blocking when a subsequent run succeeds)
    const filteredChecks = checks.data.check_runs.filter((c) => {
      if (EXCLUDED_CHECKS.has(c.name)) return false;
      if (requiredCheckNames !== null && !requiredCheckNames.has(c.name))
        return false;
      return true;
    });
    const latestByName = new Map();
    for (const c of filteredChecks) {
      const existing = latestByName.get(c.name);
      if (
        !existing ||
        new Date(c.completed_at || c.started_at) >
          new Date(existing.completed_at || existing.started_at)
      ) {
        latestByName.set(c.name, c);
      }
    }
    const relevantChecks = Array.from(latestByName.values());

    if (requiredCheckNames !== null) {
      // Detect required checks that haven't posted a run yet (CI not started).
      const postedNames = new Set([
        ...relevantChecks.map((c) => c.name),
        ...statuses.data.map((s) => s.context),
      ]);
      for (const reqName of requiredCheckNames) {
        if (!postedNames.has(reqName)) {
          pendingChecks.push(`${reqName} (not yet registered)`);
        }
      }
    } else {
      // No branch protection — guard against CI not having started at all.
      // Lightweight checks auto-register before the CI Pipeline starts; exclude
      // them so their presence does not suppress this guard (LS-4111).
      const hasNonLightweightCheck = relevantChecks.some(
        (c) => !LIGHTWEIGHT_CHECK_NAMES.has(c.name),
      );
      if (!hasNonLightweightCheck) {
        pendingChecks.push('CI checks not yet registered for this SHA');
      }
    }

    for (const check of relevantChecks) {
      if (check.status === 'completed' && check.conclusion !== 'success') {
        if (
          check.conclusion === 'failure' ||
          check.conclusion === 'cancelled' ||
          check.conclusion === 'timed_out'
        ) {
          failingChecks.push(check.name + ' (' + check.conclusion + ')');
        }
        // skipped / action_required / neutral are not failures
      } else if (check.status !== 'completed') {
        pendingChecks.push(check.name + ' (' + check.status + ')');
      }
    }

    // Deduplicate commit statuses — keep only the latest per context
    const statusesByContext = {};
    for (const status of statuses.data) {
      if (
        !statusesByContext[status.context] ||
        new Date(status.created_at) >
          new Date(statusesByContext[status.context].created_at)
      ) {
        statusesByContext[status.context] = status;
      }
    }

    for (const [ctx, status] of Object.entries(statusesByContext)) {
      if (requiredCheckNames !== null && !requiredCheckNames.has(ctx)) continue;
      if (status.state === 'failure' || status.state === 'error') {
        failingChecks.push(ctx + ' (' + status.state + ')');
      } else if (status.state === 'pending') {
        pendingChecks.push(ctx + ' (pending)');
      }
    }

    return {
      allPassing: failingChecks.length === 0,
      failingChecks,
      inProgress: pendingChecks.length > 0,
      pendingChecks,
    };
  }

  // Self-heal the "bot-review never registers" deadlock (see
  // REVIEW_TRIGGER_LABEL above). Fires in two blocked states:
  //   1. bot-review is a required check but has no run/status on the head SHA
  //      ("not yet registered") — W1 skipped the last push, or the W1 run died
  //      (cancelled / runner-label failure / queued forever) before its review
  //      job could post a status (LS-9209).
  //   2. reviewDecision is CHANGES_REQUESTED but the head SHA carries no
  //      bot-review status — the agent pushed fixes, W1 never re-reviewed, so
  //      the stale REQUEST_CHANGES can never be superseded.
  // The head SHA's status history is authoritative: a terminal status or a
  // fresh pending means the reviewer adjudicated (or is adjudicating) the
  // current code and nothing is healed. Remedy: apply the trigger label, or
  // CYCLE it (remove + re-add) when already present — a bare re-add fires no
  // labeled event (LS-9209; this branch previously no-op'd with "needs manual
  // attention", which left non-queued PRs stalled indefinitely). Each remedy
  // stamps a SELF_HEAL_MARKER pending status; after
  // MAX_SELF_HEAL_ATTEMPTS_PER_SHA markers the queue escalates to a terminal
  // bot-review failure + needs-human-arbitration instead of retrying forever.
  // `validation` is present on the queued path (cheap pre-filter from
  // validatePRForMerge) and null on the review-stall sweep path, which passes
  // every open PR carrying the trigger label straight to the status check.
  async function remediateStaleBotReview(pr, validation = null) {
    if (validation) {
      const waitingOnBotReview = (validation.pendingChecks ?? []).some((c) =>
        c.startsWith(`${BOT_REVIEW_STATUS_CONTEXT} `),
      );
      const staleChangesRequested =
        validation.reviewDecision === 'CHANGES_REQUESTED';
      if (!waitingOnBotReview && !staleChangesRequested) return;
    }

    // A human explicitly owns this PR — automation must not re-trigger.
    if (pr.labels.some((l) => l.name === ARBITRATION_LABEL)) return;

    const headStatuses = await github.paginate(
      github.rest.repos.listCommitStatusesForRef,
      { owner, repo, ref: pr.head.sha, per_page: 100 },
    );
    let latestBotReview = null;
    for (const s of headStatuses) {
      if (s.context !== BOT_REVIEW_STATUS_CONTEXT) continue;
      if (
        !latestBotReview ||
        new Date(s.created_at) > new Date(latestBotReview.created_at)
      ) {
        latestBotReview = s;
      }
    }
    if (latestBotReview) {
      // success/failure → the reviewer adjudicated this SHA; nothing to heal.
      // pending → the reviewer (or the LS-9209 early footprint in W1's
      // check-runner-access job) set "in progress" and W1 may still be
      // running; W1's job timeout is 15 minutes, so a pending older than
      // STALE_PENDING_MS means the run died and the status will never
      // resolve — fall through and re-trigger.
      const STALE_PENDING_MS = 45 * 60 * 1000;
      const isStalePending =
        latestBotReview.state === 'pending' &&
        Date.now() - new Date(latestBotReview.created_at).getTime() >
          STALE_PENDING_MS;
      if (!isStalePending) return;
      console.log(
        `⚠️ PR #${pr.number}: ${BOT_REVIEW_STATUS_CONTEXT} stuck in 'pending' since ` +
          `${latestBotReview.created_at} — treating as a dead reviewer run`,
      );
    }

    if (reviewRemediationsThisRun >= MAX_REVIEW_REMEDIATIONS_PER_RUN) {
      console.log(
        `⏭️ PR #${pr.number}: ${BOT_REVIEW_STATUS_CONTEXT} missing on head SHA but the ` +
          `per-run remediation cap (${MAX_REVIEW_REMEDIATIONS_PER_RUN}) is reached — next cycle.`,
      );
      return;
    }

    // Durable attempt counter: SELF_HEAL_MARKER statuses already stamped on
    // this SHA (see the constant's comment). At the cap, escalate instead of
    // re-triggering — repeated W1 deaths on one SHA mean something systemic
    // (runner starvation, recurring cancellation) that another cycle will not
    // fix.
    const priorAttempts = headStatuses.filter(
      (s) =>
        s.context === BOT_REVIEW_STATUS_CONTEXT &&
        s.description?.includes(SELF_HEAL_MARKER),
    ).length;
    if (priorAttempts >= MAX_SELF_HEAL_ATTEMPTS_PER_SHA) {
      if (isDryRun) {
        console.log(
          `🏃 DRY RUN: Would escalate PR #${pr.number} to ${ARBITRATION_LABEL} — ` +
            `${priorAttempts} self-heal attempts already failed on ${pr.head.sha}`,
        );
        return;
      }
      reviewRemediationsThisRun++;
      console.log(
        `🚨 PR #${pr.number}: ${priorAttempts} self-heal re-triggers already died on ` +
          `${pr.head.sha} — posting terminal ${BOT_REVIEW_STATUS_CONTEXT} failure and ` +
          `applying ${ARBITRATION_LABEL} (LS-9209)`,
      );
      try {
        await github.rest.repos.createCommitStatus({
          owner,
          repo,
          sha: pr.head.sha,
          state: 'failure',
          context: BOT_REVIEW_STATUS_CONTEXT,
          description: `Reviewer (W1) died ${priorAttempts + 1}x on this SHA — needs human attention (LS-9209)`,
        });
      } catch (statusError) {
        console.warn(
          `⚠️ PR #${pr.number}: could not post escalation status: ${statusError.message} — ` +
            `if this is a 403, grant the Merge Queue GitHub App "Commit statuses: Read and write".`,
        );
      }
      try {
        await github.rest.issues.addLabels({
          owner,
          repo,
          issue_number: pr.number,
          labels: [ARBITRATION_LABEL],
        });
      } catch (labelError) {
        console.warn(
          `⚠️ PR #${pr.number}: could not apply '${ARBITRATION_LABEL}': ${labelError.message}`,
        );
      }
      return;
    }

    const labelPresent = pr.labels.some((l) => l.name === REVIEW_TRIGGER_LABEL);

    if (isDryRun) {
      console.log(
        `🏃 DRY RUN: Would ${labelPresent ? 'cycle' : 'apply'} '${REVIEW_TRIGGER_LABEL}' ` +
          `on PR #${pr.number} to re-trigger Reviewer (W1) — ` +
          `${BOT_REVIEW_STATUS_CONTEXT} missing or stale on head SHA`,
      );
      return;
    }

    reviewRemediationsThisRun++;
    console.log(
      `🩹 PR #${pr.number}: ${BOT_REVIEW_STATUS_CONTEXT} missing or stale on head SHA ` +
        `${pr.head.sha} — ${labelPresent ? 'cycling' : 'applying'} '${REVIEW_TRIGGER_LABEL}' ` +
        `to re-trigger Reviewer (W1) ` +
        `(${reviewRemediationsThisRun}/${MAX_REVIEW_REMEDIATIONS_PER_RUN} this run, ` +
        `self-heal attempt ${priorAttempts + 1}/${MAX_SELF_HEAL_ATTEMPTS_PER_SHA} for this SHA)`,
    );
    if (labelPresent) {
      try {
        await github.rest.issues.removeLabel({
          owner,
          repo,
          issue_number: pr.number,
          name: REVIEW_TRIGGER_LABEL,
        });
      } catch (removeError) {
        console.warn(
          `⚠️ PR #${pr.number}: could not remove '${REVIEW_TRIGGER_LABEL}' before ` +
            `re-adding: ${removeError.message}`,
        );
      }
    }
    try {
      await github.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: [REVIEW_TRIGGER_LABEL],
      });
    } catch (labelError) {
      console.warn(
        `⚠️ PR #${pr.number}: could not apply '${REVIEW_TRIGGER_LABEL}': ${labelError.message}`,
      );
      return;
    }
    // Stamp the attempt AFTER the label ops succeed so a failed cycle does not
    // burn an attempt. Also serves as the visible in-progress footprint until
    // the re-triggered W1 run overwrites it.
    try {
      await github.rest.repos.createCommitStatus({
        owner,
        repo,
        sha: pr.head.sha,
        state: 'pending',
        context: BOT_REVIEW_STATUS_CONTEXT,
        description: `${SELF_HEAL_MARKER} #${priorAttempts + 1}: re-firing Reviewer (W1) (LS-9209)`,
      });
    } catch (statusError) {
      console.warn(
        `⚠️ PR #${pr.number}: could not stamp self-heal attempt status: ${statusError.message} — ` +
          `if this is a 403, grant the Merge Queue GitHub App "Commit statuses: Read and write".`,
      );
    }
  }

  // LS-9209: PRs OUTSIDE the merge queue stall identically when their W1 run
  // dies — and the queued-path remediation above never sees them (it only
  // iterates merge-when-ready PRs). Sweep every open non-draft PR carrying
  // the trigger label through the same remediation. One paginated pulls.list
  // call (~1 request for <100 open PRs) plus one status read per labeled PR —
  // far below the per-PR full validation that motivated the LS-8289
  // label-filtered listing. Skipped under forceCheck, which already routes
  // every open PR through the queued path.
  async function sweepReviewStalls(processedPRNumbers) {
    let openPRs;
    try {
      openPRs = await github.paginate(github.rest.pulls.list, {
        owner,
        repo,
        state: 'open',
        per_page: 100,
      });
    } catch (listError) {
      console.warn(
        `⚠️ Review-stall sweep: could not list open PRs: ${listError.message}`,
      );
      return;
    }
    const candidates = openPRs.filter(
      (pr) =>
        !pr.draft &&
        !processedPRNumbers.has(pr.number) &&
        pr.labels.some((l) => l.name === REVIEW_TRIGGER_LABEL),
    );
    if (candidates.length === 0) return;
    console.log(
      `\n🧹 Review-stall sweep: checking ${candidates.length} non-queued PR(s) ` +
        `carrying '${REVIEW_TRIGGER_LABEL}'`,
    );
    for (const pr of candidates) {
      try {
        await remediateStaleBotReview(pr);
      } catch (sweepError) {
        console.warn(
          `⚠️ Review-stall sweep: error on PR #${pr.number}: ${sweepError.message}`,
        );
      }
    }
  }

  // Self-heal the "CI never ran for the head SHA" deadlock (LS-9053). GitHub
  // keeps at most one PENDING run per concurrency group: while a previous
  // SHA's orchestrator run is in progress, a review event arriving after a
  // push displaces (cancels) the queued pull_request run — the only run that
  // posts the CI Gate status and the granular pipeline check runs for the new
  // SHA. Nothing ever recreates it, so the required contexts stay
  // "(not yet registered)" forever. Detect that state and re-run the
  // cancelled pull_request-event orchestrator run.
  // Guards: only fires when NO orchestrator run for the head SHA is queued or
  // in progress (CI that is merely slow heals itself), only re-runs
  // pull_request-event runs (workflow_dispatch runs lack the pull_request
  // context and never post CI Gate), and gives up after
  // MAX_ORCHESTRATOR_RUN_ATTEMPTS so a repeatedly-cancelled run cannot loop.
  //
  // LS-9490: a non-completed run is not always "on its way" — a
  // pull_request_review-triggered run can sit non-completed with zero jobs
  // ever created (the API-visible signature of a run stuck on a manual
  // "Approve and run workflow" gate) and never progress. Treating that as
  // "CI is coming" makes this self-heal bail forever, since the very run it
  // should be recovering from (the cancelled pull_request run) never gets
  // re-run while the stuck run occupies the slot. A legitimate run posts its
  // first job within seconds; a non-completed run past STUCK_RUN_MS with no
  // jobs is dead, not in flight — cancel it (freeing the shared concurrency
  // group, see ci-orchestrator.yml's `concurrency:` block) so the rerun below
  // isn't queued behind it.
  async function isDeadZeroJobRun(run) {
    if (Date.now() - new Date(run.created_at).getTime() < STUCK_RUN_MS) {
      return false;
    }
    try {
      const { data } = await github.rest.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: run.id,
        per_page: 1,
      });
      return (data.jobs ?? []).length === 0;
    } catch (e) {
      console.warn(
        `⚠️ could not list jobs for orchestrator run ${run.id}: ${e.message} — assuming it is still active`,
      );
      return false;
    }
  }

  async function remediateCancelledCiRun(pr, validation) {
    const unregistered = (validation.pendingChecks ?? []).filter(
      (c) =>
        c.endsWith('(not yet registered)') &&
        !c.startsWith(`${BOT_REVIEW_STATUS_CONTEXT} `),
    );
    if (unregistered.length === 0) return;

    let runs;
    try {
      const res = await github.rest.actions.listWorkflowRuns({
        owner,
        repo,
        workflow_id: ORCHESTRATOR_WORKFLOW_FILE,
        head_sha: pr.head.sha,
        per_page: 100,
      });
      runs = res.data.workflow_runs ?? [];
    } catch (e) {
      console.warn(
        `⚠️ PR #${pr.number}: could not list orchestrator runs for ${pr.head.sha}: ${e.message}`,
      );
      return;
    }

    const activeRuns = runs.filter((r) => r.status !== 'completed');
    if (activeRuns.length > 0) {
      const deadRuns = [];
      for (const r of activeRuns) {
        if (await isDeadZeroJobRun(r)) deadRuns.push(r);
      }
      if (deadRuns.length < activeRuns.length) {
        // At least one active run is not stuck — real CI is on its way.
        return;
      }
      for (const r of deadRuns) {
        if (isDryRun) {
          console.log(
            `🏃 DRY RUN: Would cancel dead zero-job orchestrator run ${r.id} for PR #${pr.number} (LS-9490)`,
          );
          continue;
        }
        try {
          await github.rest.actions.cancelWorkflowRun({
            owner,
            repo,
            run_id: r.id,
          });
          console.log(
            `🛑 PR #${pr.number}: cancelled orchestrator run ${r.id} — non-completed with zero jobs for over ${STUCK_RUN_MS / 60000}m (LS-9490)`,
          );
        } catch (e) {
          console.warn(
            `⚠️ PR #${pr.number}: could not cancel dead orchestrator run ${r.id}: ${e.message}`,
          );
        }
      }
    }

    const candidate = runs
      .filter((r) => r.event === 'pull_request' && r.conclusion === 'cancelled')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (!candidate) {
      console.log(
        `⚠️ PR #${pr.number}: required checks not registered on ${pr.head.sha} but no ` +
          `cancelled pull_request orchestrator run found to re-run (${unregistered.join(', ')})`,
      );
      return;
    }

    if ((candidate.run_attempt ?? 1) >= MAX_ORCHESTRATOR_RUN_ATTEMPTS) {
      console.log(
        `⚠️ PR #${pr.number}: orchestrator run ${candidate.id} already at attempt ` +
          `${candidate.run_attempt} — not re-running again. Needs manual attention.`,
      );
      return;
    }

    if (ciRerunsThisRun >= MAX_CI_RERUNS_PER_RUN) {
      console.log(
        `⏭️ PR #${pr.number}: cancelled orchestrator run detected but the per-run ` +
          `rerun cap (${MAX_CI_RERUNS_PER_RUN}) is reached — next cycle.`,
      );
      return;
    }

    if (isDryRun) {
      console.log(
        `🏃 DRY RUN: Would re-run cancelled orchestrator run ${candidate.id} for ` +
          `PR #${pr.number} (${unregistered.join(', ')})`,
      );
      return;
    }

    ciRerunsThisRun++;
    console.log(
      `🩹 PR #${pr.number}: pull_request orchestrator run ${candidate.id} for ` +
        `${pr.head.sha} was cancelled and ${unregistered.join(', ')} never registered — ` +
        `re-running it (${ciRerunsThisRun}/${MAX_CI_RERUNS_PER_RUN} this cycle)`,
    );
    try {
      await github.rest.actions.reRunWorkflow({
        owner,
        repo,
        run_id: candidate.id,
      });
    } catch (rerunError) {
      console.warn(
        `⚠️ PR #${pr.number}: could not re-run orchestrator run ${candidate.id}: ${rerunError.message}`,
      );
    }
  }

  async function findOrCreateComment(pr, commentBody) {
    const commentMarker = '<!-- MERGE-QUEUE-STATUS -->';

    if (!commentBody.includes(commentMarker)) {
      commentBody = commentMarker + '\n' + commentBody;
    }

    const comments = await github.rest.issues.listComments({
      owner,
      repo,
      issue_number: pr.number,
    });
    const existingComment = comments.data.find(
      (c) => c.body && c.body.includes(commentMarker),
    );

    if (existingComment) {
      // Carry the Discord-ping dedup marker forward across status rewrites
      // (e.g. codeowner-blocked → waiting-on-checks → codeowner-blocked), so an
      // intermediate state doesn't re-arm the ping for the same head SHA.
      const pingMarker = existingComment.body.match(
        /<!-- CODEOWNER-PING:[^>]* -->/,
      );
      if (pingMarker && !commentBody.includes('<!-- CODEOWNER-PING:')) {
        commentBody += '\n' + pingMarker[0];
      }
      console.log(
        `🔄 Updating existing merge queue comment #${existingComment.id}`,
      );
      await github.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body: commentBody,
      });
      return { id: existingComment.id, previousBody: existingComment.body };
    } else {
      console.log(`✨ Creating new merge queue comment`);
      const newComment = await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body: commentBody,
      });
      return { id: newComment.data.id, previousBody: null };
    }
  }

  async function performMerge(pr) {
    try {
      console.log(`🚀 Merging PR #${pr.number}...`);

      // TOCTOU guard: re-fetch the PR immediately before the merge API call.
      // A push during the debounce or validation window can advance the HEAD SHA
      // without invalidating the statuses we already checked (they live on the old
      // SHA). If the SHA changed, the validated bot-review no longer covers the
      // current code — abort and let the next trigger re-validate.
      const freshPR = await github.rest.pulls.get({
        owner,
        repo,
        pull_number: pr.number,
      });
      const currentSha = freshPR.data.head.sha;
      if (currentSha !== pr.head.sha) {
        console.log(
          `⚠️ PR #${pr.number}: head SHA changed since validation ` +
            `(${pr.head.sha} → ${currentSha}). ` +
            `Skipping merge — will re-evaluate on next trigger.`,
        );
        return;
      }

      // Sanitize commit message: remove null bytes and control characters that cause HTTP 500.
      const sanitize = (s) =>
        (s || '')
          .replace(/\x00/g, '')
          .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '');

      const mergeResult = await github.rest.pulls.merge({
        owner,
        repo,
        pull_number: pr.number,
        merge_method: 'squash',
        commit_title: sanitize(pr.title + ' (#' + pr.number + ')'),
        commit_message: sanitize(
          'Merged via automated merge queue\n\n' + (pr.body || ''),
        ),
        // Pin to the validated SHA — prevents merging an unvalidated commit if the branch advanced.
        sha: pr.head.sha,
      });

      console.log(`✅ Successfully merged PR #${pr.number}`);

      await retargetDependentPRs(pr);
      await deleteBranch(pr);

      const successComment =
        '## 🎉 Successfully Merged!\n\n' +
        'This PR has been automatically merged via the merge queue.\n\n' +
        '**Merge Details:**\n' +
        '- Method: Squash merge\n' +
        '- Commit SHA: `' +
        mergeResult.data.sha +
        '`\n' +
        '- Merged at: ' +
        new Date().toISOString() +
        '\n\n' +
        'Thank you for your contribution! 🚀\n\n' +
        '---\n*Automated message from merge queue system*';

      await findOrCreateComment(pr, successComment);
    } catch (error) {
      // 422 with a head-SHA mismatch message means the branch advanced between
      // our pre-merge check and the merge API call (residual race window). This
      // is not a system error; treat it as a re-queue signal so the next trigger
      // re-validates the current HEAD. Other 422 causes (invalid params, etc.)
      // are real errors and should propagate.
      if (
        error.status === 422 &&
        (error.response?.data?.message ?? '').includes(
          'Head branch was modified',
        )
      ) {
        console.log(
          `⚠️ PR #${pr.number}: merge rejected with 422 (head branch modified) — ` +
            `branch advanced during merge window. Will re-evaluate on next trigger.`,
        );
        return;
      }

      // Surface GitHub's actual 405 body verbatim before any processor
      // interpretation. The interpretive branches below are educated guesses;
      // when the real cause is a ruleset/required-checks misconfig (e.g. an
      // evaluator bug), the guess sends debuggers down the wrong path (LS-4926).
      if (error.status === 405) {
        const apiMessage = error.response?.data?.message;
        const docUrl = error.response?.data?.documentation_url;
        if (apiMessage) {
          console.log(
            `❌ PR #${pr.number}: GitHub merge API 405 — ${sanitizeLog(apiMessage)}` +
              (docUrl ? ` (see ${docUrl})` : ''),
          );
        }
      }

      // 405 "Repository rule violations" with a transient required-check state
      // means branch protection is waiting on (or briefly lost) a required check
      // against this SHA — treat as pending and re-queue, mirroring the 422
      // head-modified fast path. Two distinct GitHub message shapes:
      //
      //   - aggregate: "N of M required status checks are expected"
      //                "N of M required status checks have not succeeded"
      //     → CI is still registering or in-progress (LS-4181/LS-4184).
      //
      //   - single:    'Required status check "X" is cancelled.'
      //                'Required status check "X" is expected.'
      //     → GitHub's ruleset evaluator latched onto a stale/cancelled duplicate
      //       run for a required check NAME even though the latest run for that
      //       name succeeded. validateStatusChecks (latest-completed-per-name)
      //       already saw it green, so this is a server-side divergence, not a
      //       real failure. Re-queue; a push / base-push / self-retry re-evaluates
      //       once the cancelled run is superseded (LS-7989, RFC LS-7988).
      //
      // Other 405 causes (e.g. "Pull Request is not mergeable") still propagate.
      const mergeErrMsg =
        (error.response?.data?.message ?? '') + '\n' + (error.message ?? '');
      const isTransientRequiredCheck405 =
        /\d+ of \d+ required status checks? (?:(?:are|is) expected|(?:have|has) not succeeded)/i.test(
          mergeErrMsg,
        ) ||
        /required status check .+? is (?:expected|pending|queued|in[_ ]?progress|cancelled)\b/i.test(
          mergeErrMsg,
        );
      if (error.status === 405 && isTransientRequiredCheck405) {
        console.log(
          `⏳ PR #${pr.number}: merge rejected with 405 (required check in a transient state) — ` +
            `CI still registering or in-progress, or a cancelled duplicate run is pending replacement. ` +
            `Will re-evaluate on next trigger.`,
        );
        hasPendingPRs = true;
        return;
      }

      // 405 "Waiting on code owner review" (LS-8297): path-scoped CODEOWNERS
      // rules (e.g. .github/** → @bkrupa) are invisible to the reviewDecision
      // pre-check — reviewDecision reads APPROVED once the review bot (the
      // catch-all code owner) approves, so the queue attempts the merge and
      // GitHub refuses it. That is a legitimate blocked state, not a
      // processing error: report it like any other blocker (comment + Discord
      // escalation) and return cleanly. The code owner's approval submission
      // re-triggers the queue via pull_request_review, so no retry is needed.
      if (
        error.status === 405 &&
        /waiting on code owner review/i.test(mergeErrMsg)
      ) {
        console.log(
          `🔐 PR #${pr.number}: merge blocked awaiting code owner review — ` +
            `will merge automatically once the code owner approves.`,
        );
        await reportMergeBlocker(pr, {
          canMerge: false,
          reason: 'PR requires CODEOWNER approval for sensitive path(s)',
        });
        return;
      }

      console.error(
        `❌ Failed to merge PR #${pr.number}: ${sanitizeLog(error.message)}`,
      );

      if (
        error.message.includes('Resource not accessible') ||
        error.status === 403
      ) {
        console.error(
          '🔒 PERMISSION ERROR: GitHub Actions does not have permission to merge PRs',
        );
        console.error(
          '📋 Fix: Settings → Actions → General → Workflow permissions → Read and write + allow PR creation',
        );
      }

      throw error;
    }
  }

  // LS-8779: when a PR was stacked on another (soft-dependency) branch and
  // that base branch has since squash- or rebase-merged into its own base,
  // GitHub auto-retargets this PR to the grandparent branch and the plain
  // "checkout main / merge main" advice below replays every one of the old
  // base branch's commits on top of the (unrelated-SHA) squash commit —
  // noisy conflicts or a redundant merge commit. `git rebase --onto` drops
  // the now-squashed commits cleanly. Detect the pattern via the PR's own
  // BaseRefChangedEvent history + the old base branch's (now-merged) PR;
  // any failure/ambiguity here just falls back to the generic advice.
  async function detectSquashedStackedBase(pr) {
    const timeline = await github.graphql(
      `query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            timelineItems(last: 5, itemTypes: [BASE_REF_CHANGED_EVENT]) {
              nodes {
                ... on BaseRefChangedEvent {
                  previousRefName
                  currentRefName
                }
              }
            }
          }
        }
      }`,
      { owner, repo, number: pr.number },
    );
    const events =
      timeline?.repository?.pullRequest?.timelineItems?.nodes ?? [];
    const lastChange = events[events.length - 1];
    if (
      !lastChange?.previousRefName ||
      lastChange.previousRefName === pr.base.ref
    ) {
      return null;
    }

    const oldBase = await github.graphql(
      `query($owner: String!, $repo: String!, $ref: String!) {
        repository(owner: $owner, name: $repo) {
          pullRequests(headRefName: $ref, states: [MERGED], first: 1) {
            nodes {
              headRefOid
              mergeCommit { parents { totalCount } }
            }
          }
        }
      }`,
      { owner, repo, ref: lastChange.previousRefName },
    );
    const node = oldBase?.repository?.pullRequests?.nodes?.[0];
    // A 2-parent merge commit means the old base's commits are still
    // reachable from the new base by their original SHAs — a plain rebase
    // is fine. Only a 1-parent (squash/rebase-merge) commit flattens them.
    if (!node?.headRefOid || node.mergeCommit?.parents?.totalCount !== 1) {
      return null;
    }

    return {
      previousRefName: lastChange.previousRefName,
      oldTipSha: node.headRefOid,
    };
  }

  async function reportMergeBlocker(pr, validation) {
    if (validation.isPending) {
      console.log(
        `⏳ Checks still in progress for PR #${pr.number}, will retry in next cycle`,
      );
      hasPendingPRs = true;
    }

    const heading = validation.isPending
      ? '## ⏳ Merge Queue: Waiting'
      : '## 🚫 Merge Queue: Cannot Merge';

    let comment =
      heading +
      '\n\n' +
      '**Reason:** ' +
      validation.reason +
      '\n\n' +
      '### 🛠️ How to Fix:';

    if (validation.reason.includes('merge conflicts')) {
      const squashedStack = await detectSquashedStackedBase(pr).catch(
        () => null,
      );
      if (squashedStack) {
        comment +=
          '\n1. This PR was stacked on `' +
          squashedStack.previousRefName +
          '`, which has since been squash- or rebase-merged into `' +
          pr.base.ref +
          '` — its commits no longer exist under their original SHAs. A plain ' +
          "rebase or merge would replay all of that branch's original commits on " +
          'top of the squash commit, producing noisy conflicts or a redundant merge ' +
          'commit. Drop the now-squashed commits cleanly instead:\n' +
          '   ```bash\n' +
          '   git fetch origin\n' +
          '   git rebase --onto origin/' +
          pr.base.ref +
          ' ' +
          squashedStack.oldTipSha +
          ' ' +
          pr.head.ref +
          '\n' +
          '   git push --force-with-lease origin ' +
          pr.head.ref +
          '\n' +
          '   ```';
      } else {
        comment +=
          '\n1. Sync your branch with the latest main:\n' +
          '   ```bash\n' +
          '   git checkout main\n' +
          '   git pull origin main\n' +
          '   git checkout ' +
          pr.head.ref +
          '\n' +
          '   git merge main  # Resolve any conflicts\n' +
          '   git push origin ' +
          pr.head.ref +
          '\n' +
          '   ```';
      }
    } else if (
      validation.reason.includes('CODEOWNER approval') ||
      validation.reason.includes('reviewDecision')
    ) {
      comment +=
        '\n1. A CODEOWNER must approve this PR before it can be merged\n' +
        '2. Check `.github/CODEOWNERS` to see which reviewer(s) own the files you changed\n' +
        '3. Request a review from the appropriate CODEOWNER(s)\n' +
        '4. If a reviewer already requested changes, address them and re-request review';
    } else if (validation.reason.includes('merge-to-parent')) {
      comment +=
        '\n1. This PR targets `' +
        pr.base.ref +
        '` (non-main). Stacked PRs normally merge **base-first**: wait for the parent PR to merge, ' +
        'and this PR will be re-targeted to `main` automatically and proceed through the normal queue\n' +
        '2. To instead merge this PR into `' +
        pr.base.ref +
        '` directly (before the parent lands), add the `merge-to-parent` label — it is a deliberate ' +
        'manual escape hatch and is never applied by automation, so both `merge-when-ready` and ' +
        '`merge-to-parent` must be present';
    } else if (validation.unresolvedThreads) {
      comment +=
        '\n1. Resolve all open review comment threads on the PR\n' +
        '2. Threads from the following reviewer(s) are unresolved:\n' +
        [...new Set(validation.unresolvedThreads)]
          .map((a) => '   - @' + a)
          .join('\n') +
        '\n' +
        '3. Open each thread on the **Files changed** tab and click **Resolve conversation**';
    } else if (validation.failingChecks) {
      comment +=
        '\n1. Fix the failing checks:\n' +
        validation.failingChecks.map((check) => '   - ' + check).join('\n') +
        '\n' +
        '2. Push your fixes to trigger CI re-run';
    } else if (validation.isPending && validation.pendingChecks) {
      comment +=
        '\n1. Waiting on the following check(s) to complete:\n' +
        validation.pendingChecks.map((check) => '   - ' + check).join('\n') +
        '\n' +
        '2. The merge queue will retry automatically once checks finish';
    } else {
      comment +=
        '\n1. Check the PR status and resolve any issues\n' +
        '2. Ensure all requirements are met';
    }

    comment +=
      '\n\nThe merge queue will automatically retry once the issues are resolved.\n\n' +
      '---\n*Automated message from merge queue system*';

    // The queue re-evaluates on every CI completion / review / label event, so
    // this path re-runs many times while a PR sits blocked. Ping Discord at most
    // once per head SHA: a hidden marker persisted in the status comment (and
    // carried forward across rewrites by findOrCreateComment) records that the
    // ping was sent. A new push gets a fresh ping — the push dismisses the stale
    // approval, so the codeowner genuinely needs to be re-summoned.
    const isCodeownerBlocked = validation.reason.includes('CODEOWNER approval');
    const pingMarker = `<!-- CODEOWNER-PING:${pr.head.sha} -->`;
    if (isCodeownerBlocked) {
      comment += '\n' + pingMarker;
    }

    const { previousBody } = await findOrCreateComment(pr, comment);

    if (isCodeownerBlocked && !(previousBody || '').includes(pingMarker)) {
      await notifyDiscordCodeownerRequired(pr);
    }
  }

  async function notifyDiscordCodeownerRequired(pr) {
    const webhookUrl = process.env.ESCALATION_WEBHOOK_URL;
    if (!webhookUrl) return;

    const prUrl = `https://github.com/${owner}/${repo}/pull/${pr.number}`;
    const payload = JSON.stringify({
      embeds: [
        {
          title: '🔐 Code Owner Review Required',
          description:
            `PR **[#${pr.number}: ${pr.title}](${prUrl})** is in the merge queue ` +
            `but requires CODEOWNER approval before it can be merged.`,
          color: 0xfee75c,
          fields: [
            { name: 'Author', value: `@${pr.user.login}`, inline: true },
            { name: 'Branch', value: `\`${pr.head.ref}\``, inline: true },
          ],
          url: prUrl,
          timestamp: new Date().toISOString(),
          footer: { text: 'Merge Queue · legacy-sports' },
        },
      ],
    });

    const url = new URL(webhookUrl);
    await new Promise((resolve) => {
      const req = require('https').request(
        {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          res.resume();
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(
              `📣 Discord CODEOWNER notification sent for PR #${pr.number}`,
            );
          } else {
            console.warn(
              `⚠️ Discord webhook returned ${res.statusCode} for PR #${pr.number}`,
            );
          }
          resolve();
        },
      );
      req.on('error', (err) => {
        console.warn(
          `⚠️ Discord webhook error for PR #${pr.number}: ${err.message}`,
        );
        resolve();
      });
      req.write(payload);
      req.end();
    });
  }

  async function reportProcessingError(pr, error) {
    // Don't pass the raw error object to console.error — Node renders it via
    // util.inspect, which dumps the entire Octokit request body (including
    // pr.body via commit_message). Log a sanitized one-line summary instead;
    // see `sanitizeLog` for why ##[ escapes must be neutralized.
    const summary =
      (error.status ? '[' + error.status + '] ' : '') +
      (error.message || String(error));
    console.error(
      'Processing error for PR #' + pr.number + ': ' + sanitizeLog(summary),
    );

    let errorComment =
      '## ⚠️ Merge Queue Processing Error\n\n' +
      'An error occurred while processing this PR for automatic merge:\n\n' +
      '**Error:** ' +
      error.message +
      '\n\n';

    if (
      error.message.includes('Resource not accessible') ||
      error.status === 403
    ) {
      errorComment +=
        '### 🔒 Permission Issue Detected\n\n' +
        'This appears to be a GitHub Actions permissions issue.\n\n' +
        '**Administrator Action Required:**\n' +
        '1. Go to **Settings** → **Actions** → **General**\n' +
        '2. Scroll to **Workflow permissions**\n' +
        '3. Select **"Read and write permissions"**\n' +
        '4. Check **"Allow GitHub Actions to create and approve pull requests"**\n' +
        '5. Click **Save**\n\n';
    } else {
      errorComment +=
        '### 🔧 Next Steps:\n' +
        '1. This may be a temporary issue - the merge queue will retry in the next cycle\n' +
        '2. If the error persists, you can manually merge this PR\n' +
        '3. Contact the team if you believe this is a system issue\n\n';
    }

    errorComment += '---\n*Automated message from merge queue system*';

    await findOrCreateComment(pr, errorComment);
  }

  async function retargetDependentPRs(mergedPR) {
    const mergedBranch = mergedPR.head.ref;
    const targetBase = mergedPR.base.ref;

    console.log(
      `\n🔀 Checking for open PRs based on merged branch '${mergedBranch}'...`,
    );

    const openPRs = await github.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      base: mergedBranch,
    });

    if (openPRs.data.length === 0) {
      console.log(`   No dependent PRs found for '${mergedBranch}'`);
      return;
    }

    console.log(
      `   Found ${openPRs.data.length} dependent PR(s) to re-target → '${targetBase}'`,
    );

    for (const dependentPR of openPRs.data) {
      try {
        await github.rest.pulls.update({
          owner,
          repo,
          pull_number: dependentPR.number,
          base: targetBase,
        });
        console.log(
          `   ✅ PR #${dependentPR.number} (${dependentPR.title}) re-targeted to '${targetBase}'`,
        );

        const waitingLabel = 'Waiting on Parent';
        if (dependentPR.labels.some((label) => label.name === waitingLabel)) {
          try {
            await github.rest.issues.removeLabel({
              owner,
              repo,
              issue_number: dependentPR.number,
              name: waitingLabel,
            });
            console.log(
              `   🏷️ Removed '${waitingLabel}' label from PR #${dependentPR.number}`,
            );
          } catch (labelError) {
            console.warn(
              `   ⚠️ Could not remove '${waitingLabel}' label: ${labelError.message}`,
            );
          }
        }

        await github.rest.issues.createComment({
          owner,
          repo,
          issue_number: dependentPR.number,
          body:
            `🔀 **Base branch updated automatically**\n\n` +
            `PR #${mergedPR.number} (\`${mergedBranch}\`) was merged into \`${targetBase}\`. ` +
            `This PR's base has been re-targeted from \`${mergedBranch}\` → \`${targetBase}\`.\n\n` +
            `If you have merge conflicts, rebase onto \`${targetBase}\`:\n` +
            '```bash\n' +
            `git fetch origin\n` +
            `git rebase origin/${targetBase}\n` +
            `git push --force-with-lease\n` +
            '```\n\n' +
            `---\n*Automated message from merge queue system*`,
        });
      } catch (error) {
        console.error(
          `   ❌ Failed to re-target PR #${dependentPR.number}: ${error.message}`,
        );
      }
    }
  }

  async function deleteBranch(pr) {
    const branchName = pr.head.ref;

    if (
      branchName === 'main' ||
      branchName === 'master' ||
      branchName === 'develop'
    ) {
      console.log(`🛡️ Skipping deletion of protected branch '${branchName}'`);
      return;
    }

    try {
      await github.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branchName}`,
      });
      console.log(`🗑️ Deleted branch '${branchName}' after merge`);
    } catch (error) {
      console.warn(
        `⚠️ Could not delete branch '${branchName}': ${error.message}`,
      );
    }
  }
};
