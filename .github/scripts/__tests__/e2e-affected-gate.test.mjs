/**
 * Unit tests for e2e-affected-gate.js (LS-9889).
 *
 * Covers:
 *  - success/skipped pass outright for both shards.
 *  - a genuine failure/timed_out/action_required (non-cancelled, non-pass)
 *    result fails the gate with the original hermetic-regression wording,
 *    unaffected by any check-run lookup.
 *  - a `cancelled` result with a sibling run's `success` check-run for the
 *    same shard context on the same head SHA passes (the PR #7585 shape).
 *  - a `cancelled` result with no successful sibling anywhere on the SHA
 *    fails, with a message naming the cancellation (not "regression").
 *  - a `cancelled` result only consults check runs matching its own shard
 *    prefix — a sibling success for the OTHER shard does not paper over it.
 *  - the check-runs lookup only happens when at least one result is
 *    `cancelled` (no wasted API calls on a clean pass or a real failure).
 *  - a check-runs lookup error fails closed (treated as no sibling success).
 *
 * Run via: node --test .github/scripts/__tests__/e2e-affected-gate.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { evaluateShard, evaluateE2eAffectedGate } = require(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../e2e-affected-gate.js',
  ),
);

const CI = '\u{1F680} CI Pipeline /';
const HEAD_SHA = 'abc123def456abc123def456abc123def456abc1';

/** Terse check-run factory: name, conclusion, and a completion timestamp. */
function checkRun(name, conclusion, completedAt, status = 'completed') {
  return {
    name,
    status,
    conclusion,
    started_at: completedAt,
    completed_at: conclusion === null ? null : completedAt,
  };
}

describe('evaluateShard', () => {
  it('passes outright on success', () => {
    const result = evaluateShard('e2e', 'success', []);
    assert.equal(result.pass, true);
  });

  it('passes outright on skipped', () => {
    const result = evaluateShard('e2e-mobile', 'skipped', []);
    assert.equal(result.pass, true);
  });

  it('fails a genuine failure with the hermetic-regression wording', () => {
    const result = evaluateShard('e2e', 'failure', []);
    assert.equal(result.pass, false);
    assert.match(result.message, /hermetic e2e regression/);
  });

  it('fails timed_out the same way as failure (not treated as cancelled)', () => {
    const result = evaluateShard('e2e-mobile', 'timed_out', []);
    assert.equal(result.pass, false);
    assert.match(result.message, /hermetic e2e regression/);
  });

  it('cancelled with a sibling success on the same shard context passes', () => {
    const checkRuns = [
      checkRun(
        `${CI} E2E Tests (Shard 1/3)`,
        'success',
        '2026-09-04T17:16:00Z',
      ),
    ];
    const result = evaluateShard('e2e', 'cancelled', checkRuns);
    assert.equal(result.pass, true);
    assert.match(result.message, /sibling run/);
  });

  it('cancelled with no successful sibling anywhere fails with the cancellation wording', () => {
    const checkRuns = [
      checkRun(
        `${CI} E2E Tests (Shard 1/3)`,
        'cancelled',
        '2026-09-04T17:00:00Z',
      ),
    ];
    const result = evaluateShard('e2e', 'cancelled', checkRuns);
    assert.equal(result.pass, false);
    assert.match(result.message, /cancelled and never/);
    assert.doesNotMatch(result.message, /hermetic e2e regression/);
  });

  it('cancelled with no check runs at all fails with the cancellation wording', () => {
    const result = evaluateShard('e2e-mobile', 'cancelled', []);
    assert.equal(result.pass, false);
    assert.match(result.message, /cancelled and never/);
  });

  it("a sibling success for the OTHER shard does not satisfy this shard's cancellation", () => {
    const checkRuns = [
      checkRun(
        `${CI} E2E Tests (Mobile Chrome 1/3)`,
        'success',
        '2026-09-04T17:16:00Z',
      ),
    ];
    const result = evaluateShard('e2e', 'cancelled', checkRuns);
    assert.equal(result.pass, false);
  });

  it('only the LATEST completed check run for a shard name decides the verdict', () => {
    const checkRuns = [
      checkRun(
        `${CI} E2E Tests (Shard 1/3)`,
        'cancelled',
        '2026-09-04T17:00:00Z',
      ),
      checkRun(
        `${CI} E2E Tests (Shard 1/3)`,
        'success',
        '2026-09-04T17:16:00Z',
      ),
    ];
    const result = evaluateShard('e2e', 'cancelled', checkRuns);
    assert.equal(result.pass, true);
  });
});

