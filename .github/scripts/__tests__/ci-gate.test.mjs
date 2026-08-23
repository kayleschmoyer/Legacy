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
 *  - LS-9565: the run-recency guard also inspects the superseding run's
 *    `🚀 CI Pipeline` JOB. A run that concluded `success` overall but whose
 *    pipeline job was short-circuited by check-prior-success posts no verdict
 *    and must not silence the run that actually ran CI.
 *
 * Run via: node --test .github/scripts/__tests__/ci-gate.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  CI_GATE_CONTEXT,
  CI_PIPELINE_JOB_NAME,
  GATE_INPUT_JOBS,
  MAX_SUPERSEDING_RUN_INSPECTIONS,
  computeGateConclusion,
  runIdFromTargetUrl,
  isRetryableStatusError,
  cancelledJobHadRealFailure,
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

/**
 * LS-9565: the job rows of a run whose `🚀 CI Pipeline` job was short-circuited
 * by the `check-prior-success` guard. Mirrors the real shape of run
 * 32586165378 on PR #7212 — every other job succeeded, so the RUN concluded
 * `success` while no CI executed.
 */
function skippedPipelineJobs() {
  return [
    {
      name: '🔍 Determine Workflow Scope',
      status: 'completed',
      conclusion: 'success',
    },
    { name: CI_PIPELINE_JOB_NAME, status: 'completed', conclusion: 'skipped' },
    {
      name: '🔐 Security Scanning / Security Gate',
      status: 'completed',
      conclusion: 'success',
    },
  ];
}

