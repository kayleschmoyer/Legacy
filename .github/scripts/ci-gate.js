/**
 * ci-gate.js — Aggregate "CI Gate" status computation + poster (LS-7991).
 *
 * Phase 2 of LS-7988: collapse the granular `🚀 CI Pipeline / {lint,
 * build,test,custom-checks}` required checks into ONE aggregator commit status,
 * `CI Gate`, posted exactly once per head SHA by the CI Pipeline `summarize`
 * job (.github/workflows/ci-pipeline.yml).
 *
 * WHY A COMMIT STATUS (not a check run):
 *   The root cause of the spurious 405s (LS-7988) is that GitHub's merge-API
 *   ruleset evaluator can latch onto a terminal `cancelled` check-RUN for a
 *   required NAME on a SHA even when a later run for that name succeeded.
 *   Concurrency cancellation + base-push re-triggers leave such duplicates.
 *   Commit statuses do NOT have this ambiguity: GitHub (and the merge-queue
 *   processor's validateStatusChecks) evaluate the LATEST status per context
 *   by created_at — there is no "cancelled" status state, and a summarize job
 *   killed mid-post simply posts nothing rather than a terminal cancelled row.
 *   Posting `CI Gate` as a commit status therefore eliminates the duplicate-
 *   required-name ambiguity at the root. `bot-review` uses the same mechanism.
 *
 * Logging: uses console.* / core.* — this module runs in the GitHub Actions
 * runner's Node sandbox via actions/github-script and cannot import workspace
 * packages like `@legacy-sports/logging`. Build-time scripts are an explicit
 * exception to the no-console rule (see AGENTS.md, Code Quality → No console.*).
 */

// The required-check context name. Mirrored in .github/ruleset.json (_commitStatus).
const CI_GATE_CONTEXT = 'CI Gate';

// GitHub commit-status `description` has a 140-character hard limit.
const MAX_DESCRIPTION_LENGTH = 140;

// The granular CI Pipeline jobs folded into the gate verdict. This MUST match
// the failure-threshold set in .github/actions/collect-results (the existing
// definition of overall pipeline success): lint (which also runs the format
// check as of LS-8901 — the two share one job), test, build, custom-checks,
// lockfile-check, e2e. Pass semantics: `success` and `skipped` pass;
// `failure`, `timed_out`, or any missing/unknown value fail.
//
// `cancelled` is DELIBERATELY excluded from the verdict (LS-8219): a cancelled
// granular job is a superseded/duplicate run (concurrency-cancel, post-merge
// SIGINT/exit-130) rather than a real failure. Folding it as FAILURE let a
// cancelled post-merge duplicate latch a fresh red `CI Gate` on a SHA whose
// gating run was already green. This is an intentional divergence from
// collect-results, which treats cancelled as failure for the in-run overall
// status — here we are posting a per-SHA required status that must never go red
// purely because a duplicate run was cancelled.
const GATE_INPUT_JOBS = Object.freeze([
  'lint',
  'test',
  'build',
  'custom-checks',
  'lockfile-check',
  'e2e',
]);

/**
 * A job result counts as passing for the gate when it succeeded OR was
 * legitimately skipped (e.g. e2e skipped when no web/api surface changed).
 */
function isPass(result) {
  return result === 'success' || result === 'skipped';
}

/**
 * A `cancelled` granular job is a superseded/duplicate run (concurrency-cancel,
 * post-merge SIGINT/exit-130), NOT a real failure. It is excluded from the gate
 * verdict so a cancelled duplicate run can never post a fresh FAILURE on a SHA
 * whose gating run was green (LS-8219).
 */
function isCancelled(result) {
  return result === 'cancelled';
}

/**
 * Fold the granular job results into a single gate conclusion.
 * Resolves `success` iff EVERY folded input passes; otherwise `failure`,
 * with the offending inputs listed (for the status description / logs).
 *
 * `cancelled` results are excluded from the verdict (treated as not-a-failure)
 * so a cancelled/post-merge duplicate run never latches a stale-red `CI Gate`.
 *
 * @param {Record<string, string|undefined>} results map of job id → result
 * @returns {{ conclusion: 'success'|'failure', failing: string[], ignored: string[] }}
 */
