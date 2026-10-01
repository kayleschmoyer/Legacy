/**
 * runner-cancellation.js — Tell a dead runner apart from a deliberate cancel,
 * and decide whether a cancelled CI run deserves an automatic re-run (LS-10091).
 *
 * WHY THIS EXISTS
 * ---------------
 * Two separate decisions used to be made from evidence that cannot actually
 * support them:
 *
 *  1. `CI: Runner Flake` was applied whenever a failed/cancelled job's log
 *     contained "The runner has received a shutdown signal". GitHub emits that
 *     line on ANY cancellation that tears the runner down — including a
 *     deliberate one (a human pressing Cancel, a concurrency displacement, a
 *     `fail-fast` sibling abort) — so the string alone cannot distinguish
 *     infrastructure churn from an intentional stop.
 *
 *  2. Nothing re-ran a cancelled pipeline, so the head SHA never reached a
 *     verdict and `restore-merge-label-on-success` could never fire.
 *
 * WHAT ACTUALLY DISCRIMINATES: the ORDER of the two markers in the job log.
 *
 *   - Runner death: the runner service is torn down underneath a job that is
 *     still healthy, so the shutdown notice is written FIRST and the step's
 *     "The operation was canceled." follows as a consequence.
 *   - Deliberate cancel: the cancel request arrives first, the job logs "The
 *     operation was canceled.", and only then does the ephemeral runner shut
 *     down — emitting the same shutdown notice AFTER the cancel line.
 *
 * Observed on PR #7894 (head fa4e3fbf3), job 103368091870 — a shard 91.7%
 * through a 690 MB node_modules cache restore at 200 MB/s:
 *
 *   18:09:17.2309  ##[error]The runner has received a shutdown signal. …
 *   18:09:17.2611  ##[error]The operation was canceled.
 *
 * Shutdown first => genuine runner death, correctly labelled a flake. Note
 * that keying on the RUN conclusion instead (cancelled => not a flake), as was
 * first proposed, would have misclassified exactly this case: the run's
 * conclusion was `cancelled` precisely because the runner died.
 *
 * Pulled into its own module (mirroring ci-gate.js / ci-failure-labels.js) so
 * the ordering rule and the re-run guards are unit-testable — see
 * __tests__/runner-cancellation.test.mjs.
 */

/**
 * Emitted verbatim by GitHub when the runner service is torn down under a
 * running job. The trailing sentence varies, so only the stable clause is
 * matched.
 */
const SHUTDOWN_SIGNATURE = 'runner has received a shutdown signal';

/** Emitted by the Actions runner when a cancel request reaches a live step. */
const CANCEL_SIGNATURE = 'The operation was canceled.';

/** Classification results for a single job's log. */
const RUNNER_SHUTDOWN = 'runner-shutdown';
const DELIBERATE_CANCEL = 'deliberate-cancel';
const NO_SIGNAL = 'no-signal';

/**
 * Classify one failed/cancelled job from its log tail.
 *
 * @param {string} logText Tail of the job log (the markers are always at the end).
 * @returns {'runner-shutdown'|'deliberate-cancel'|'no-signal'}
 *   - `runner-shutdown`: the runner died under a live job — infrastructure churn.
 *   - `deliberate-cancel`: the job was cancelled and the runner tore down after.
 *   - `no-signal`: no shutdown notice at all — a genuine failure, or a cancel
 *     on a runner that was never torn down.
 */
function classifyJobLog(logText) {
  if (typeof logText !== 'string' || logText.length === 0) {
    return NO_SIGNAL;
  }

  const shutdownAt = logText.indexOf(SHUTDOWN_SIGNATURE);
  if (shutdownAt === -1) {
    // Absence of the marker stays a genuine failure: a false "runner flake"
    // verdict would hide a real break.
    return NO_SIGNAL;
  }

  const cancelAt = logText.indexOf(CANCEL_SIGNATURE);
  if (cancelAt === -1) {
    // Runner torn down with no preceding cancel line — unambiguous churn.
    return RUNNER_SHUTDOWN;
  }

  // Both present: whichever came first caused the other.
  return shutdownAt < cancelAt ? RUNNER_SHUTDOWN : DELIBERATE_CANCEL;
}