/** The job rows of a run that actually ran the pipeline (nested job names). */
function ranPipelineJobs() {
  return [
    {
      name: '🔍 Determine Workflow Scope',
      status: 'completed',
      conclusion: 'success',
    },
    {
      name: `${CI_PIPELINE_JOB_NAME} / lint & format`,
      status: 'completed',
      conclusion: 'success',
    },
    {
      name: `${CI_PIPELINE_JOB_NAME} / Summarize & Report`,
      status: 'completed',
      conclusion: 'success',
    },
  ];
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
  // LS-9565: per-run job listings, keyed by run id. A run absent from this map
  // resolves to `[]` — no `🚀 CI Pipeline` job row, which reads as "this run
  // runs the pipeline and will post", the pre-LS-9565 behaviour. Also serves
  // LS-9467's e2e/e2e-mobile job (with steps[]) lookups on the SAME run —
  // e.g. { [SELF_RUN_ID]: [{ name: 'E2E Tests (Shard 1/1)', conclusion: 'cancelled', steps: [...] }] }.
  jobsByRunId = {},
  jobsError = null,
  // LS-9359: queue of errors createCommitStatus throws on successive calls,
  // consumed one per attempt (shift). Once empty, calls succeed normally.
  createStatusErrors = [],
} = {}) {
  const calls = {
    statuses: [],
    get: 0,
    listRuns: 0,
    listStatuses: 0,
    listJobs: [],
  };
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
        listJobsForWorkflowRun: async ({ run_id }) => {
          calls.listJobs.push(run_id);
          if (jobsError) throw new Error(jobsError);
          return { data: { jobs: jobsByRunId[run_id] || [] } };
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

// ── LS-9467: cancelledJobHadRealFailure ─────────────────────────────────────

describe('ci-gate — cancelledJobHadRealFailure (LS-9467)', () => {
  it('returns false for a job key with no CANCELLABLE_TEST_JOB_NAME_PREFIX entry', async () => {
    const { github } = makeGithub();
    const result = await cancelledJobHadRealFailure({
      github,
      core,
      owner: 'test-owner',
      repo: 'test-repo',
      runId: SELF_RUN_ID,
      jobKey: 'lint',
    });
    assert.strictEqual(result, false);
  });

  it('detects a real failing step behind a cancelled e2e job (PR #6909 shape)', async () => {
    const { github } = makeGithub({
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            name: '🚀 CI Pipeline / E2E Tests (Shard 1/1)',
            conclusion: 'cancelled',
            steps: [
              { name: 'E2E Testing', conclusion: 'success' },
              { name: 'E2E Tests (affected specs)', conclusion: 'failure' },
              { name: 'Upload Blob Report to S3', conclusion: 'success' },
            ],
          },
        ],
      },
    });
    const result = await cancelledJobHadRealFailure({
      github,
      core,
      owner: 'test-owner',
      repo: 'test-repo',
      runId: SELF_RUN_ID,
      jobKey: 'e2e',
    });
    assert.strictEqual(result, true);
  });

  it('returns false for a cancelled job whose steps never recorded a failure (LS-8219 shape)', async () => {
    const { github } = makeGithub({
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            name: '🚀 CI Pipeline / E2E Tests (Shard 1/1)',
            conclusion: 'cancelled',
            steps: [
              { name: 'E2E Testing', conclusion: 'success' },
              { name: 'Upload Blob Report to S3', conclusion: 'success' },
            ],
          },
        ],
      },
    });
    const result = await cancelledJobHadRealFailure({
      github,
      core,
      owner: 'test-owner',
      repo: 'test-repo',
      runId: SELF_RUN_ID,
      jobKey: 'e2e',
    });
    assert.strictEqual(result, false);
  });

  it('checks every matrix shard, not just the first', async () => {
    const { github } = makeGithub({
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            name: '🚀 CI Pipeline / E2E Tests (Shard 1/3)',
            conclusion: 'success',
            steps: [{ name: 'E2E Testing', conclusion: 'success' }],
          },
          {
            name: '🚀 CI Pipeline / E2E Tests (Shard 2/3)',
            conclusion: 'cancelled',
            steps: [{ name: 'E2E Testing', conclusion: 'failure' }],
          },
        ],
      },
    });
    const result = await cancelledJobHadRealFailure({
      github,
      core,
      owner: 'test-owner',
      repo: 'test-repo',
      runId: SELF_RUN_ID,
      jobKey: 'e2e',
    });
    assert.strictEqual(result, true);
  });

  it('fails OPEN (false) when the Jobs API errors', async () => {
    const { github } = makeGithub({ jobsError: 'API is down' });
    const result = await cancelledJobHadRealFailure({
      github,
      core,
      owner: 'test-owner',
      repo: 'test-repo',
      runId: SELF_RUN_ID,
      jobKey: 'e2e',
    });
    assert.strictEqual(result, false);
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

  it('regression: PR #6909 — posts FAILURE when a cancelled e2e job actually had a failing step (LS-9467)', async () => {
    // Reproduces the exact production sequence: the gating run's own e2e job
    // hit its job timeout in the narrow window after "E2E Tests (affected
    // specs)" had already recorded `failure`, so needs.e2e.result rolled up
    // to `cancelled`. Pre-fix, the LS-8219 exclusion folded that as "not a
    // failure" and CI Gate posted `success`, letting the broken spec merge.
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            name: '🚀 CI Pipeline / E2E Tests (Shard 1/1)',
            conclusion: 'cancelled',
            steps: [
              { name: 'E2E Testing', conclusion: 'success' },
              { name: 'E2E Tests (affected specs)', conclusion: 'failure' },
              { name: 'Upload Blob Report to S3', conclusion: 'success' },
              { name: 'Complete job', conclusion: 'success' },
            ],
          },
        ],
      },
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), e2e: 'cancelled' },
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(
      calls.statuses[0].state,
      'failure',
      'a cancelled job that actually failed a step must still fail the gate',
    );
    assert.match(calls.statuses[0].description, /e2e/);
  });

  it('still excludes a cleanly-cancelled job with no failing step (LS-8219 preserved alongside LS-9467)', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            name: '🚀 CI Pipeline / E2E Tests (Shard 1/1)',
            conclusion: 'cancelled',
            steps: [{ name: 'E2E Testing', conclusion: 'success' }],
          },
        ],
      },
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), e2e: 'cancelled' },
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses[0].state, 'success');
    assert.deepStrictEqual(res.ignored, ['e2e']);
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

// ── LS-9565: a superseding run whose CI Pipeline JOB was skipped ──────────────

