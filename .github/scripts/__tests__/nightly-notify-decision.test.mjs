/**
 * Unit tests for nightly-notify-decision.mjs (LS-10331).
 *
 * These pin the ticket's acceptance criteria: two consecutive identical red
 * runs produce exactly one notification, and a recovery produces a green
 * notification — plus the digest cadence and the fail-open parsing rules.
 *
 * Run via: node --test .github/scripts/__tests__/nightly-notify-decision.test.mjs
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DIGEST_EVERY,
  decideNightlyNotification,
  extractFailingTests,
  formatChangeSummary,
  normalizeStatus,
  parsePreviousState,
} from '../nightly-notify-decision.mjs';

const A = 'apps/web-e2e/src/tests/a.spec.ts › logs in';
const B = 'apps/web-e2e/src/tests/b.spec.ts › drafts a player';

const red = (failingTests, consecutiveReds = 1) => ({
  status: 'failure',
  failingTests,
  consecutiveReds,
});
const green = () => ({
  status: 'success',
  failingTests: [],
  consecutiveReds: 0,
});

describe('normalizeStatus', () => {
  it('keeps success and maps everything else to failure', () => {
    assert.equal(normalizeStatus('success'), 'success');
    assert.equal(normalizeStatus('failure'), 'failure');
    assert.equal(normalizeStatus('cancelled'), 'failure');
    assert.equal(normalizeStatus('skipped'), 'failure');
    assert.equal(normalizeStatus(undefined), 'failure');
  });
});

describe('extractFailingTests', () => {
  it('returns only failed entries as sorted, de-duplicated "spec › test" keys', () => {
    const ledger = {
      entries: [
        { spec: 'b.spec.ts', testName: 'two', status: 'failed', retryCount: 2 },
        { spec: 'a.spec.ts', testName: 'one', status: 'failed', retryCount: 2 },
        { spec: 'a.spec.ts', testName: 'one', status: 'failed', retryCount: 2 },
        {
          spec: 'c.spec.ts',
          testName: 'flaky',
          status: 'flaky',
          retryCount: 1,
        },
        { spec: 'd.spec.ts', testName: 'ok', status: 'passed', retryCount: 0 },
      ],
    };
    assert.deepEqual(extractFailingTests(ledger), [
      'a.spec.ts › one',
      'b.spec.ts › two',
    ]);
  });

  it('falls back to the spec path when testName is missing', () => {
    assert.deepEqual(
      extractFailingTests({
        entries: [{ spec: 'a.spec.ts', status: 'failed' }],
      }),
      ['a.spec.ts'],
    );
  });

  it('tolerates a missing or malformed ledger', () => {
    assert.deepEqual(extractFailingTests(null), []);
    assert.deepEqual(extractFailingTests({}), []);
    assert.deepEqual(extractFailingTests({ entries: 'nope' }), []);
    assert.deepEqual(
      extractFailingTests({ entries: [null, { status: 'failed' }] }),
      [],
    );
  });
});

describe('parsePreviousState', () => {
  it('returns null for absent or unusable state', () => {
    assert.equal(parsePreviousState(null), null);
    assert.equal(parsePreviousState('x'), null);
    assert.equal(parsePreviousState({ status: 'weird' }), null);
  });

  it('normalises failingTests and infers consecutiveReds when missing', () => {
    assert.deepEqual(
      parsePreviousState({ status: 'failure', failingTests: [B, A, A, 3] }),
      {
        status: 'failure',
        failingTests: [A, B],
        consecutiveReds: 1,
      },
    );
    assert.deepEqual(parsePreviousState({ status: 'success' }), green());
  });
});

describe('decideNightlyNotification', () => {
  it('posts on the first tracked run and records a baseline', () => {
    const d = decideNightlyNotification({
      previous: null,
      current: { status: 'failure', failingTests: [A] },
    });
    assert.equal(d.post, true);
    assert.equal(d.reason, 'first-run');
    assert.deepEqual(d.nextState, red([A], 1));
  });

  it('AC: two consecutive identical red runs produce one notification', () => {
    const first = decideNightlyNotification({
      previous: green(),
      current: { status: 'failure', failingTests: [A, B] },
    });
    assert.equal(first.post, true);
    assert.equal(first.reason, 'status-changed');

    const second = decideNightlyNotification({
      previous: first.nextState,
      current: { status: 'failure', failingTests: [B, A] },
    });
    assert.equal(second.post, false);
    assert.equal(second.reason, 'unchanged');
    assert.equal(second.nextState.consecutiveReds, 2);
  });

  it('AC: a recovery produces a green notification', () => {
    const d = decideNightlyNotification({
      previous: red([A, B], 4),
      current: { status: 'success', failingTests: [] },
    });
    assert.equal(d.post, true);
    assert.equal(d.reason, 'status-changed');
    assert.deepEqual(d.recovered, [A, B]);
    assert.deepEqual(d.nextState, green());
  });

  it('stays silent on green after green', () => {
    const d = decideNightlyNotification({
      previous: green(),
      current: { status: 'success', failingTests: [] },
    });
    assert.equal(d.post, false);
    assert.equal(d.reason, 'unchanged');
    assert.deepEqual(d.nextState, green());
  });

  it('posts when a new test starts failing while still red', () => {
    const d = decideNightlyNotification({
      previous: red([A], 3),
      current: { status: 'failure', failingTests: [A, B] },
    });
    assert.equal(d.post, true);
    assert.equal(d.reason, 'failing-tests-changed');
    assert.deepEqual(d.newFailures, [B]);
    assert.deepEqual(d.recovered, []);
    // A different red is a new streak, not a continuation of the old one.
    assert.equal(d.nextState.consecutiveReds, 4);
  });

  it('posts when a test recovers while the suite is still red', () => {
    const d = decideNightlyNotification({
      previous: red([A, B], 3),
      current: { status: 'failure', failingTests: [B] },
    });
    assert.equal(d.post, true);
    assert.equal(d.reason, 'failing-tests-changed');
    assert.deepEqual(d.newFailures, []);
    assert.deepEqual(d.recovered, [A]);
  });

  it('posts a digest on every DIGEST_EVERY-th consecutive identical red', () => {
    let state = red([A], 1);
    const posted = [];
    for (let run = 2; run <= DIGEST_EVERY * 2; run++) {
      const d = decideNightlyNotification({
        previous: state,
        current: { status: 'failure', failingTests: [A] },
      });
      if (d.post) posted.push({ run, reason: d.reason });
      state = d.nextState;
    }
    assert.deepEqual(posted, [
      { run: DIGEST_EVERY, reason: 'digest' },
      { run: DIGEST_EVERY * 2, reason: 'digest' },
    ]);
  });

  it('honours a custom digest cadence', () => {
    const d = decideNightlyNotification({
      previous: red([A], 2),
      current: { status: 'failure', failingTests: [A] },
      digestEvery: 3,
    });
    assert.equal(d.post, true);
    assert.equal(d.reason, 'digest');
  });

  it('treats a red run with no report as a different failure than a red run with specs', () => {
    const d = decideNightlyNotification({
      previous: red([A], 1),
      current: { status: 'cancelled', failingTests: [] },
    });
    assert.equal(d.post, true);
    assert.equal(d.reason, 'failing-tests-changed');
    assert.deepEqual(d.recovered, [A]);
  });

  it('treats unusable previous state as a first run (fail-open)', () => {
    const d = decideNightlyNotification({
      previous: { status: 'garbage' },
      current: { status: 'failure', failingTests: [A] },
    });
    assert.equal(d.post, true);
    assert.equal(d.reason, 'first-run');
  });
});

describe('formatChangeSummary', () => {
  it('is empty for a silent run', () => {
    const d = decideNightlyNotification({
      previous: red([A], 1),
      current: { status: 'failure', failingTests: [A] },
    });
    assert.equal(formatChangeSummary(d), '');
  });

  it('describes a recovery with the recovered tests', () => {
    const d = decideNightlyNotification({
      previous: red([A], 1),
      current: { status: 'success', failingTests: [] },
    });
    const text = formatChangeSummary(d);
    assert.match(text, /recovered — suite is green again/);
    assert.match(text, /\*\*Recovered \(1\):\*\*/);
    assert.match(
      text,
      new RegExp(`\`${A.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``),
    );
  });

  it('describes a regression and lists new failures', () => {
    const d = decideNightlyNotification({
      previous: green(),
      current: { status: 'failure', failingTests: [A, B] },
    });
    const text = formatChangeSummary(d);
    assert.match(text, /regression — suite went red/);
    assert.match(text, /\*\*New failures \(2\):\*\*/);
  });

  it('describes a digest with the streak length and the still-failing list', () => {
    const d = decideNightlyNotification({
      previous: red([A], DIGEST_EVERY - 1),
      current: { status: 'failure', failingTests: [A] },
    });
    const text = formatChangeSummary(d);
    assert.match(
      text,
      new RegExp(`${DIGEST_EVERY} consecutive identical red runs`),
    );
    assert.match(text, /\*\*Still failing \(1\):\*\*/);
  });

  it('truncates long lists', () => {
    const many = Array.from(
      { length: 15 },
      (_, i) => `spec-${String(i).padStart(2, '0')} › t`,
    );
    const d = decideNightlyNotification({
      previous: green(),
      current: { status: 'failure', failingTests: many },
    });
    const text = formatChangeSummary(d);
    assert.match(text, /…and 5 more/);
  });
});