function computeGateConclusion(results) {
  const failing = [];
  const ignored = [];
  for (const job of GATE_INPUT_JOBS) {
    const result = results ? results[job] : undefined;
    if (isCancelled(result)) {
      ignored.push(job);
      continue;
    }
    if (!isPass(result)) {
      failing.push(`${job} (${result || 'missing'})`);
    }
  }
  return {
    conclusion: failing.length === 0 ? 'success' : 'failure',
    failing,
    ignored,
  };
}

/**
 * Workflow names whose runs post a `CI Gate` verdict for a SHA. The CI Pipeline
 * is a reusable workflow called by the orchestrator and therefore shares the
 * orchestrator's run id; both names are accepted so a directly-invoked pipeline
 * run is still counted. Mirrors the predicate in upload-lambdas.yml (verify-ci).
 */
const CI_RUN_WORKFLOW_NAMES = Object.freeze([
  'Legacy Sports CI Orchestrator',
  'Legacy Sports CI Pipeline',
]);

/**
 * Run conclusions that mean "this run will never post a gate verdict".
 *
 * The summarize job is `always() && !cancelled()`, and a run whose scope step
 * skips the pipeline never reaches it at all. Such a run must NOT be treated as
 * superseding: doing so would make the real gating run withhold its verdict
 * while the superseding run posts nothing, stranding the SHA with NO `CI Gate`
 * status and blocking the merge indefinitely.
 *
 * This is not hypothetical — the orchestrator emits an extra, scoped-out run per
 * `pull_request` label event (`bot:ready-for-review`, the `CI:` result labels),
 * and label churn easily produces one with a higher run id than the real run.
 *
 * An in-flight run has `conclusion: null`, which is deliberately NOT in this set
 * — it has not finished and is still expected to post.
 */
const CONCLUSIONS_THAT_POST_NO_VERDICT = Object.freeze([
  'skipped',
  'cancelled',
  'neutral',
]);

/**
 * Extract the Actions run id from a commit status `target_url` of the shape
 * `https://github.com/<owner>/<repo>/actions/runs/<id>`.
 *
 * @returns {number|null} the run id, or null when the URL is absent or is not
 *   an Actions run URL.
 */