/**
 * Maximum orchestrator attempts for one SHA. Attempt 1 is the original run;
 * this module will re-run it at most twice more. Bounded because a runner pool
 * that is reclaiming every instance would otherwise re-run forever, burning
 * the pool and the Actions bill on a SHA that can never go green.
 */
const MAX_RERUN_ATTEMPTS = 3;

/**
 * Decide whether a completed, cancelled orchestrator run should have its
 * failed/cancelled jobs re-run so the SHA reaches a genuine verdict.
 *
 * Fails CLOSED: anything unproven (unknown SHA, missing attempt number) means
 * no re-run. A missing verdict blocks the merge queue, which is the safe
 * direction — the cost of not re-running is a human clicking "Re-run", while
 * the cost of re-running wrongly is burning the runner pool on a dead SHA.
 *
 * A run that concluded `failure` is re-run too, but only under two extra
 * conditions (LS-10311). A spot-reclaimed runner often leaves its job
 * concluded `failure` with no failed step, and that alone turns the whole run
 * `failure` — so a cancelled-only rule never re-runs the most common runner
 * death. The extra conditions keep a genuine verdict from being retried:
 *   - the run must show a runner shutdown (`classification`), and
 *   - the SHA's `CI Gate` must be `pending`. The gate classifies every gate
 *     input before it posts (ci-gate.js), so it posts red for any genuine
 *     failure and pending only when the sole problems were cancellations or
 *     runner deaths. A red gate, or an unknown one, means no re-run.
 *
 * @param {object} opts
 * @param {number} opts.runAttempt        `run_attempt` of the completed run.
 * @param {string} opts.runHeadSha        Head SHA the cancelled run tested.
 * @param {string} opts.prHeadSha         PR's head SHA right now.
 * @param {string} [opts.classification]  Result of classifyJobLog across the run.
 * @param {string} [opts.runConclusion]   The run's conclusion (default `cancelled`).
 * @param {string} [opts.gateState]       Current `CI Gate` state for the SHA;
 *   consulted only for a `failure` run.
 * @param {number} [opts.maxAttempts]     Override for MAX_RERUN_ATTEMPTS.
 * @returns {{ rerun: boolean, reason: string }}
 */
function shouldRerunCancelledRun({
  runAttempt,
  runHeadSha,
  prHeadSha,
  classification,
  runConclusion = 'cancelled',
  gateState,
  maxAttempts = MAX_RERUN_ATTEMPTS,
}) {
  if (runConclusion !== 'cancelled' && runConclusion !== 'failure') {
    return {
      rerun: false,
      reason: `run concluded '${runConclusion}' — only cancelled or runner-killed runs are re-run`,
    };
  }

  if (!Number.isInteger(runAttempt) || runAttempt < 1) {
    return { rerun: false, reason: 'run attempt is unknown — failing closed' };
  }

  if (!runHeadSha || !prHeadSha) {
    return { rerun: false, reason: 'head SHA is unknown — failing closed' };
  }

  if (runHeadSha !== prHeadSha) {
    // A newer push already superseded this SHA; its own pipeline will produce
    // the verdict that matters. Re-running a stale SHA wastes the pool and can
    // replay an outdated verdict (the LS-9579 hazard ci-gate.js guards).
    return {
      rerun: false,
      reason: `run tested ${runHeadSha} but PR head is now ${prHeadSha} — superseded`,
    };
  }

  if (classification === DELIBERATE_CANCEL) {
    // Someone or something stopped this on purpose. Re-running would fight the
    // operator (and, for a concurrency displacement, duplicate the run that
    // displaced it).
    return {
      rerun: false,
      reason: 'cancellation was deliberate, not runner churn — not re-running',
    };
  }

  if (runConclusion === 'failure') {
    if (classification !== RUNNER_SHUTDOWN) {
      return {
        rerun: false,
        reason:
          'run failed with no runner shutdown in any job — a genuine verdict',
      };
    }
    if (gateState !== 'pending') {
      // A red gate means some gate input really failed. Another state, or an
      // unknown one, means the gate has not confirmed "no real failure". Fail
      // closed in both cases.
      return {
        rerun: false,
        reason: `CI Gate is '${gateState || 'unknown'}', not pending — a runner died but the SHA may still have a real failure`,
      };
    }
  }

  if (runAttempt >= maxAttempts) {
    return {
      rerun: false,
      reason: `attempt ${runAttempt} has reached the cap of ${maxAttempts} — needs a human`,
    };
  }

  return {
    rerun: true,
    reason:
      runConclusion === 'failure'
        ? `attempt ${runAttempt} of ${maxAttempts} lost a runner on the current head SHA and CI Gate found no real failure — re-running failed jobs`
        : `attempt ${runAttempt} of ${maxAttempts} cancelled on the current head SHA — re-running failed jobs`,
  };
}

