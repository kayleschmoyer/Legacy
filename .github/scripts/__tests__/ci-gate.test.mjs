/**
 * Unit tests for ci-gate.js (LS-7991).
 *
 * Covers:
 *  - computeGateConclusion folds inputs: success iff EVERY folded input passes;
 *    skipped passes; failure/cancelled/timed_out/missing fail.
 *  - postCiGate posts the aggregate commit status on the happy path.
 *  - postCiGate SHA-currency guard no-ops when the PR head advanced.
 *  - postCiGate no-ops when there is no pull_request in the event payload.
 *  - LS-9378 run-recency guard: a `failure` verdict may always be posted, but a
 *    `success` verdict must prove it is the newest word on the SHA, so a
 *    re-run of a superseded run can never replay stale green over newer red.
 *  - LS-9359: createCommitStatus retries transient rate-limit/5xx errors and
 *    degrades to a no-op (rather than throwing) once retries are exhausted, so
 *    a rate-limit blip can never fail the summarize job outright.
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
  runIdFromTargetUrl,
  isRetryableStatusError,
  postCiGate,
} = require(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../ci-gate.js'),
);

const HEAD_SHA = 'abc123def456abc123def456abc123def456abc1';
const ADVANCED_SHA = 'def456abc123def456abc123def456abc123def4';

// LS-9378: run ids are compared to establish verdict recency. `SELF_RUN_ID` is
// the run under test; OLDER/NEWER bracket it.
const SELF_RUN_ID = 5000;
const OLDER_RUN_ID = 4000;
const NEWER_RUN_ID = 6000;
const CI_WORKFLOW = 'Legacy Sports CI Orchestrator';

process.env.GITHUB_RUN_ID = String(SELF_RUN_ID);

/** A `CI Gate` commit status as returned by listCommitStatusesForRef. */
function gateStatus(state, runId) {
  return {
    context: CI_GATE_CONTEXT,
    state,
    target_url: `https://github.com/test-owner/test-repo/actions/runs/${runId}`,
  };
}

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
//
// LS-9378: also serves the two recency lookups. Defaults describe the ordinary
// case — this run is the only CI run for the SHA and no gate status exists yet —
// so the pre-existing tests exercise the unguarded happy path unchanged.
function makeGithub({
  currentSha = HEAD_SHA,
  runs = [{ id: SELF_RUN_ID, name: CI_WORKFLOW }],
  existingStatuses = [],
  runsError = null,
  statusesError = null,
  // LS-9359: queue of errors createCommitStatus throws on successive calls,
  // consumed one per attempt (shift). Once empty, calls succeed normally.
  createStatusErrors = [],
} = {}) {
  const calls = { statuses: [], get: 0, listRuns: 0, listStatuses: 0 };
  const github = {
    rest: {
      pulls: {
        get: async () => {
          calls.get++;
          return { data: { head: { sha: currentSha } } };
        },
      },
      actions: {
        listWorkflowRunsForRepo: async () => {
          calls.listRuns++;
          if (runsError) throw new Error(runsError);
          return { data: { workflow_runs: runs } };
        },
      },
      repos: {
        createCommitStatus: async (args) => {
          if (createStatusErrors.length > 0) {
            throw createStatusErrors.shift();
          }
          calls.statuses.push(args);
          return { data: {} };
        },
        listCommitStatusesForRef: async () => {
          calls.listStatuses++;
          if (statusesError) throw new Error(statusesError);
          return { data: existingStatuses };
        },
      },
    },
  };
  return { github, calls };
}