function runIdFromTargetUrl(targetUrl) {
  if (typeof targetUrl !== 'string') return null;
  const match = /\/actions\/runs\/(\d+)/.exec(targetUrl);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Decide whether THIS run may post a `success` verdict for `sha` (LS-9378).
 *
 * WHY: a commit status is last-writer-wins by created_at, and `results`
 * reflects only THIS run's view of the pipeline. Re-running an OLDER run for a
 * SHA that a NEWER run has already ruled on replays a stale verdict over the
 * newer one. That is exactly how PR #7006 merged with a failing E2E shard: run
 * 31462018381 posted `failure` (e2e) at 2026-08-11T05:51:38, then the older run
 * 31458492265 was re-run ~35h later and its summarize job re-posted its own
 * stale `success`, re-arming `merge-when-ready`. The merge followed 17 minutes
 * later. The pre-existing SHA-currency guard did not fire because the PR head
 * SHA had never moved — only the verdict did.
 *
 * THE INVARIANT: a `failure` verdict may ALWAYS be posted — turning a SHA red is
 * never unsafe. A `success` verdict must PROVE it is the newest word on the SHA.
 * Both checks below therefore fail CLOSED: when recency cannot be established
 * (missing run id, API error), success is withheld. A missing `CI Gate` status
 * blocks the merge on its own, so withholding is the safe direction.
 *
 * Run IDs are compared rather than timestamps because a run id is assigned once
 * at creation and is immutable and monotonic across re-run attempts, whereas
 * re-running a run moves its timestamps and can make an older run look newer.
 *
 * @param {object} params
 * @param {number} params.selfRunId this run's `GITHUB_RUN_ID`.
 * @returns {Promise<{allowed: boolean, reason?: string, supersededBy?: number}>}
 */
async function assertSuccessIsCurrent({
  github,
  core,
  owner,
  repo,
  sha,
  selfRunId,
}) {
  if (!Number.isSafeInteger(selfRunId)) {
    core.warning(
      'CI Gate: GITHUB_RUN_ID is unavailable — withholding the success verdict ' +
        'because it cannot be proven current.',
    );
    return { allowed: false, reason: 'unknown-run-id' };
  }

  // (A) Does a NEWER CI run exist for this SHA that will post its own verdict?
  // If so we are a superseded re-run and our verdict is stale by construction.
  // Runs that can never post (see CONCLUSIONS_THAT_POST_NO_VERDICT) are ignored
  // so we do not withhold in favour of a run that will never speak.
  try {
    const { data } = await github.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      head_sha: sha,
      per_page: 100,
    });
    const newer = (data.workflow_runs || [])
      .filter(
        (run) =>
          CI_RUN_WORKFLOW_NAMES.includes(run.name) &&
          run.id > selfRunId &&
          !CONCLUSIONS_THAT_POST_NO_VERDICT.includes(run.conclusion),
      )
      .sort((a, b) => b.id - a.id)[0];
    if (newer) {
      return {
        allowed: false,
        reason: 'superseded-run',
        supersededBy: newer.id,
      };
    }
  } catch (e) {
    core.warning(
      `CI Gate: could not list CI runs for ${sha} (${e.message}) — withholding ` +
        'the success verdict rather than risk overwriting a newer failure.',
    );
    return { allowed: false, reason: 'run-lookup-failed' };
  }

  // (B) Has a newer run already posted a RED gate for this SHA? Redundant with
  // (A) when the runs listing is complete, but it survives pagination and API
  // lag — and a red verdict from a newer run is the exact thing we must never
  // overwrite.
  try {
    const { data } = await github.rest.repos.listCommitStatusesForRef({
      owner,
      repo,
      ref: sha,
      per_page: 100,
    });
    const newerFailure = (data || [])
      .filter(
        (status) =>
          status.context === CI_GATE_CONTEXT && status.state === 'failure',
      )
      .map((status) => runIdFromTargetUrl(status.target_url))
      .filter((id) => id !== null && id > selfRunId)
      .sort((a, b) => b - a)[0];
    if (newerFailure !== undefined) {
      return {
        allowed: false,
        reason: 'newer-failure-posted',
        supersededBy: newerFailure,
      };
    }
  } catch (e) {
    core.warning(
      `CI Gate: could not list commit statuses for ${sha} (${e.message}) — ` +
        'withholding the success verdict rather than risk overwriting a newer ' +
        'failure.',
    );
    return { allowed: false, reason: 'status-lookup-failed' };
  }

  return { allowed: true };
}

/**
 * Post the aggregate `CI Gate` commit status for the PR head SHA.
 *
 * SHA-currency guard: re-fetch the PR's current head SHA and no-op (post
 * nothing) if it advanced past the SHA this run evaluated. A stale verdict
 * posted to an old SHA cannot satisfy the gate for the current head anyway, but
 * skipping avoids racing a newer run and avoids spending an API write on a SHA
 * nobody will merge.
 *
 * @param {object} params
 * @param {number} [params.prNumber] PR number to post against when the run
 *   has no `pull_request` in its event payload (LS-9148: workflow_dispatch
 *   runs the orchestrator resolved a PR for). Ignored when a payload PR is
 *   present — the payload is always the authoritative source when it exists.
 * @param {string} [params.headSha] Head SHA to target alongside `prNumber`.
 *   Required together with `prNumber` for the no-payload path; without it
 *   there is no SHA to post the status to.
 * @returns {Promise<{posted: boolean, reason?: string, state?: string, sha?: string, currentSha?: string, failing?: string[]}>}
 */
