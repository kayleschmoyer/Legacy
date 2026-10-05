/**
 * Unit tests for ci-gate-stuck-sweep.js (LS-10576).
 *
 * Covers:
 *  - The 2026-10-04 incident shape: a "withheld (status-lookup-failed) — retry
 *    pending" CI Gate left behind by a green run is re-run.
 *  - Every fail-closed guard: young pending, missing/foreign/in-flight/red run,
 *    superseded SHA, no Summarize job, attempt cap.
 *  - The small parsing helpers.
 *
 * Run via: node --test .github/scripts/__tests__/ci-gate-stuck-sweep.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  MIN_PENDING_AGE_MS,
  MAX_RUN_ATTEMPTS,
  runIdFromTargetUrl,
  latestGateStatus,
  findSummarizeJob,
  shouldRerunStuckGate,
} = require('../ci-gate-stuck-sweep.js');

const SHA = '1cc86c5eea07b6ca1d4e877adc2e7b7921fd03af';
const NOW = Date.parse('2026-10-04T23:00:00Z');

function stuck(overrides = {}) {
  return {
    gateStatus: {
      context: 'CI Gate',
      state: 'pending',
      description: 'CI Gate: withheld (status-lookup-failed) — retry pending',
      target_url:
        'https://github.com/bkrupa/legacy-sports/actions/runs/37209937057',
      created_at: '2026-10-04T16:21:25Z',
    },
    prHeadSha: SHA,
    run: {
      id: 37209937057,
      name: 'Legacy Sports CI Orchestrator',
      status: 'completed',
      conclusion: 'success',
      head_sha: SHA,
      run_attempt: 1,
    },
    summarizeJob: { id: 1, status: 'completed', conclusion: 'success' },
    now: NOW,
    ...overrides,
  };
}

describe('shouldRerunStuckGate', () => {
  it('re-runs the PR #8341 shape: withheld pending behind a green run', () => {
    const result = shouldRerunStuckGate(stuck());
    assert.equal(result.rerun, true);
    assert.match(result.reason, /re-running Summarize/);
  });

  it('re-runs a stale runner-shutdown pending once the run is green (PR #8168)', () => {
    const base = stuck();
    const result = shouldRerunStuckGate({
      ...base,
      gateStatus: {
        ...base.gateStatus,
        description: 'No verdict — e2e-mobile: runner-shutdown; re-run pending',
      },
      run: { ...base.run, run_attempt: 2 },
    });
    assert.equal(result.rerun, true);
  });

  it('leaves a missing gate alone', () => {
    assert.equal(
      shouldRerunStuckGate(stuck({ gateStatus: null })).rerun,
      false,
    );
  });

  it('leaves terminal verdicts alone', () => {
    for (const state of ['success', 'failure', 'error']) {
      const base = stuck();
      const result = shouldRerunStuckGate({
        ...base,
        gateStatus: { ...base.gateStatus, state },
      });
      assert.equal(result.rerun, false, state);
    }
  });

  it('waits until the pending is older than the threshold', () => {
    const base = stuck();
    const created = Date.parse(base.gateStatus.created_at);
    assert.equal(
      shouldRerunStuckGate({ ...base, now: created + MIN_PENDING_AGE_MS - 1 })
        .rerun,
      false,
    );
    assert.equal(
      shouldRerunStuckGate({ ...base, now: created + MIN_PENDING_AGE_MS })
        .rerun,
      true,
    );
  });

  it('fails closed on an unparseable timestamp', () => {
    const base = stuck();
    const result = shouldRerunStuckGate({
      ...base,
      gateStatus: { ...base.gateStatus, created_at: 'nope' },
    });
    assert.equal(result.rerun, false);
  });

  it('fails closed without a run link or a readable run', () => {
    const base = stuck();
    assert.equal(
      shouldRerunStuckGate({
        ...base,
        gateStatus: { ...base.gateStatus, target_url: null },
      }).rerun,
      false,
    );
    assert.equal(shouldRerunStuckGate({ ...base, run: null }).rerun, false);
  });

  it('ignores runs of other workflows', () => {
    const base = stuck();
    const result = shouldRerunStuckGate({
      ...base,
      run: { ...base.run, name: 'Re-run Cancelled CI' },
    });
    assert.equal(result.rerun, false);
  });

  it('leaves an in-flight run to post its own verdict', () => {
    const base = stuck();
    const result = shouldRerunStuckGate({
      ...base,
      run: { ...base.run, status: 'in_progress', conclusion: null },
    });
    assert.equal(result.rerun, false);
  });

  it('leaves cancelled and failed runs to rerun-cancelled-ci / humans', () => {
    for (const conclusion of ['cancelled', 'failure', 'skipped']) {
      const base = stuck();
      const result = shouldRerunStuckGate({
        ...base,
        run: { ...base.run, conclusion },
      });
      assert.equal(result.rerun, false, conclusion);
    }
  });

  it('skips a superseded SHA', () => {
    const result = shouldRerunStuckGate(stuck({ prHeadSha: 'f'.repeat(40) }));
    assert.equal(result.rerun, false);
    assert.match(result.reason, /superseded/);
  });

  it('skips a scoped-out run with no Summarize job', () => {
    const result = shouldRerunStuckGate(stuck({ summarizeJob: null }));
    assert.equal(result.rerun, false);
  });

  it('skips while the Summarize job is still running', () => {
    const result = shouldRerunStuckGate(
      stuck({
        summarizeJob: { id: 1, status: 'in_progress', conclusion: null },
      }),
    );
    assert.equal(result.rerun, false);
  });

  it('stops at the attempt cap and flags it for a human', () => {
    const base = stuck();
    const capped = shouldRerunStuckGate({
      ...base,
      run: { ...base.run, run_attempt: MAX_RUN_ATTEMPTS },
    });
    assert.equal(capped.rerun, false);
    assert.equal(capped.needsHuman, true);

    const under = shouldRerunStuckGate({
      ...base,
      run: { ...base.run, run_attempt: MAX_RUN_ATTEMPTS - 1 },
    });
    assert.equal(under.rerun, true);
  });

  it('fails closed on an unknown attempt number', () => {
    const base = stuck();
    const result = shouldRerunStuckGate({
      ...base,
      run: { ...base.run, run_attempt: undefined },
    });
    assert.equal(result.rerun, false);
  });
});

describe('runIdFromTargetUrl', () => {
  it('parses plain, job and attempt URLs', () => {
    const base =
      'https://github.com/bkrupa/legacy-sports/actions/runs/37209937057';
    assert.equal(runIdFromTargetUrl(base), 37209937057);
    assert.equal(runIdFromTargetUrl(`${base}/job/111`), 37209937057);
    assert.equal(runIdFromTargetUrl(`${base}/attempts/2`), 37209937057);
  });

  it('returns null for anything else', () => {
    assert.equal(runIdFromTargetUrl(null), null);
    assert.equal(runIdFromTargetUrl('https://example.com'), null);
  });
});

describe('latestGateStatus', () => {
  it('picks the newest CI Gate status regardless of order', () => {
    const statuses = [
      {
        context: 'CI Gate',
        state: 'pending',
        created_at: '2026-10-04T01:00:00Z',
      },
      {
        context: 'bot-review',
        state: 'success',
        created_at: '2026-10-04T05:00:00Z',
      },
      {
        context: 'CI Gate',
        state: 'success',
        created_at: '2026-10-04T03:00:00Z',
      },
    ];
    assert.equal(latestGateStatus(statuses).state, 'success');
  });

  it('returns null when there is no CI Gate status', () => {
    assert.equal(latestGateStatus([{ context: 'security' }]), null);
    assert.equal(latestGateStatus(undefined), null);
  });
});

describe('findSummarizeJob', () => {
  it('finds the prefixed reusable-workflow job', () => {
    const jobs = [
      { id: 1, name: '🚀 CI Pipeline / build' },
      { id: 2, name: '🚀 CI Pipeline / Summarize & Report' },
    ];
    assert.equal(findSummarizeJob(jobs).id, 2);
  });

  it('returns null when absent', () => {
    assert.equal(findSummarizeJob([{ name: '🏷️ Label PR' }]), null);
  });
});