/** Build an Octokit-shaped error with a `status` code, per real error objects. */
function statusError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
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

  it('excludes cancelled jobs from the verdict — NOT a failure (LS-8219)', () => {
    // A cancelled granular job is a superseded/post-merge duplicate, not a real
    // failure. With every other job passing the gate must resolve success.
    const results = { ...allPass(), lint: 'cancelled' };
    const { conclusion, failing, ignored } = computeGateConclusion(results);
    assert.strictEqual(conclusion, 'success');
    assert.deepStrictEqual(failing, []);
    assert.deepStrictEqual(ignored, ['lint']);
  });

  it('cancelled duplicate + superseding success → SUCCESS, not FAILURE (LS-8219 regression)', () => {
    // Reproduces PR #5540 / #5098 / #5440 / #5465: a post-merge override run (or
    // concurrency-cancelled duplicate) is SIGINT'd mid-flight, so its granular
    // jobs report `cancelled` even though every test project had already passed.
    // The aggregate must NOT latch a fresh red on the (already-green) SHA.
    const results = {
      ...allPass(),
      test: 'cancelled', // exit-130 SIGINT after all Jest projects passed
      e2e: 'cancelled', // concurrency-cancelled duplicate shard
    };
    const { conclusion, failing, ignored } = computeGateConclusion(results);
    assert.strictEqual(conclusion, 'success');
    assert.deepStrictEqual(failing, []);
    assert.deepStrictEqual(ignored.sort(), ['e2e', 'test']);
  });

  it('a real failure alongside a cancelled job still fails (cancelled excluded, failure counted)', () => {
    const results = { ...allPass(), test: 'cancelled', build: 'failure' };
    const { conclusion, failing, ignored } = computeGateConclusion(results);
    assert.strictEqual(conclusion, 'failure');
    assert.ok(failing.some((f) => f.startsWith('build')));
    assert.ok(!failing.some((f) => f.startsWith('test')));
    assert.deepStrictEqual(ignored, ['test']);
  });

  it('treats a missing required input as failure (fail-safe)', () => {
    const results = allPass();
    delete results.build;
    const { conclusion, failing } = computeGateConclusion(results);
    assert.strictEqual(conclusion, 'failure');
    assert.ok(failing.some((f) => f.startsWith('build (missing)')));
  });

  it('treats an unknown/empty status as failure', () => {
    const results = { ...allPass(), lint: '' };
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

  it('posts SUCCESS (not FAILURE) for a cancelled post-merge duplicate run (LS-8219 regression)', async () => {
    // The SHA is still current (the gating run already merged it) but a duplicate
    // post-merge run was SIGINT'd, so its jobs report `cancelled`. The aggregate
    // must post success — never a fresh red — for this already-green SHA.
    const { github, calls } = makeGithub({ currentSha: HEAD_SHA });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), test: 'cancelled', e2e: 'cancelled' },
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(
      calls.statuses[0].state,
      'success',
      'a cancelled duplicate run must not post a fresh FAILURE on a green SHA',
    );
    assert.strictEqual(calls.statuses[0].sha, HEAD_SHA);
    assert.deepStrictEqual(res.ignored.sort(), ['e2e', 'test']);
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

  // ── LS-9148: workflow_dispatch / ci:run-label dispatch fallback ──────────

  it('posts using explicit prNumber/headSha when there is no payload PR (workflow_dispatch, LS-9148)', async () => {
    const { github, calls } = makeGithub({ currentSha: HEAD_SHA });
    const res = await postCiGate({
      github,
      context: makeContext(null),
      core,
      results: allPass(),
      prNumber: 7,
      headSha: HEAD_SHA,
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(calls.statuses[0].sha, HEAD_SHA);
    assert.strictEqual(calls.statuses[0].state, 'success');
    assert.strictEqual(
      calls.get,
      1,
      'should still re-fetch the PR to apply the SHA-currency guard',
    );
  });

  it('the payload PR takes precedence over explicit prNumber/headSha when both are present', async () => {
    const OTHER_SHA = '1111111111111111111111111111111111111111';
    const { github, calls } = makeGithub({ currentSha: HEAD_SHA });
    const res = await postCiGate({
      github,
      context: makeContext({ number: 7, head: { sha: HEAD_SHA } }),
      core,
      results: allPass(),
      prNumber: 99,
      headSha: OTHER_SHA,
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses[0].sha, HEAD_SHA);
  });

  it('no-ops when prNumber is given without headSha', async () => {
    const { github, calls } = makeGithub();
    const res = await postCiGate({
      github,
      context: makeContext(null),
      core,
      results: allPass(),
      prNumber: 7,
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'no-pr');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('applies the SHA-currency guard to the explicit-prNumber path too', async () => {
    const { github, calls } = makeGithub({ currentSha: ADVANCED_SHA });
    const res = await postCiGate({
      github,
      context: makeContext(null),
      core,
      results: allPass(),
      prNumber: 7,
      headSha: HEAD_SHA,
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'stale');
    assert.strictEqual(calls.statuses.length, 0);
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

// ── LS-9378: run-recency guard ────────────────────────────────────────────────

describe('ci-gate — runIdFromTargetUrl', () => {
  it('extracts the run id from an Actions run URL', () => {
    assert.strictEqual(
      runIdFromTargetUrl(
        'https://github.com/test-owner/test-repo/actions/runs/31462018381',
      ),
      31462018381,
    );
  });

  it('returns null for a missing, non-string, or non-Actions URL', () => {
    assert.strictEqual(runIdFromTargetUrl(undefined), null);
    assert.strictEqual(runIdFromTargetUrl(null), null);
    assert.strictEqual(runIdFromTargetUrl(''), null);
    assert.strictEqual(
      runIdFromTargetUrl('https://example.com/whatever'),
      null,
    );
  });
});

describe('ci-gate — a success verdict must be current (LS-9378)', () => {
  it('posts success when this run is the newest CI run for the SHA', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: OLDER_RUN_ID, name: CI_WORKFLOW },
        { id: SELF_RUN_ID, name: CI_WORKFLOW },
      ],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses[0].state, 'success');
  });

  it('WITHHOLDS success when a newer CI run exists for the SHA', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW },
        { id: NEWER_RUN_ID, name: CI_WORKFLOW },
      ],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'superseded-run');
    assert.strictEqual(res.supersededBy, NEWER_RUN_ID);
    assert.strictEqual(
      calls.statuses.length,
      0,
      'a superseded run must not replay its stale green verdict',
    );
  });

  it('STILL posts failure when a newer CI run exists — red is always safe', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW },
        { id: NEWER_RUN_ID, name: CI_WORKFLOW },
      ],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), e2e: 'failure' },
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses[0].state, 'failure');
    assert.strictEqual(
      calls.listRuns,
      0,
      'the recency lookups are for success verdicts only',
    );
  });

  it('WITHHOLDS success when a newer run already posted a red gate', async () => {
    // The runs listing is incomplete (pagination / API lag) but the newer run's
    // red verdict is visible in the statuses — guard (B) must still catch it.
    const { github, calls } = makeGithub({
      runs: [{ id: SELF_RUN_ID, name: CI_WORKFLOW }],
      existingStatuses: [gateStatus('failure', NEWER_RUN_ID)],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'newer-failure-posted');
    assert.strictEqual(res.supersededBy, NEWER_RUN_ID);
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('ALLOWS success when the red gate came from an OLDER run (legitimate re-run to green)', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: OLDER_RUN_ID, name: CI_WORKFLOW },
        { id: SELF_RUN_ID, name: CI_WORKFLOW },
      ],
      existingStatuses: [gateStatus('failure', OLDER_RUN_ID)],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses[0].state, 'success');
  });

  it('ignores newer runs from OTHER workflows (e.g. Deploy) when judging recency', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW },
        { id: NEWER_RUN_ID, name: 'Deploy' },
      ],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses[0].state, 'success');
  });

  it('ignores a newer run that will never post a verdict (scoped-out label run)', async () => {
    // The orchestrator emits an extra run per `pull_request` label event that
    // scopes out and concludes `skipped`. It can carry a higher run id than the
    // real gating run, but it never posts — so treating it as superseding would
    // strand the SHA with no `CI Gate` status at all.
    for (const conclusion of ['skipped', 'cancelled', 'neutral']) {
      const { github, calls } = makeGithub({
        runs: [
          { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
          { id: NEWER_RUN_ID, name: CI_WORKFLOW, conclusion },
        ],
      });
      const res = await postCiGate({
        github,
        context: makeContext(),
        core,
        results: allPass(),
      });

      assert.strictEqual(
        res.posted,
        true,
        `a newer '${conclusion}' run must not block the real verdict`,
      );
      assert.strictEqual(calls.statuses[0].state, 'success');
    }
  });

  it('an in-flight newer run (conclusion null) DOES supersede — it will post', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
        {
          id: NEWER_RUN_ID,
          name: CI_WORKFLOW,
          status: 'in_progress',
          conclusion: null,
        },
      ],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'superseded-run');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('fails CLOSED — withholds success when the runs lookup errors', async () => {
    const { github, calls } = makeGithub({ runsError: 'API is down' });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'run-lookup-failed');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('fails CLOSED — withholds success when the statuses lookup errors', async () => {
    const { github, calls } = makeGithub({ statusesError: 'API is down' });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'status-lookup-failed');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('fails CLOSED — withholds success when GITHUB_RUN_ID is unavailable', async () => {
    const saved = process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_RUN_ID;
    try {
      const { github, calls } = makeGithub();
      const res = await postCiGate({
        github,
        context: makeContext(),
        core,
        results: allPass(),
      });

      assert.strictEqual(res.posted, false);
      assert.strictEqual(res.reason, 'unknown-run-id');
      assert.strictEqual(calls.statuses.length, 0);
    } finally {
      process.env.GITHUB_RUN_ID = saved;
    }
  });

  it('regression: PR #7006 — a re-run of the older run cannot overwrite the newer failure', async () => {
    // Reproduces the exact production sequence. Run 31462018381 posted
    // `failure` (e2e) for 735d003; the OLDER run 31458492265 was then re-run
    // ~35h later and re-posted its own stale `success`, which became the latest
    // status and let the merge queue land a red PR.
    const OLDER_GREEN_RUN = 31458492265;
    const NEWER_RED_RUN = 31462018381;
    const saved = process.env.GITHUB_RUN_ID;
    process.env.GITHUB_RUN_ID = String(OLDER_GREEN_RUN);
    try {
      const { github, calls } = makeGithub({
        runs: [
          { id: OLDER_GREEN_RUN, name: CI_WORKFLOW },
          { id: NEWER_RED_RUN, name: CI_WORKFLOW },
        ],
        existingStatuses: [gateStatus('failure', NEWER_RED_RUN)],
      });

      // The older run's own view of the world: everything it ran passed.
      const res = await postCiGate({
        github,
        context: makeContext(),
        core,
        results: allPass(),
      });

      assert.strictEqual(res.posted, false);
      assert.strictEqual(res.reason, 'superseded-run');
      assert.strictEqual(res.supersededBy, NEWER_RED_RUN);
      assert.strictEqual(
        calls.statuses.length,
        0,
        'the stale green verdict that merged PR #7006 must not be posted',
      );
    } finally {
      process.env.GITHUB_RUN_ID = saved;
    }
  });
});

