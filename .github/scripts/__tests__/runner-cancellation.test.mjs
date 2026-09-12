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
 *
 * Run via: node --test .github/scripts/__tests__/runner-cancellation.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  classifyJobLog,
  shouldRerunCancelledRun,
  MAX_RERUN_ATTEMPTS,
  RUNNER_SHUTDOWN,
  DELIBERATE_CANCEL,
  NO_SIGNAL,
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
