/**
 * Unit tests for runner-cancellation.js (LS-10091).
 *
 * Covers:
 *  - classifyJobLog: the ordering rule that separates a runner dying under a
 *    live job (shutdown notice first) from a deliberate cancellation (cancel
 *    line first, runner teardown after).
 *  - The PR #7894 regression case itself: the real log ordering from job
 *    103368091870 must classify as runner churn. Keying on the run conclusion
 *    instead — the fix originally proposed on the ticket — would have called
 *    this "not a flake", which is why the ordering rule exists.
 *  - shouldRerunCancelledRun: fails closed on unknown/superseded SHAs, refuses
 *    to fight a deliberate cancel, and caps repeated attempts.
 *  - classifyCancelledJob (LS-10140): the job-level classification the CI Gate
 *    consults before it posts a verdict — real failure, never ran, runner
 *    shutdown, deliberate cancel — and the two mappings built on it
 *    (gateEffectOfCancellation, isRunnerAttributable).
 *
 * Run via: node --test .github/scripts/__tests__/runner-cancellation.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  classifyJobLog,
  classifyCancelledJob,
  gateEffectOfCancellation,
  isRunnerAttributable,
  shouldRerunCancelledRun,
  MAX_RERUN_ATTEMPTS,
  RUNNER_SHUTDOWN,
  DELIBERATE_CANCEL,
  NO_SIGNAL,
  REAL_FAILURE,
  NEVER_RAN,
} = require('../runner-cancellation.js');

const SHUTDOWN_LINE =
  '##[error]The runner has received a shutdown signal. This can happen when ' +
  'the runner service is stopped, or a manually started runner is canceled.';
const CANCEL_LINE = '##[error]The operation was canceled.';

describe('classifyJobLog — ordering rule (LS-10091)', () => {
  it('classifies shutdown-before-cancel as runner churn (the PR #7894 shape)', () => {
    // Verbatim ordering from job 103368091870: a shard 91.7% through a 690 MB
    // cache restore at 200 MB/s when its runner was torn down.
    const log = [
      '2026-09-11T18:09:16.6767978Z Received 633339904 of 690927403 (91.7%), 200.3 MBs/sec',
      `2026-09-11T18:09:17.2309138Z ${SHUTDOWN_LINE}`,
      `2026-09-11T18:09:17.2611926Z ${CANCEL_LINE}`,
      '2026-09-11T18:09:17.2761638Z Cleaning up orphan processes',
    ].join('\n');

    assert.equal(classifyJobLog(log), RUNNER_SHUTDOWN);
  });

  it('classifies cancel-before-shutdown as a deliberate cancellation', () => {
    // A human pressing Cancel, a concurrency displacement, or a fail-fast
    // sibling abort: the cancel lands first, the ephemeral runner tears down
    // afterwards and emits the very same shutdown notice.
    const log = [
      '2026-09-11T12:00:00.0000000Z Running tests…',
      `2026-09-11T12:00:01.0000000Z ${CANCEL_LINE}`,
      `2026-09-11T12:00:02.0000000Z ${SHUTDOWN_LINE}`,
    ].join('\n');

    assert.equal(classifyJobLog(log), DELIBERATE_CANCEL);
  });

  it('treats a shutdown notice with no cancel line as unambiguous churn', () => {
    assert.equal(classifyJobLog(`prefix\n${SHUTDOWN_LINE}\n`), RUNNER_SHUTDOWN);
  });

  it('treats a log with no shutdown notice as a genuine failure', () => {
    const log = ['Error: 3 tests failed', CANCEL_LINE].join('\n');
    assert.equal(classifyJobLog(log), NO_SIGNAL);
  });

  it('returns no-signal for empty or non-string input rather than throwing', () => {
    assert.equal(classifyJobLog(''), NO_SIGNAL);
    assert.equal(classifyJobLog(undefined), NO_SIGNAL);
    assert.equal(classifyJobLog(null), NO_SIGNAL);
  });
});

describe('shouldRerunCancelledRun — guards (LS-10091)', () => {
  const base = {
    runAttempt: 1,
    runHeadSha: 'fa4e3fbf3',
    prHeadSha: 'fa4e3fbf3',
    classification: RUNNER_SHUTDOWN,
  };

  it('re-runs a first-attempt churn cancellation on the current head SHA', () => {
    const { rerun } = shouldRerunCancelledRun(base);
    assert.equal(rerun, true);
  });

  it('does not re-run when the PR head has moved on', () => {
    const { rerun, reason } = shouldRerunCancelledRun({
      ...base,
      prHeadSha: '3468f1f11',
    });
    assert.equal(rerun, false);
    assert.match(reason, /superseded/);
  });

  it('does not fight a deliberate cancellation', () => {
    const { rerun, reason } = shouldRerunCancelledRun({
      ...base,
      classification: DELIBERATE_CANCEL,
    });
    assert.equal(rerun, false);
    assert.match(reason, /deliberate/);
  });

  it('stops at the attempt cap so a reclaiming pool cannot loop forever', () => {
    const atCap = shouldRerunCancelledRun({
      ...base,
      runAttempt: MAX_RERUN_ATTEMPTS,
    });
    assert.equal(atCap.rerun, false);
    assert.match(atCap.reason, /cap/);

    const belowCap = shouldRerunCancelledRun({
      ...base,
      runAttempt: MAX_RERUN_ATTEMPTS - 1,
    });
    assert.equal(belowCap.rerun, true);
  });

  it('fails closed when the attempt number or a SHA is unknown', () => {
    assert.equal(
      shouldRerunCancelledRun({ ...base, runAttempt: undefined }).rerun,
      false,
    );
    assert.equal(
      shouldRerunCancelledRun({ ...base, runHeadSha: '' }).rerun,
      false,
    );
    assert.equal(
      shouldRerunCancelledRun({ ...base, prHeadSha: undefined }).rerun,
      false,
    );
  });

  it('still re-runs when classification could not be established', () => {
    // Logs can expire or 404. An unclassifiable cancellation on the current
    // head SHA is still a missing verdict, and the attempt cap bounds the cost.
    const { rerun } = shouldRerunCancelledRun({
      ...base,
      classification: null,
    });
    assert.equal(rerun, true);
  });
});

/**
 * LS-10140 — job-level cancellation classification.
 *
 * The CI Gate needs two distinctions `classifyJobLog` alone cannot make: a
 * cancelled job that already recorded a real failing step (its verdict is
 * real), and a job that never ran at all (no steps, no log — re-runnable, and
 * emphatically not a failure).
 *
 * The four cases the ticket names — zero-step cancel, mid-step cancel with
 * runner shutdown, genuine failure, superseded-run cancel — are each covered
 * below, together with the negative controls that keep the "must not mask a
 * genuine failure" invariant load-bearing.
 */
