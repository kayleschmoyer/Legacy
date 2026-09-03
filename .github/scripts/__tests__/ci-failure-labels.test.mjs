/**
 * Unit tests for ci-failure-labels.js (LS-9637).
 *
 * Covers:
 *  - computeDesiredCiLabels: one label per failing/cancelled job; success,
 *    skipped, and missing results add nothing.
 *  - computeDesiredCiLabels: lint/formatting are decided by the `lint` job's
 *    two failure-excerpt outputs, independently of each other, with the
 *    excerpts-unknown fallback (flag both) when the job failed/cancelled but
 *    neither excerpt captured.
 *  - Regression for LS-9637 itself: `CI: Lint Failure` and `CI: Formatting`
 *    are members of ALL_CI_LABELS (the bug was that they were computed via
 *    the excerpt path but omitted from the set of labels this step clears).
 *  - computeFinalLabelSet / applyCiFailureLabels: the full
 *    fail → label added → fix pushed → check passes → label removed cycle,
 *    for CI: Lint Failure, CI: Formatting, and a JOB_RESULT_LABEL_MAP entry —
 *    and confirms non-CI labels (e.g. bot:ready-for-review) and legacy CI
 *    rollup labels are handled correctly (preserved / cleared respectively).
 *
 * Run via: node --test .github/scripts/__tests__/ci-failure-labels.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  JOB_RESULT_LABEL_MAP,
  ALL_CI_LABELS,
  computeDesiredCiLabels,
  computeFinalLabelSet,
  isRetryableLabelError,
  applyCiFailureLabels,
} = require(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../ci-failure-labels.js',
  ),
);

describe('ALL_CI_LABELS', () => {
  it('includes every JOB_RESULT_LABEL_MAP label', () => {
    for (const label of Object.keys(JOB_RESULT_LABEL_MAP)) {
      assert.ok(
        ALL_CI_LABELS.has(label),
        `expected ALL_CI_LABELS to contain ${label}`,
      );
    }
  });

  it('LS-9637 regression: includes CI: Lint Failure and CI: Formatting', () => {
    // These are computed from the lint job's excerpt outputs rather than
    // JOB_RESULT_LABEL_MAP, so they must be listed here explicitly — the
    // original bug was that they were left out of this set, meaning a stale
    // failure label was preserved forever by computeFinalLabelSet's
    // "not-a-recognized-CI-label" passthrough.
    assert.ok(ALL_CI_LABELS.has('CI: Lint Failure'));
    assert.ok(ALL_CI_LABELS.has('CI: Formatting'));
  });

  it('includes legacy rollup labels so they get cleared too', () => {
    assert.ok(ALL_CI_LABELS.has('CI: Lint & Format'));
    assert.ok(ALL_CI_LABELS.has('CI: Quality Gates'));
    assert.ok(ALL_CI_LABELS.has('CI: Type Error'));
  });
});

describe('computeDesiredCiLabels', () => {
  it('adds a label for each failing job', () => {
    const desired = computeDesiredCiLabels({
      'custom-checks': 'failure',
      test: 'success',
      build: 'success',
      e2e: 'success',
      lint: 'success',
    });
    assert.deepEqual(desired, ['CI: Migration Immutability']);
  });

  it('treats cancelled the same as failure', () => {
    const desired = computeDesiredCiLabels({
      'custom-checks': 'success',
      test: 'cancelled',
      build: 'success',
      e2e: 'success',
      lint: 'success',
    });
    assert.deepEqual(desired, ['CI: Test Failure']);
  });

  it('adds nothing for success, skipped, or missing results', () => {
    const desired = computeDesiredCiLabels({
      'custom-checks': 'success',
      test: 'skipped',
      build: undefined,
      e2e: 'success',
      lint: 'success',
    });
    assert.deepEqual(desired, []);
  });

  it('flags CI: Lint Failure and CI: Formatting independently from their excerpts', () => {
    const lintOnly = computeDesiredCiLabels(
      { lint: 'failure' },
      { lintExcerpt: 'lint error excerpt', formatExcerpt: '' },
    );
    assert.deepEqual(lintOnly, ['CI: Lint Failure']);

    const formatOnly = computeDesiredCiLabels(
      { lint: 'failure' },
      { lintExcerpt: '', formatExcerpt: 'format error excerpt' },
    );
    assert.deepEqual(formatOnly, ['CI: Formatting']);

    const both = computeDesiredCiLabels(
      { lint: 'failure' },
      {
        lintExcerpt: 'lint error excerpt',
        formatExcerpt: 'format error excerpt',
      },
    );
    assert.deepEqual(both, ['CI: Lint Failure', 'CI: Formatting']);
  });

  it('flags both lint labels when the job failed/cancelled but neither excerpt captured', () => {
    const desired = computeDesiredCiLabels(
      { lint: 'cancelled' },
      { lintExcerpt: '', formatExcerpt: '' },
    );
    assert.deepEqual(desired, ['CI: Lint Failure', 'CI: Formatting']);
  });

  it('does not flag lint labels when the lint job passed with no excerpts', () => {
    const desired = computeDesiredCiLabels(
      { lint: 'success' },
      { lintExcerpt: '', formatExcerpt: '' },
    );
    assert.deepEqual(desired, []);
  });
});

describe('computeFinalLabelSet', () => {
  it('LS-9637 regression: a stale CI: Lint Failure label is removed once lint passes', () => {
    // fail -> label added -> fix pushed -> check passes -> label removed
    const existingLabels = ['CI: Lint Failure', 'bot:ready-for-review'];
    const desiredCiLabels = computeDesiredCiLabels(
      { lint: 'success' },
      { lintExcerpt: '', formatExcerpt: '' },
    );
    const finalLabels = computeFinalLabelSet(existingLabels, desiredCiLabels);
    assert.deepEqual(finalLabels, ['bot:ready-for-review']);
  });

  it('LS-9637 regression: a stale CI: Formatting label is removed once formatting passes', () => {
    const existingLabels = ['CI: Formatting'];
    const desiredCiLabels = computeDesiredCiLabels(
      { lint: 'success' },
      { lintExcerpt: '', formatExcerpt: '' },
    );
    const finalLabels = computeFinalLabelSet(existingLabels, desiredCiLabels);
    assert.deepEqual(finalLabels, []);
  });

  it('removes a stale JOB_RESULT_LABEL_MAP label once its check passes', () => {
    const existingLabels = ['CI: Migration Immutability', 'CI: Test Failure'];
    const desiredCiLabels = computeDesiredCiLabels({
      'custom-checks': 'success',
      test: 'failure',
      build: 'success',
      e2e: 'success',
      lint: 'success',
    });
    const finalLabels = computeFinalLabelSet(existingLabels, desiredCiLabels);
    assert.deepEqual(finalLabels, ['CI: Test Failure']);
  });

  it('preserves non-CI labels untouched', () => {
    const existingLabels = [
      'bot:ready-for-review',
      'merge-when-ready',
      'CI: Test Failure',
    ];
    const desiredCiLabels = computeDesiredCiLabels({ test: 'success' });
    const finalLabels = computeFinalLabelSet(existingLabels, desiredCiLabels);
    assert.deepEqual(finalLabels, ['bot:ready-for-review', 'merge-when-ready']);
  });

  it('clears legacy rollup labels', () => {
    const existingLabels = [
      'CI: Lint & Format',
      'CI: Quality Gates',
      'CI: Type Error',
      'bug',
    ];
    const finalLabels = computeFinalLabelSet(existingLabels, []);
    assert.deepEqual(finalLabels, ['bug']);
  });
});

describe('isRetryableLabelError', () => {
  it('retries primary rate limits (429)', () => {
    assert.equal(isRetryableLabelError({ status: 429 }), true);
  });

  it('retries secondary rate limits (403 + message)', () => {
    assert.equal(
      isRetryableLabelError({
        status: 403,
        message: 'You have exceeded a secondary rate limit',
      }),
      true,
    );
  });

  it('does not retry an unrelated 403', () => {
    assert.equal(
      isRetryableLabelError({
        status: 403,
        message: 'Resource not accessible',
      }),
      false,
    );
  });

  it('does not retry other errors', () => {
    assert.equal(isRetryableLabelError({ status: 500 }), false);
    assert.equal(isRetryableLabelError(new Error('boom')), false);
  });
});

describe('applyCiFailureLabels', () => {
  function fakeGithub({ existingLabels, setLabelsCalls }) {
    return {
      rest: {
        pulls: {
          get: async () => ({
            data: { labels: existingLabels.map((name) => ({ name })) },
          }),
        },
        issues: {
          setLabels: async (args) => {
            setLabelsCalls.push(args);
            return { data: {} };
          },
        },
      },
    };
  }

  it('LS-9637 regression: end-to-end fail -> label added -> fix pushed -> check passes -> label removed', async () => {
    const setLabelsCalls = [];

    // Run 1: the lint job fails, no excerpt output yet distinguishes lint vs
    // format (mirrors a setup-time failure) — both labels get applied.
    const failRun = await applyCiFailureLabels({
      github: fakeGithub({
        existingLabels: ['bot:ready-for-review'],
        setLabelsCalls,
      }),
      owner: 'bkrupa',
      repo: 'legacy-sports',
      prNumber: 7298,
      jobResults: { lint: 'failure' },
      lintExcerpt: 'some/file.ts: unexpected token',
      formatExcerpt: '',
    });
    assert.deepEqual(
      failRun.finalLabels.sort(),
      ['CI: Lint Failure', 'bot:ready-for-review'].sort(),
    );
    assert.deepEqual(
      setLabelsCalls[0].labels.sort(),
      failRun.finalLabels.sort(),
    );

    // Run 2: a fix is pushed and lint now passes on the new head.
    const fixedRun = await applyCiFailureLabels({
      github: fakeGithub({
        existingLabels: failRun.finalLabels,
        setLabelsCalls,
      }),
      owner: 'bkrupa',
      repo: 'legacy-sports',
      prNumber: 7298,
      jobResults: { lint: 'success' },
      lintExcerpt: '',
      formatExcerpt: '',
    });
    assert.deepEqual(fixedRun.finalLabels, ['bot:ready-for-review']);
    assert.ok(
      !fixedRun.finalLabels.includes('CI: Lint Failure'),
      'CI: Lint Failure must be removed once lint passes on a later commit',
    );
  });
});
