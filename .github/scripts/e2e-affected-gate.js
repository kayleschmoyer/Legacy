/**
 * e2e-affected-gate.js — Same-SHA sibling-success check for the `e2e-affected`
 * merge gate (LS-9889).
 *
 * WHY THIS EXISTS: the `e2e-affected` job (.github/workflows/ci-pipeline.yml)
 * evaluates `needs.e2e.result` / `needs.e2e-mobile.result` from THIS run
 * alone. When two orchestrator runs race on the same head SHA (the LS-9860
 * shape — see LS-9580 for the dedup fix), GitHub's concurrency group can
 * cancel a different subset of shards in each run: the union across both runs
 * is green, but neither run's own matrix result is. The job used to treat any
 * non-success/skipped result — cancelled included — as a hermetic e2e
 * regression, which stripped merge-when-ready and sent the author hunting for
 * a test bug that did not exist (PR #7585).
 *
 * Before failing on a `cancelled` result, check whether the same shard's
 * check-run context already has a `success` verdict on this head SHA from a
 * sibling run — the same reasoning ci-gate.js's `assertSuccessIsCurrent`
 * (LS-9579) applies to the CI Gate aggregate, applied here to this gate's own
 * independent pass/fail decision. If no sibling succeeded either, the gate
 * still fails, but says so precisely ("cancelled and never completed on this
 * SHA") instead of reporting a regression that does not exist.
 *
 * SCOPE (LS-9889): this module only changes how `cancelled` is handled for
 * the e2e/e2e-mobile results feeding THIS gate. It does not touch the CI Gate
 * aggregate (already excludes cancelled, LS-8219/LS-9579), the `CI: *` label
 * computation (already fixed, LS-9887), or cancellation handling for any
 * other job.
 */

const { latestCompletedConclusionByName } = require('./ci-failure-labels.js');
const { CANCELLABLE_TEST_JOB_NAME_PREFIX } = require('./ci-gate.js');

// Human-readable name for each shard's gate messages.
const SHARD_LABEL = Object.freeze({
  e2e: 'the e2e job',
  'e2e-mobile': 'the e2e-mobile job',
});

/**
 * A job result counts as passing outright — no sibling lookup needed.
 */
function isPass(result) {
  return result === 'success' || result === 'skipped';
}

/**
 * Decide whether a single shard's (`e2e` or `e2e-mobile`) result passes the
 * gate, consulting the head SHA's live check runs only when the result is
 * `cancelled`.
 *
 * @param {'e2e'|'e2e-mobile'} jobKey
 * @param {string|undefined} result `needs.<job>.result` for THIS run.
 * @param {Array<{name: string, status: string, conclusion: string|null, completed_at?: string, started_at?: string}>} checkRuns
 *   the head SHA's check runs (already fetched, across all runs).
 * @param {boolean} [hasAffectedWork] whether this PR mapped to any
 *   non-@critical affected specs (or ran the full suite). Defaults to `true`
 *   (existing behaviour) — the @critical safety net always runs regardless of
 *   affected specs, so a genuine `failure`/`timed_out` result stays a
 *   hermetic-regression verdict either way. When `false` (LS-9820), an
 *   unresolved `cancelled` result names that no affected specs matched this
 *   PR's changes, reinforcing that there is nothing PR-specific to regress.
 * @returns {{ pass: boolean, message: string }}
 */
