/**
 * Unit tests for resolve-conflict-check-run.mjs (LS-7992).
 *
 * The base-push sweep must be idempotent: a second sweep against the same head
 * SHA has to UPDATE the existing "No Merge Conflicts" check-run rather than
 * create a new one, so a SHA never accumulates duplicate terminal runs of a
 * required-check name (LS-7988).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  pickReusableCheckRunId,
  parseCheckRuns,
} from '../resolve-conflict-check-run.mjs';

const NAME = 'No Merge Conflicts';

describe('pickReusableCheckRunId', () => {
  it('returns null when no check-runs exist yet (first sweep creates one)', () => {
    assert.equal(pickReusableCheckRunId([], NAME), null);
  });

  it('reuses the existing run id on a second sweep (updates, not creates)', () => {
    // First sweep created run 100 on this SHA; the second sweep must reuse it.
    const afterFirstSweep = [{ id: 100, name: NAME, status: 'completed' }];
    assert.equal(pickReusableCheckRunId(afterFirstSweep, NAME), 100);
  });

  it('reuses the newest matching run when duplicates already exist', () => {
    // Pre-existing duplication (the bug being fixed): converge on the newest id
    // so subsequent sweeps stop branching to fresh runs.
    const runs = [
      { id: 100, name: NAME, status: 'completed' },
      { id: 250, name: NAME, status: 'completed' },
      { id: 175, name: NAME, status: 'completed' },
    ];
    assert.equal(pickReusableCheckRunId(runs, NAME), 250);
  });

  it('ignores check-runs with a different name', () => {
    const runs = [
      { id: 1, name: '🚀 CI Pipeline / test', status: 'completed' },
      { id: 2, name: 'Verify All Migrations Applied', status: 'completed' },
    ];
    assert.equal(pickReusableCheckRunId(runs, NAME), null);
  });

  it('reuses the matching run even when other names are present', () => {
    const runs = [
      { id: 1, name: '🚀 CI Pipeline / test', status: 'completed' },
      { id: 42, name: NAME, status: 'in_progress' },
    ];
    assert.equal(pickReusableCheckRunId(runs, NAME), 42);
  });

  it('skips entries without an integer id', () => {
    const runs = [
      { id: '99', name: NAME },
      { id: null, name: NAME },
      { name: NAME },
    ];
    assert.equal(pickReusableCheckRunId(runs, NAME), null);
  });

  it('returns null for invalid arguments', () => {
    assert.equal(pickReusableCheckRunId(null, NAME), null);
    assert.equal(pickReusableCheckRunId(undefined, NAME), null);
    assert.equal(pickReusableCheckRunId([{ id: 1, name: NAME }], ''), null);
    assert.equal(pickReusableCheckRunId([{ id: 1, name: NAME }], null), null);
  });
});

describe('parseCheckRuns', () => {
  it('unwraps the Checks API envelope', () => {
    const raw = JSON.stringify({
      total_count: 1,
      check_runs: [{ id: 7, name: NAME }],
    });
    assert.deepEqual(parseCheckRuns(raw), [{ id: 7, name: NAME }]);
  });

  it('accepts a bare array', () => {
    const raw = JSON.stringify([{ id: 7, name: NAME }]);
    assert.deepEqual(parseCheckRuns(raw), [{ id: 7, name: NAME }]);
  });

  it('returns an empty array for empty, malformed, or non-object input', () => {
    assert.deepEqual(parseCheckRuns(''), []);
    assert.deepEqual(parseCheckRuns('   '), []);
    assert.deepEqual(parseCheckRuns('not json'), []);
    assert.deepEqual(parseCheckRuns('42'), []);
    assert.deepEqual(parseCheckRuns(null), []);
  });

  it('round-trips an envelope into a reusable id (second-sweep path)', () => {
    // End-to-end of what the workflow pipes: gh api output → reusable id.
    const raw = JSON.stringify({ check_runs: [{ id: 321, name: NAME }] });
    assert.equal(pickReusableCheckRunId(parseCheckRuns(raw), NAME), 321);
  });
});