/**
 * A cancelled job that recorded a genuinely failing step BEFORE the
 * cancellation landed. Its verdict is real and must never be softened —
 * see `classifyCancelledJob`.
 */
const REAL_FAILURE = 'real-failure';

/**
 * A cancelled job that never executed a single step and has no retrievable log
 * blob: it sat in the queue waiting for a runner it never got, and the
 * cancellation tore it down before "Set up job" ever ran (LS-10140).
 *
 * This is materially different from every other cancellation class: there is
 * no evidence at all — not even a log — because no code from this repository
 * was executed. Such a job is re-runnable and must read as "no verdict", never
 * as a failure.
 *
 * Observed on PR #7976 run 34722062338: job "CI Pipeline / test" was created
 * at 22:12:36, waited ~18 minutes for a ci-runner, and was cancelled at
 * 22:30:29 having recorded ZERO steps; `GET /actions/jobs/{id}/logs` 404s with
 * BlobNotFound.
 */
const NEVER_RAN = 'never-ran';

/**
 * Classify ONE cancelled (or failed) job from the two pieces of evidence the
 * Actions API exposes about it: its step list and the tail of its log.
 *
 * WHY THIS EXISTS (LS-10140): `classifyJobLog` above answers "was the runner
 * torn down under this job?" from the log alone. That is the right question
 * for deciding whether to re-run, but it is NOT sufficient for deciding what a
 * cancelled job means to the CI Gate, which needs two further distinctions the
 * log ordering cannot make:
 *
 *   1. A job that ran test bodies and recorded a `failure` step before the
 *      cancellation landed has a REAL verdict (LS-9467, PR #6909: a 30-minute
 *      `timeout-minutes` rolled a job whose e2e step had already concluded
 *      `failure` up to `cancelled`). Reading that as "no verdict" would let a
 *      deterministically-broken spec merge. This check runs FIRST, so no
 *      other signal can mask a genuine failure.
 *   2. A job that never ran at all (no steps, no log) is not a cancellation of
 *      work — it is the ABSENCE of work, and it is re-runnable.
 *
 * Precedence is deliberate and load-bearing: real failure → never ran → log
 * ordering. A job can carry a shutdown marker AND a failing step (the runner
 * died after a test already failed); the failing step wins, because the cost
 * of masking a real break is a broken main and the cost of a false "runner
 * shutdown" attribution is only a wasted re-run.
 *
 * @param {object} params
 * @param {Array<{conclusion?: string|null}>} [params.steps] The job's `steps`
 *   array from the Actions Jobs API.
 * @param {string} [params.logText] Tail of the job's log (empty when absent).
 * @param {boolean} [params.logAvailable] `false` when the log blob 404s
 *   (BlobNotFound) — the signal that no log was ever written.
 * @returns {'real-failure'|'never-ran'|'runner-shutdown'|'deliberate-cancel'|'no-signal'}
 */