function evaluateShard(jobKey, result, checkRuns, hasAffectedWork = true) {
  const label = SHARD_LABEL[jobKey] || `the ${jobKey} job`;

  if (isPass(result)) {
    return { pass: true, message: `${label} result was '${result}'.` };
  }

  if (result !== 'cancelled') {
    return {
      pass: false,
      message:
        `e2e-affected gate failed — ${label} result was '${result}'. ` +
        'A hermetic e2e regression must be fixed before merge.',
    };
  }

  // Cancelled: a concurrency-group race, not a test verdict on its own.
  // Check whether a sibling run already posted `success` for this shard's
  // check-run context(s) on the same head SHA before treating it as a
  // regression (LS-9889).
  const prefix = CANCELLABLE_TEST_JOB_NAME_PREFIX[jobKey];
  const latest = latestCompletedConclusionByName(checkRuns);
  const matches = prefix
    ? [...latest.entries()].filter(([name]) => name.includes(prefix))
    : [];
  const hasSiblingSuccess = matches.some(
    ([, conclusion]) => conclusion === 'success',
  );

  if (hasSiblingSuccess) {
    return {
      pass: true,
      message:
        `${label} result was 'cancelled' on this run, but a sibling run's ` +
        'check-run for the same shard(s) already succeeded on this head SHA ' +
        '— treating the context as satisfied.',
    };
  }

  // LS-9820: an unresolved cancellation is a shard whose result is unknown,
  // not a verdict — never phrase it as an assertion that a regression
  // occurred. When this PR also had no affected specs (@critical-only), say
  // so explicitly: there is nothing PR-specific this cancellation could have
  // regressed.
  const noAffectedWorkNote = hasAffectedWork
    ? ''
    : " No affected specs matched this PR's changes either — there is nothing PR-specific here to regress.";

  return {
    pass: false,
    message:
      `e2e-affected gate failed — ${label} was cancelled and never ` +
      'completed on this SHA (no sibling run succeeded either). Result ' +
      'unknown, not a verdict — this is not a hermetic regression — re-run ' +
      `the cancelled shard(s).${noAffectedWorkNote}`,
  };
}

/**
 * Evaluate the full `e2e-affected` gate for this run (e2e + e2e-mobile).
 *
 * Fails CLOSED on a check-runs lookup error: a cancelled shard with an
 * unconfirmed sibling is treated as having no sibling success, so an API
 * hiccup can only make the gate fail with the (accurate) "never completed"
 * message — it can never wrongly pass a shard that in fact never succeeded
 * anywhere.
 *
 * @param {object} params
 * @param {object} params.github Octokit client (`github` in actions/github-script).
 * @param {object} [params.core] Actions core (`core` in actions/github-script) — used only to log a lookup warning.
 * @param {string} params.owner
 * @param {string} params.repo
 * @param {string} params.sha head SHA to check for sibling check-runs.
 * @param {string|undefined} params.e2eResult `needs.e2e.result`.
 * @param {string|undefined} params.e2eMobileResult `needs.e2e-mobile.result`.
 * @param {boolean} [params.hasAffectedWork] whether this PR mapped to any
 *   non-@critical affected specs, or ran the full suite (`e2e-affected-run-all`
 *   / `e2e-affected-specs` from `detect-changes`). Defaults to `true` so a
 *   caller that omits it keeps the original behaviour. See `evaluateShard`'s
 *   JSDoc (LS-9820) for how this only softens the *unresolved-cancellation*
 *   message — a genuine failure/timed_out result is unaffected, since the
 *   @critical safety net runs regardless of affected specs.
 * @returns {Promise<{ pass: boolean, messages: string[] }>}
 */
async function evaluateE2eAffectedGate({
  github,
  core,
  owner,
  repo,
  sha,
  e2eResult,
  e2eMobileResult,
  hasAffectedWork = true,
}) {
  const needsLookup =
    e2eResult === 'cancelled' || e2eMobileResult === 'cancelled';

  let checkRuns = [];
  if (needsLookup) {
    try {
      checkRuns = await github.paginate(github.rest.checks.listForRef, {
        owner,
        repo,
        ref: sha,
        per_page: 100,
      });
    } catch (e) {
      if (core) {
        core.warning(
          `e2e-affected gate: could not list check runs for ${sha} ` +
            `(${e.message}) — treating cancelled shard(s) as having no ` +
            'sibling success.',
        );
      }
      checkRuns = [];
    }
  }

  const e2e = evaluateShard('e2e', e2eResult, checkRuns, hasAffectedWork);
  const mobile = evaluateShard(
    'e2e-mobile',
    e2eMobileResult,
    checkRuns,
    hasAffectedWork,
  );

  return {
    pass: e2e.pass && mobile.pass,
    messages: [e2e.message, mobile.message],
  };
}

module.exports = {
  isPass,
  evaluateShard,
  evaluateE2eAffectedGate,
};
