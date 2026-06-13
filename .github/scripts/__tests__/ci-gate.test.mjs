/**
 * Unit tests for ci-gate.js (LS-7991).
 *
 * Covers:
 *  - computeGateConclusion folds inputs: success iff EVERY folded input passes;
 *    skipped passes; failure/cancelled/timed_out/missing fail.
 *  - postCiGate posts the aggregate commit status on the happy path.
 *  - postCiGate SHA-currency guard no-ops when the PR head advanced.
 *  - postCiGate no-ops when there is no pull_request in the event payload.
 *
 * Run via: node --test .github/scripts/__tests__/ci-gate.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  CI_GATE_CONTEXT,
  GATE_INPUT_JOBS,
  computeGateConclusion,
  postCiGate,
} = require(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../ci-gate.js'),
);

const HEAD_SHA = 'abc123def456abc123def456abc123def456abc1';
const ADVANCED_SHA = 'def456abc123def456abc123def456abc123def4';

// All folded jobs passing.
function allPass() {
  return Object.fromEntries(GATE_INPUT_JOBS.map((j) => [j, 'success']));
}

const core = {
  info: () => {},
  warning: () => {},
  error: () => {},
};

// Minimal GitHub mock that records createCommitStatus calls and returns a
// configurable current head SHA from pulls.get.
function makeGithub({ currentSha = HEAD_SHA } = {}) {
  const calls = { statuses: [], get: 0 };
  const github = {
    rest: {
      pulls: {
        get: async () => {
          calls.get++;
          return { data: { head: { sha: currentSha } } };
        },
      },
      repos: {
        createCommitStatus: async (args) => {
          calls.statuses.push(args);
          return { data: {} };
        },
      },
    },
  };
  return { github, calls };
}

function makeContext(pr = { number: 7, head: { sha: HEAD_SHA } }) {
  return {
    repo: { owner: 'test-owner', repo: 'test-repo' },
    payload: pr ? { pull_request: pr } : {},
  };
}

// ── computeGateConclusion ─────────────────────────────────────────────────────

describe('ci-gate — computeGateConclusion folds inputs', () => {
  it('resolves success when every folded input passes', () => {
    const { conclusion, failing } = computeGateConclusion(allPass());
    assert.strictEqual(conclusion, 'success');
    assert.deepStrictEqual(failing, []);
  });

  it('treats skipped as passing (e.g. e2e skipped on no-web change)', () => {
    const results = { ...allPass(), e2e: 'skipped' };
    assert.strictEqual(computeGateConclusion(results).conclusion, 'success');
  });

  it('resolves failure when any input failed, listing the offender', () => {
    const results = { ...allPass(), test: 'failure' };
    const { conclusion, failing } = computeGateConclusion(results);
    assert.strictEqual(conclusion, 'failure');
    assert.ok(failing.some((f) => f.startsWith('test')));
  });

  it('treats cancelled as failure (the duplicate-cancelled root cause)', () => {
    const results = { ...allPass(), lint: 'cancelled' };
    const { conclusion, failing } = computeGateConclusion(results);
    assert.strictEqual(conclusion, 'failure');
    assert.ok(failing.some((f) => f.startsWith('lint')));
  });

  it('treats a missing required input as failure (fail-safe)', () => {
    const results = allPass();
    delete results.build;
    const { conclusion, failing } = computeGateConclusion(results);
    assert.strictEqual(conclusion, 'failure');
    assert.ok(failing.some((f) => f.startsWith('build (missing)')));
  });

  it('treats an unknown/empty status as failure', () => {
    const results = { ...allPass(), format: '' };
    assert.strictEqual(computeGateConclusion(results).conclusion, 'failure');
  });
});

// ── postCiGate ────────────────────────────────────────────────────────────────

describe('ci-gate — postCiGate posts the aggregate status', () => {
  it('posts success to the head SHA when all inputs pass and head is current', async () => {
    const { github, calls } = makeGithub({ currentSha: HEAD_SHA });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses.length, 1);
    const status = calls.statuses[0];
    assert.strictEqual(status.context, CI_GATE_CONTEXT);
    assert.strictEqual(status.state, 'success');
    assert.strictEqual(status.sha, HEAD_SHA);
  });

  it('posts failure when an input failed', async () => {
    const { github, calls } = makeGithub({ currentSha: HEAD_SHA });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), build: 'failure' },
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(calls.statuses[0].state, 'failure');
    assert.match(calls.statuses[0].description, /build/);
  });

  it('no-ops (posts nothing) when the PR head advanced — SHA-currency guard', async () => {
    const { github, calls } = makeGithub({ currentSha: ADVANCED_SHA });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'stale');
    assert.strictEqual(
      calls.statuses.length,
      0,
      'must not post a stale verdict when head advanced',
    );
  });

  it('no-ops when there is no pull_request in the event payload', async () => {
    const { github, calls } = makeGithub();
    const res = await postCiGate({
      github,
      context: makeContext(null),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'no-pr');
    assert.strictEqual(calls.statuses.length, 0);
    assert.strictEqual(calls.get, 0, 'should not re-fetch the PR when no PR');
  });

  it('truncates the failure description to the 140-char status limit', async () => {
    const { github, calls } = makeGithub({ currentSha: HEAD_SHA });
    // Force every job to fail so the joined description is long.
    const allFail = Object.fromEntries(
      GATE_INPUT_JOBS.map((j) => [j, 'failure']),
    );
    await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allFail,
    });
    assert.ok(calls.statuses[0].description.length <= 140);
  });
});
