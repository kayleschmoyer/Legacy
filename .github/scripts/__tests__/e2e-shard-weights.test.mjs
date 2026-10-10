/**
 * Tests for e2e-shard-weights.mjs (LS-11034) — the nightly refresh of the
 * per-spec duration weights behind the weighted e2e shard partition.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  collectDurations,
  EWMA_ALPHA,
  mergeProjectWeights,
  updateWeights,
} from '../e2e-shard-weights.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(
  __dirname,
  '../../../apps/web-e2e/src/e2e-shard-weights.json',
);

/** Minimal Playwright JSON report: one top-level suite per file. */
function report(files) {
  return {
    suites: Object.entries(files).map(([file, tests]) => ({
      title: file,
      file,
      specs: [],
      suites: [
        {
          title: 'describe',
          file,
          specs: tests.map(([projectName, durations]) => ({
            title: 't',
            tests: [
              {
                projectName,
                results: durations.map((duration) => ({ duration })),
              },
            ],
          })),
        },
      ],
    })),
  };
}

describe('collectDurations', () => {
  it('sums every attempt per file and project, in seconds', () => {
    const r = report({
      'a.spec.ts': [
        ['chromium', [1000, 2000]], // retried: both attempts count
        ['chromium', [500]],
        ['Mobile Chrome', [4000]],
      ],
      'shared/b.dual.spec.ts': [['chromium', [3000]]],
    });
    const out = collectDurations(r, ['chromium', 'Mobile Chrome']);
    assert.equal(out.get('chromium').get('a.spec.ts'), 3.5);
    assert.equal(out.get('chromium').get('shared/b.dual.spec.ts'), 3);
    assert.equal(out.get('Mobile Chrome').get('a.spec.ts'), 4);
  });

  it('ignores projects it was not asked for', () => {
    const r = report({
      'a.spec.ts': [
        ['Mobile Safari', [9000]],
        ['integration', [9000]],
      ],
    });
    const out = collectDurations(r, ['chromium']);
    assert.equal(out.get('chromium').size, 0);
    assert.equal(out.has('Mobile Safari'), false);
  });
});

describe('mergeProjectWeights', () => {
  it('blends a known spec with the moving average and adds new specs raw', () => {
    const { weights } = mergeProjectWeights(
      { 'a.spec.ts': 100 },
      new Map([
        ['a.spec.ts', 200],
        ['new.spec.ts', 42],
      ]),
    );
    assert.equal(
      weights['a.spec.ts'],
      EWMA_ALPHA * 200 + (1 - EWMA_ALPHA) * 100,
    );
    assert.equal(weights['new.spec.ts'], 42);
  });

  it('keeps unobserved specs when the run was partial (cancelled shard)', () => {
    const previous = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`s${i}.spec.ts`, 50]),
    );
    // Only 6/10 specs observed — e.g. one of the shards timed out.
    const observed = new Map(
      Array.from({ length: 6 }, (_, i) => [`s${i}.spec.ts`, 50]),
    );
    const { weights } = mergeProjectWeights(previous, observed);
    assert.equal(Object.keys(weights).length, 10);
    assert.equal(weights['s9.spec.ts'], 50);
  });

  it('prunes specs a complete run no longer sees (deleted or ignored)', () => {
    const previous = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`s${i}.spec.ts`, 50]),
    );
    const observed = new Map(
      Array.from({ length: 19 }, (_, i) => [`s${i}.spec.ts`, 50]),
    );
    const { weights } = mergeProjectWeights(previous, observed);
    assert.equal(weights['s19.spec.ts'], undefined);
    assert.equal(Object.keys(weights).length, 19);
  });

  it('floors weights at 1s and defaults to the median', () => {
    const { weights, defaultWeightSeconds } = mergeProjectWeights(
      {},
      new Map([
        ['skipped.spec.ts', 0],
        ['b.spec.ts', 10],
        ['c.spec.ts', 30],
      ]),
    );
    assert.equal(weights['skipped.spec.ts'], 1);
    assert.equal(defaultWeightSeconds, 10);
  });
});

describe('updateWeights', () => {
  it('carries a project over unchanged when the run did not exercise it', () => {
    const previous = {
      projects: {
        chromium: { defaultWeightSeconds: 5, weights: { 'a.spec.ts': 5 } },
        'Mobile Chrome': {
          defaultWeightSeconds: 7,
          weights: { 'a.spec.ts': 7 },
        },
      },
    };
    const next = updateWeights({
      previous,
      report: report({ 'a.spec.ts': [['chromium', [15000]]] }),
      projects: ['chromium', 'Mobile Chrome'],
      runId: '123',
    });
    assert.equal(next.projects.chromium.weights['a.spec.ts'], 10);
    assert.deepEqual(
      next.projects['Mobile Chrome'],
      previous.projects['Mobile Chrome'],
    );
    assert.equal(next.sourceRunId, '123');
  });

  it('bootstraps from an empty previous manifest', () => {
    const next = updateWeights({
      previous: {},
      report: report({ 'a.spec.ts': [['chromium', [2000]]] }),
      projects: ['chromium', 'Mobile Chrome'],
    });
    assert.deepEqual(next.projects.chromium.weights, { 'a.spec.ts': 2 });
    assert.equal(next.projects['Mobile Chrome'], undefined);
  });
});

describe('committed seed', () => {
  it('has weights for both nightly-sharded projects', () => {
    const seed = JSON.parse(readFileSync(SEED, 'utf8'));
    for (const project of ['chromium', 'Mobile Chrome']) {
      const p = seed.projects[project];
      assert.ok(p, `seed is missing project ${project}`);
      assert.ok(p.defaultWeightSeconds > 0);
      assert.ok(Object.keys(p.weights).length > 100);
    }
  });
});