describe('evaluateE2eAffectedGate', () => {
  function fakeGithub(checkRuns) {
    return {
      paginate: async (route, params) => {
        assert.equal(params.ref, HEAD_SHA);
        return checkRuns;
      },
      rest: {
        checks: { listForRef: () => ({ data: { check_runs: checkRuns } }) },
      },
    };
  }

  it('passes when both shards succeed, without ever listing check runs', async () => {
    let paginateCalls = 0;
    const github = fakeGithub([]);
    github.paginate = async () => {
      paginateCalls++;
      return [];
    };
    const { pass } = await evaluateE2eAffectedGate({
      github,
      owner: 'bkrupa',
      repo: 'legacy-sports',
      sha: HEAD_SHA,
      e2eResult: 'success',
      e2eMobileResult: 'skipped',
    });
    assert.equal(pass, true);
    assert.equal(paginateCalls, 0, 'no cancelled result means no API call');
  });

  it('reproduces the PR #7585 shape: union across two runs is green', async () => {
    // This run's own view: shard 1 cancelled, mobile shards 2 and 3 cancelled.
    // A sibling run's check-runs (fetched here) show those exact contexts
    // succeeding.
    const checkRuns = [
      checkRun(
        `${CI} E2E Tests (Shard 1/3)`,
        'success',
        '2026-09-04T17:16:00Z',
      ),
      checkRun(
        `${CI} E2E Tests (Mobile Chrome 2/3)`,
        'success',
        '2026-09-04T17:16:30Z',
      ),
      checkRun(
        `${CI} E2E Tests (Mobile Chrome 3/3)`,
        'success',
        '2026-09-04T17:16:45Z',
      ),
    ];
    const { pass, messages } = await evaluateE2eAffectedGate({
      github: fakeGithub(checkRuns),
      owner: 'bkrupa',
      repo: 'legacy-sports',
      sha: HEAD_SHA,
      e2eResult: 'cancelled',
      e2eMobileResult: 'cancelled',
    });
    assert.equal(pass, true);
    assert.equal(messages.length, 2);
  });

  it('fails when a shard is cancelled and no sibling anywhere succeeded', async () => {
    const { pass, messages } = await evaluateE2eAffectedGate({
      github: fakeGithub([]),
      owner: 'bkrupa',
      repo: 'legacy-sports',
      sha: HEAD_SHA,
      e2eResult: 'cancelled',
      e2eMobileResult: 'success',
    });
    assert.equal(pass, false);
    assert.match(messages[0], /cancelled and never/);
  });

  it('fails closed when the check-runs lookup errors', async () => {
    const github = fakeGithub([]);
    github.paginate = async () => {
      throw new Error('checks API down');
    };
    const warnings = [];
    const { pass } = await evaluateE2eAffectedGate({
      github,
      core: { warning: (m) => warnings.push(m) },
      owner: 'bkrupa',
      repo: 'legacy-sports',
      sha: HEAD_SHA,
      e2eResult: 'cancelled',
      e2eMobileResult: 'success',
    });
    assert.equal(pass, false);
    assert.equal(warnings.length, 1);
  });

  it('a real failure on one shard fails the gate even if the other is a satisfied cancellation', async () => {
    const checkRuns = [
      checkRun(
        `${CI} E2E Tests (Shard 1/3)`,
        'success',
        '2026-09-04T17:16:00Z',
      ),
    ];
    const { pass, messages } = await evaluateE2eAffectedGate({
      github: fakeGithub(checkRuns),
      owner: 'bkrupa',
      repo: 'legacy-sports',
      sha: HEAD_SHA,
      e2eResult: 'cancelled',
      e2eMobileResult: 'failure',
    });
    assert.equal(pass, false);
    assert.match(messages[1], /hermetic e2e regression/);
  });
});