describe('classifyCancelledJob — job-level classification (LS-10140)', () => {
  /** The observed PR #7976 case 1 shape: no steps, log blob 404s. */
  const NEVER_RAN_JOB = { steps: [], logText: '', logAvailable: false };

  it('zero steps and no log blob => never-ran (PR #7976 run 34722062338)', () => {
    // "CI Pipeline / test" waited ~18 minutes for a ci-runner it never got and
    // was cancelled having recorded ZERO steps — not even "Set up job". No
    // test body ran, so there is nothing this job could be said to have failed.
    assert.equal(classifyCancelledJob(NEVER_RAN_JOB), NEVER_RAN);
    assert.equal(gateEffectOfCancellation(NEVER_RAN), 'no-verdict');
    assert.equal(isRunnerAttributable(NEVER_RAN), true);
  });

  it('mid-step cancel with the shutdown notice first => runner-shutdown (PR #7976 case 2)', () => {
    // "custom-checks" got a runner, completed checkout, then "Setup Workspace"
    // was cancelled mid-install when the runner went away.
    const verdict = classifyCancelledJob({
      steps: [
        { name: 'Set up job', conclusion: 'success' },
        { name: 'Checkout Repository', conclusion: 'success' },
        { name: 'Setup Workspace', conclusion: 'cancelled' },
      ],
      logText: [SHUTDOWN_LINE, CANCEL_LINE].join('\n'),
    });
    assert.equal(verdict, RUNNER_SHUTDOWN);
    assert.equal(gateEffectOfCancellation(verdict), 'no-verdict');
    assert.equal(isRunnerAttributable(verdict), true);
  });

  it('NEGATIVE CONTROL: a job that ran test bodies and failed is a real failure', () => {
    // The load-bearing AC. A cancelled rollup over a step that genuinely
    // concluded `failure` (LS-9467 / PR #6909: a 30-minute timeout landing
    // just after the e2e step failed) must still report failure — mapping this
    // to "no verdict" would let broken code merge.
    const verdict = classifyCancelledJob({
      steps: [
        { name: 'Set up job', conclusion: 'success' },
        { name: 'E2E Tests (affected specs)', conclusion: 'failure' },
      ],
      logText: '',
    });
    assert.equal(verdict, REAL_FAILURE);
    assert.equal(gateEffectOfCancellation(verdict), 'failure');
    assert.equal(isRunnerAttributable(verdict), false);
  });

  it('NEGATIVE CONTROL: a failing step outranks a runner-shutdown marker in the same log', () => {
    // A runner can die AFTER a test has already failed. Precedence must put
    // the real verdict first, or the shutdown marker becomes a way to launder
    // any failure into "infrastructure".
    const verdict = classifyCancelledJob({
      steps: [{ name: 'test', conclusion: 'failure' }],
      logText: [SHUTDOWN_LINE, CANCEL_LINE].join('\n'),
    });
    assert.equal(verdict, REAL_FAILURE);
    assert.equal(isRunnerAttributable(verdict), false);
  });

  it('superseded-run cancel (cancel line first) => deliberate-cancel, and is NOT runner-attributable', () => {
    // A superseding run, a human pressing Cancel, or a fail-fast sibling abort
    // all land here. It is still "no verdict" for the gate — nothing was
    // proven — but it does NOT excuse the merge-when-ready strip: only
    // infrastructure churn does (LS-10091's invariant, preserved).
    const verdict = classifyCancelledJob({
      steps: [
        { name: 'Set up job', conclusion: 'success' },
        { name: 'test', conclusion: 'cancelled' },
      ],
      logText: [CANCEL_LINE, SHUTDOWN_LINE].join('\n'),
    });
    assert.equal(verdict, DELIBERATE_CANCEL);
    assert.equal(gateEffectOfCancellation(verdict), 'no-verdict');
    assert.equal(isRunnerAttributable(verdict), false);
  });

  it('an unattributable cancel stays no-signal — never silently runner churn', () => {
    const verdict = classifyCancelledJob({
      steps: [{ name: 'Set up job', conclusion: 'success' }],
      logText: 'nothing interesting here',
    });
    assert.equal(verdict, NO_SIGNAL);
    assert.equal(gateEffectOfCancellation(verdict), 'no-verdict');
    assert.equal(isRunnerAttributable(verdict), false);
  });

  it('"never ran" requires BOTH halves — a readable log means the job reached a runner', () => {
    // Zero steps but a retrievable log is not proof of absence: the log is
    // proof the job DID reach a runner, so the ordering rule decides instead.
    assert.equal(
      classifyCancelledJob({
        steps: [],
        logText: [SHUTDOWN_LINE, CANCEL_LINE].join('\n'),
        logAvailable: true,
      }),
      RUNNER_SHUTDOWN,
    );
    // And steps without a log blob is likewise not "never ran" — it ran.
    assert.equal(
      classifyCancelledJob({
        steps: [{ name: 'Set up job', conclusion: 'success' }],
        logText: '',
        logAvailable: false,
      }),
      NO_SIGNAL,
    );
  });

  it('tolerates a missing or malformed steps list without throwing', () => {
    assert.equal(classifyCancelledJob({}), NO_SIGNAL);
    assert.equal(classifyCancelledJob(), NO_SIGNAL);
    assert.equal(
      classifyCancelledJob({ steps: null, logAvailable: false }),
      NEVER_RAN,
    );
  });

  it('a never-ran job is still re-runnable — the LS-10091 guard must not refuse it', () => {
    // A job that never got a runner has no log to classify, so
    // shouldRerunCancelledRun sees NEVER_RAN rather than DELIBERATE_CANCEL and
    // must still authorise the re-run that produces a genuine verdict.
    const { rerun } = shouldRerunCancelledRun({
      runAttempt: 1,
      runHeadSha: 'a30b3ec',
      prHeadSha: 'a30b3ec',
      classification: NEVER_RAN,
    });
    assert.equal(rerun, true);
  });
});