async function postCiGate({
  github,
  context,
  core,
  results,
  prNumber,
  headSha,
}) {
  const { owner, repo } = context.repo;
  const payloadPr = context.payload && context.payload.pull_request;

  // LS-9148: workflow_dispatch (manual re-runs, and the ci:run label handler,
  // which routes through workflow_dispatch to avoid displacing the
  // orchestrator's concurrency group) carries no `pull_request` in the event
  // payload. When the orchestrator resolved a PR for such a run, the caller
  // passes prNumber/headSha explicitly — fall back to those before giving up.
  const pr =
    payloadPr ||
    (prNumber && headSha ? { number: prNumber, head: { sha: headSha } } : null);

  if (!pr) {
    core.info(
      'CI Gate: no pull_request in the event payload and no prNumber/headSha ' +
        'provided — skipping (not a PR-scoped run).',
    );
    return { posted: false, reason: 'no-pr' };
  }

  const targetSha = pr.head.sha;

  // SHA-currency guard — re-read the PR's live head.
  let currentSha = targetSha;
  try {
    const { data: fresh } = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: pr.number,
    });
    currentSha = fresh.head.sha;
  } catch (e) {
    core.warning(
      `CI Gate: could not re-fetch PR #${pr.number} head SHA (${e.message}) — ` +
        `proceeding with the event head ${targetSha}.`,
    );
  }

  if (currentSha !== targetSha) {
    core.info(
      `CI Gate: PR #${pr.number} head advanced (${targetSha} → ${currentSha}) ` +
        `since this run started — skipping stale verdict. A run for the current ` +
        `head will post its own gate.`,
    );
    return { posted: false, reason: 'stale', sha: targetSha, currentSha };
  }

  const { conclusion, failing, ignored } = computeGateConclusion(results);
  const state = conclusion === 'success' ? 'success' : 'failure';

  if (ignored.length > 0) {
    core.info(
      `CI Gate: ignoring cancelled (superseded/post-merge duplicate) jobs ` +
        `for PR #${pr.number} ${targetSha}: ${ignored.join(', ')}`,
    );
  }
  // LS-9378: red may always be posted; green must prove it is the newest word
  // on this SHA. Without this, re-running a superseded run replays its stale
  // verdict over a newer run's failure. See assertSuccessIsCurrent.
  const selfRunId = Number(process.env.GITHUB_RUN_ID);
  if (state === 'success') {
    const currency = await assertSuccessIsCurrent({
      github,
      core,
      owner,
      repo,
      sha: targetSha,
      selfRunId,
    });
    if (!currency.allowed) {
      core.info(
        `CI Gate: withholding 'success' for ${targetSha} on PR #${pr.number} ` +
          `(${currency.reason}` +
          (currency.supersededBy
            ? `, superseded by run ${currency.supersededBy}`
            : '') +
          `) — the newer run's verdict stands.`,
      );
      return {
        posted: false,
        reason: currency.reason,
        sha: targetSha,
        supersededBy: currency.supersededBy,
      };
    }
  }

  const description =
    conclusion === 'success'
      ? 'All CI checks passed'
      : `Failing: ${failing.join(', ')}`.slice(0, MAX_DESCRIPTION_LENGTH);

  const target_url = Number.isSafeInteger(selfRunId)
    ? `https://github.com/${owner}/${repo}/actions/runs/${selfRunId}`
    : undefined;

  await github.rest.repos.createCommitStatus({
    owner,
    repo,
    sha: targetSha,
    state,
    context: CI_GATE_CONTEXT,
    description,
    target_url,
  });

  core.info(
    `CI Gate: posted '${state}' for ${targetSha} on PR #${pr.number} — ${description}`,
  );
  return { posted: true, state, sha: targetSha, failing, ignored };
}

module.exports = {
  CI_GATE_CONTEXT,
  CI_RUN_WORKFLOW_NAMES,
  GATE_INPUT_JOBS,
  computeGateConclusion,
  runIdFromTargetUrl,
  assertSuccessIsCurrent,
  postCiGate,
};
