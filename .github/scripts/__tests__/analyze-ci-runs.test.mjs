/**
 * Unit tests for analyze-ci-runs.js (LS-1121).
 *
 * Covers:
 *  - computeStats: failure rate excludes cancelled/skipped runs from the
 *    denominator, buckets every conclusion (including in-flight runs with no
 *    conclusion yet), and flags `alert` only once the rate exceeds threshold.
 *  - renderBody: headline switches between alert/ok, and recent failures are
 *    listed newest-first up to 10.
 *
 * Run via: node --test .github/scripts/__tests__/analyze-ci-runs.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { computeStats, renderBody } = require('../analyze-ci-runs.js');

function run(id, conclusion, createdAt = '2026-09-01T00:00:00Z') {
  return {
    id,
    conclusion,
    status: conclusion ? 'completed' : 'in_progress',
    created_at: createdAt,
    html_url: `https://github.com/example/example/actions/runs/${id}`,
  };
}

describe('computeStats', () => {
  it('computes failure rate over completed runs only', () => {
    const runs = [
      run(1, 'success'),
      run(2, 'success'),
      run(3, 'failure'),
      run(4, 'failure'),
    ];
    const stats = computeStats(runs);
    assert.equal(stats.total, 4);
    assert.equal(stats.counted, 4);
    assert.equal(stats.failed, 2);
    assert.equal(stats.failureRate, 0.5);
  });

  it('excludes cancelled and skipped runs from the denominator', () => {
    const runs = [
      run(1, 'failure'),
      run(2, 'success'),
      run(3, 'cancelled'),
      run(4, 'skipped'),
    ];
    const stats = computeStats(runs);
    assert.equal(stats.total, 4);
    assert.equal(stats.counted, 2);
    assert.equal(stats.failed, 1);
    assert.equal(stats.failureRate, 0.5);
  });

  it('buckets in-flight runs (no conclusion yet) under in_progress', () => {
    const runs = [run(1, null), run(2, 'success')];
    const stats = computeStats(runs);
    assert.equal(stats.byConclusion.in_progress, 1);
    assert.equal(stats.counted, 1);
  });

  it('returns a zero rate with no counted runs instead of dividing by zero', () => {
    const stats = computeStats([run(1, 'cancelled')]);
    assert.equal(stats.counted, 0);
    assert.equal(stats.failureRate, 0);
    assert.equal(stats.alert, false);
  });

  it('flags alert only once failure rate exceeds threshold', () => {
    const runs = [
      run(1, 'failure'),
      run(2, 'success'),
      run(3, 'success'),
      run(4, 'success'),
      run(5, 'success'),
    ];
    const below = computeStats(runs, { alertThreshold: 0.2 });
    assert.equal(below.failureRate, 0.2);
    assert.equal(below.alert, false); // exactly at threshold is not "exceeds"

    const above = computeStats([...runs, run(6, 'failure')], {
      alertThreshold: 0.2,
    });
    assert.ok(above.failureRate > 0.2);
    assert.equal(above.alert, true);
  });
});

describe('renderBody', () => {
  it('renders the alert headline when over threshold', () => {
    const runs = [run(1, 'failure'), run(2, 'failure'), run(3, 'success')];
    const stats = computeStats(runs, { alertThreshold: 0.2 });
    const body = renderBody({ stats, runs, generatedAt: '2026-09-19' });
    assert.match(body, /🚨 Alert/);
    assert.match(body, /Recent failures/);
    assert.match(body, /#1/);
    assert.match(body, /#2/);
  });

  it('renders the ok headline when within threshold', () => {
    const runs = [run(1, 'success'), run(2, 'success')];
    const stats = computeStats(runs, { alertThreshold: 0.2 });
    const body = renderBody({ stats, runs, generatedAt: '2026-09-19' });
    assert.match(body, /✅ Failure rate/);
    assert.match(body, /None in this window/);
  });
});