// ── LS-9359: createCommitStatus rate-limit/5xx resilience ─────────────────────

describe('ci-gate — isRetryableStatusError classifies transient errors', () => {
  it('treats installation rate-limit 403s as retryable', () => {
    assert.strictEqual(
      isRetryableStatusError(
        statusError(403, 'API rate limit exceeded for installation'),
      ),
      true,
    );
  });

  it('treats 429 as retryable', () => {
    assert.strictEqual(
      isRetryableStatusError(statusError(429, 'too many')),
      true,
    );
  });

  it('treats 5xx as retryable', () => {
    assert.strictEqual(
      isRetryableStatusError(statusError(502, 'bad gateway')),
      true,
    );
  });

  it('does not retry a non-rate-limit 403 (e.g. permissions)', () => {
    assert.strictEqual(
      isRetryableStatusError(statusError(403, 'Resource not accessible')),
      false,
    );
  });

  it('does not retry a 404 or other 4xx', () => {
    assert.strictEqual(
      isRetryableStatusError(statusError(404, 'not found')),
      false,
    );
  });

  it('does not retry an error with no status code', () => {
    assert.strictEqual(isRetryableStatusError(new Error('boom')), false);
  });
});

describe('ci-gate — postCiGate survives createCommitStatus rate-limit/5xx blips', () => {
  it('retries a transient rate-limit error and posts on the next attempt', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      createStatusErrors: [
        statusError(403, 'API rate limit exceeded for installation'),
      ],
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(
      calls.statuses.length,
      1,
      'the retried attempt posts once',
    );
    assert.strictEqual(calls.statuses[0].state, 'success');
  });

  it('degrades to a no-op instead of throwing once retries are exhausted', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      // withStatusRetry defaults to 2 retries (3 attempts total) — exhaust all.
      createStatusErrors: [
        statusError(500, 'internal server error'),
        statusError(500, 'internal server error'),
        statusError(500, 'internal server error'),
      ],
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(
      res.posted,
      false,
      'must not throw — a missed post degrades to posted: false',
    );
    assert.strictEqual(res.reason, 'status-post-failed');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('does not retry a non-transient error — fails fast', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      createStatusErrors: [statusError(422, 'unprocessable')],
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'status-post-failed');
    assert.strictEqual(calls.statuses.length, 0);
  });
});