function classifyCancelledJob({ steps, logText, logAvailable = true } = {}) {
  const stepList = Array.isArray(steps) ? steps : [];

  // (1) Never mask a genuine failure — checked before anything else.
  if (stepList.some((step) => step && step.conclusion === 'failure')) {
    return REAL_FAILURE;
  }

  // (2) No steps AND no log blob => the job never started. Both halves are
  // required: a job with no steps but a retrievable log did reach the runner
  // (the log is the proof), so it falls through to the ordering rule below.
  if (stepList.length === 0 && !logAvailable) {
    return NEVER_RAN;
  }

  // (3) Otherwise the log's marker ordering decides, exactly as it does for
  // the re-run decision — one rule, one module, so the gate and the
  // runner-shutdown reporter can never disagree about the same job.
  return classifyJobLog(logText);
}

/**
 * Classify ONE job that concluded `failure` (LS-10311).
 *
 * When EC2 reclaims a spot runner mid-job, GitHub often concludes the job
 * `failure` instead of `cancelled`, even though no step failed. Between Sep 22
 * and Sep 29 2026, 59 of 153 spot-killed jobs ended this way. Each one posted a
 * red CI Gate for code that never failed.
 *
 * A `failure` job counts as runner death only when BOTH hold:
 *   - no step concluded `failure`. A failed step is a real verdict, and it
 *     wins even when the runner also died afterwards (same precedence as
 *     `classifyCancelledJob`), and
 *   - the log shows the shutdown notice before any cancel line
 *     (`classifyJobLog`).
 * Missing or unreadable evidence falls back to `real-failure`. The job already
 * reported `failure`, so staying red is the conservative direction.
 *
 * @param {object} params
 * @param {Array<{conclusion?: string|null}>} [params.steps] The job's steps.
 * @param {string} [params.logText] Tail of the job's log.
 * @returns {'runner-shutdown'|'real-failure'}
 */
function classifyFailedJob({ steps, logText } = {}) {
  const stepList = Array.isArray(steps) ? steps : [];
  if (stepList.some((step) => step && step.conclusion === 'failure')) {
    return REAL_FAILURE;
  }
  return classifyJobLog(logText) === RUNNER_SHUTDOWN
    ? RUNNER_SHUTDOWN
    : REAL_FAILURE;
}

/**
 * What a cancelled job's classification means to the CI Gate aggregate status
 * (LS-10140).
 *
 * Only `real-failure` is a failure. Every other class — including a
 * `deliberate-cancel` and an unattributable `no-signal` cancel — is
 * `no-verdict`: the job produced no result, so the gate must neither claim the
 * SHA failed (it did not) nor claim it passed (it was never proven). The
 * caller turns `no-verdict` into a PENDING gate, which blocks the merge
 * without asserting a code failure.
 *
 * @param {string} classification A `classifyCancelledJob` result.
 * @returns {'failure'|'no-verdict'}
 */
function gateEffectOfCancellation(classification) {
  return classification === REAL_FAILURE ? 'failure' : 'no-verdict';
}

/**
 * Whether a cancellation is attributable to the runner pool dying under the
 * job — infrastructure churn the author did not cause, and the only class for
 * which `merge-when-ready` survives (LS-10140 AC3).
 *
 * `never-ran` counts: a job that waited out its whole queue window for a
 * ci-runner it never got and was then torn down is the same pool exhaustion,
 * observed one step earlier. A `deliberate-cancel` and an unattributable
 * `no-signal` cancel deliberately do NOT count — those keep the pre-existing
 * fail-safe label strip (LS-10091).
 *
 * @param {string} classification A `classifyCancelledJob` result.
 * @returns {boolean}
 */
function isRunnerAttributable(classification) {
  return classification === RUNNER_SHUTDOWN || classification === NEVER_RAN;
}

module.exports = {
  SHUTDOWN_SIGNATURE,
  CANCEL_SIGNATURE,
  RUNNER_SHUTDOWN,
  DELIBERATE_CANCEL,
  NO_SIGNAL,
  MAX_RERUN_ATTEMPTS,
  REAL_FAILURE,
  NEVER_RAN,
  classifyJobLog,
  classifyCancelledJob,
  classifyFailedJob,
  gateEffectOfCancellation,
  isRunnerAttributable,
  shouldRerunCancelledRun,
};
