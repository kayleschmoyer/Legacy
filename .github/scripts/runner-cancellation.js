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
 * @param {object} opts
 * @param {number} opts.runAttempt        `run_attempt` of the completed run.
 * @param {string} opts.runHeadSha        Head SHA the cancelled run tested.
 * @param {string} opts.prHeadSha         PR's head SHA right now.
 * @param {string} [opts.classification]  Result of classifyJobLog across the run.
 * @param {number} [opts.maxAttempts]     Override for MAX_RERUN_ATTEMPTS.
 * @returns {{ rerun: boolean, reason: string }}
 */
function shouldRerunCancelledRun({
  runAttempt,
  runHeadSha,
  prHeadSha,
  classification,
  maxAttempts = MAX_RERUN_ATTEMPTS,
}) {
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

  if (runAttempt >= maxAttempts) {
    return {
      rerun: false,
      reason: `attempt ${runAttempt} has reached the cap of ${maxAttempts} — needs a human`,
    };
  }

  return {
    rerun: true,
    reason: `attempt ${runAttempt} of ${maxAttempts} cancelled on the current head SHA — re-running failed jobs`,
  };
}

module.exports = {
  SHUTDOWN_SIGNATURE,
  CANCEL_SIGNATURE,
  RUNNER_SHUTDOWN,
  DELIBERATE_CANCEL,
  NO_SIGNAL,
  MAX_RERUN_ATTEMPTS,
  classifyJobLog,
  shouldRerunCancelledRun,
};