describe('ci-gate — a newer run that skipped its pipeline does not supersede (LS-9565)', () => {
  it('regression: PR #7212 — posts success when the newer run SKIPPED its CI Pipeline job', async () => {
    // The exact production sequence on 42f31fc. Run 32585173510
    // (workflow_dispatch) ran the full pipeline green. Run 32586165378
    // (pull_request_review: approved) was created 20 minutes later, its
    // check-prior-success guard short-circuited `🚀 CI Pipeline`, and the run
    // still concluded `success` overall. The run-level filter therefore let it
    // supersede, the green run withheld, and 42f31fc ended up with NO CI Gate.
    const GREEN_RUN = 32585173510;
    const SKIPPED_PIPELINE_RUN = 32586165378;
    const saved = process.env.GITHUB_RUN_ID;
    process.env.GITHUB_RUN_ID = String(GREEN_RUN);
    try {
      const { github, calls } = makeGithub({
        runs: [
          { id: GREEN_RUN, name: CI_WORKFLOW, conclusion: 'success' },
          {
            id: SKIPPED_PIPELINE_RUN,
            name: CI_WORKFLOW,
            conclusion: 'success',
          },
        ],
        jobsByRunId: { [SKIPPED_PIPELINE_RUN]: skippedPipelineJobs() },
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
        'the run that actually ran CI must post its verdict',
      );
      assert.strictEqual(calls.statuses[0].state, 'success');
      assert.deepStrictEqual(
        calls.listJobs,
        [SKIPPED_PIPELINE_RUN],
        'the superseding candidate must be probed at the job level',
      );
    } finally {
      process.env.GITHUB_RUN_ID = saved;
    }
  });

  it('STILL withholds when the newer run actually RAN its pipeline', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
        { id: NEWER_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
      ],
      jobsByRunId: { [NEWER_RUN_ID]: ranPipelineJobs() },
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
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('withholds for an in-flight newer run whose pipeline job has not resolved yet', async () => {
    // The `🚀 CI Pipeline` row exists but is still queued — determine-scope has
    // not decided whether to short-circuit. It may yet run CI and post, so the
    // guard must keep deferring to it.
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
      jobsByRunId: {
        [NEWER_RUN_ID]: [
          { name: CI_PIPELINE_JOB_NAME, status: 'queued', conclusion: null },
        ],
      },
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

  it('walks past several skipped-pipeline runs to the newest real one', async () => {
    // Label churn plus an approval can stack multiple non-posting runs above the
    // gating run. Only the first candidate that will actually speak counts.
    const REAL_NEWER = SELF_RUN_ID + 10;
    const SKIPPED_A = SELF_RUN_ID + 20;
    const SKIPPED_B = SELF_RUN_ID + 30;
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
        { id: REAL_NEWER, name: CI_WORKFLOW, conclusion: 'success' },
        { id: SKIPPED_A, name: CI_WORKFLOW, conclusion: 'success' },
        { id: SKIPPED_B, name: CI_WORKFLOW, conclusion: 'success' },
      ],
      jobsByRunId: {
        [SKIPPED_A]: skippedPipelineJobs(),
        [SKIPPED_B]: skippedPipelineJobs(),
        [REAL_NEWER]: ranPipelineJobs(),
      },
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.supersededBy, REAL_NEWER);
    assert.deepStrictEqual(
      calls.listJobs,
      [SKIPPED_B, SKIPPED_A, REAL_NEWER],
      'candidates are probed newest-first and the walk stops at the real run',
    );
  });

  it('posts success when EVERY newer run skipped its pipeline', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
        { id: NEWER_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
      ],
      jobsByRunId: { [NEWER_RUN_ID]: skippedPipelineJobs() },
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

  it('fails CLOSED — a newer run whose jobs lookup errors still supersedes', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
        { id: NEWER_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
      ],
      jobsError: 'API is down',
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'superseded-run');
    assert.strictEqual(
      calls.statuses.length,
      0,
      'an unreadable newer run must not be assumed silent',
    );
  });

  it('fails CLOSED — stops probing past the inspection cap', async () => {
    const extras = Array.from(
      { length: MAX_SUPERSEDING_RUN_INSPECTIONS + 2 },
      (_, i) => ({
        id: SELF_RUN_ID + 10 * (i + 1),
        name: CI_WORKFLOW,
        conclusion: 'success',
      }),
    );
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
        ...extras,
      ],
      // Every candidate skipped its pipeline — without the cap the guard would
      // probe all of them and post.
      jobsByRunId: Object.fromEntries(
        extras.map((r) => [r.id, skippedPipelineJobs()]),
      ),
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'superseded-run');
    assert.strictEqual(
      calls.listJobs.length,
      MAX_SUPERSEDING_RUN_INSPECTIONS,
      'the guard must not probe more candidates than the cap allows',
    );
  });

  it('does not spend a jobs lookup when the run-level filter already excludes the run', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
        { id: NEWER_RUN_ID, name: CI_WORKFLOW, conclusion: 'cancelled' },
      ],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, true);
    assert.deepStrictEqual(calls.listJobs, []);
  });

  it('the CI Pipeline job name matches ci-orchestrator.yml (drift guard)', async () => {
    // CI_PIPELINE_JOB_NAME is matched against the live Actions jobs listing, so
    // renaming the orchestrator job without updating the constant would silently
    // reopen LS-9565: no job would match and every skipped-pipeline run would go
    // back to superseding.
    const orchestrator = await readFile(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../workflows/ci-orchestrator.yml',
      ),
      'utf8',
    );
    assert.match(
      orchestrator,
      new RegExp(`^\\s+name:\\s*"${CI_PIPELINE_JOB_NAME}"\\s*$`, 'm'),
      `ci-orchestrator.yml no longer declares a job named "${CI_PIPELINE_JOB_NAME}"`,
    );
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
