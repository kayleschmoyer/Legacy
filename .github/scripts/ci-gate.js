/**
 * ci-gate.js — Aggregate "CI Gate" status computation + poster (LS-7991).
 *
 * Phase 2 of LS-7988: collapse the granular `🚀 CI Pipeline / {lint,format,
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
// definition of overall pipeline success): lint, format, test, build,
// custom-checks, lockfile-check, e2e. Pass semantics: `success` and `skipped`
// pass; `failure`, `timed_out`, or any missing/unknown value fail.
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
  'format',
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
 * Post the aggregate `CI Gate` commit status for the PR head SHA.
 *
 * SHA-currency guard: re-fetch the PR's current head SHA and no-op (post
 * nothing) if it advanced past the SHA this run evaluated. A stale verdict
 * posted to an old SHA cannot satisfy the gate for the current head anyway, but
 * skipping avoids racing a newer run and avoids spending an API write on a SHA
 * nobody will merge.
 *
 * @returns {Promise<{posted: boolean, reason?: string, state?: string, sha?: string, currentSha?: string, failing?: string[]}>}
 */
async function postCiGate({ github, context, core, results }) {
  const { owner, repo } = context.repo;
  const pr = context.payload && context.payload.pull_request;

  if (!pr) {
    core.info(
      'CI Gate: no pull_request in the event payload — skipping (not a PR-scoped run).',
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
  const description =
    conclusion === 'success'
      ? 'All CI checks passed'
      : `Failing: ${failing.join(', ')}`.slice(0, MAX_DESCRIPTION_LENGTH);

  const runId = process.env.GITHUB_RUN_ID;
  const target_url = runId
    ? `https://github.com/${owner}/${repo}/actions/runs/${runId}`
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
  GATE_INPUT_JOBS,
  computeGateConclusion,
  postCiGate,
};
