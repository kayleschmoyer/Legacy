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
  GATE_JOB_LEAF_NAMES,
  jobNameMatchesGateKey,
  runIdFromTargetUrl,
  isRetryableStatusError,
  rateLimitResetWaitMs,
  withStatusRetry,
  RATE_LIMIT_MAX_WAIT_MS,
  cancelledJobHadRealFailure,
  postCiGate,
  seedPendingCiGate,
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

// A no-op `core`. The bodies return `undefined` explicitly rather than being
// empty (`() => {}`), which @typescript-eslint/no-empty-function rejects once
// this file is in the affected set.
const core = {
  info: () => undefined,
  warning: () => undefined,
  error: () => undefined,
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
  // LS-9591: queue of errors listWorkflowRunsForRepo throws on successive
  // calls (consumed one per attempt, shift), so a transient rate-limit blip
  // can be proven to recover via withStatusRetry. Takes precedence over the
  // simpler always-throws `runsError` above when non-empty.
  runsErrors = [],
  // LS-9565: per-run job listings, keyed by run id. A run absent from this map
  // resolves to `[]` — no `🚀 CI Pipeline` job row, which reads as "this run
  // runs the pipeline and will post", the pre-LS-9565 behaviour. Also serves
  // LS-9467's e2e/e2e-mobile job (with steps[]) lookups on the SAME run —
  // e.g. { [SELF_RUN_ID]: [{ name: 'E2E Tests (Shard 1/1)', conclusion: 'cancelled', steps: [...] }] }.
  jobsByRunId = {},
  jobsError = null,
  // LS-10140: job-log bodies keyed by job id, served to
  // downloadJobLogsForWorkflowRun. A job absent from this map 404s, exactly as
  // GitHub does (BlobNotFound) for a job that never produced output — which is
  // itself the "never ran" signal classifyCancelledJob keys on.
  jobLogsById = {},
  jobLogsError = null,
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
    jobLogs: [],
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
          if (runsErrors.length > 0) throw runsErrors.shift();
          if (runsError) throw new Error(runsError);
          return { data: { workflow_runs: runs } };
        },
        listJobsForWorkflowRun: async ({ run_id }) => {
          calls.listJobs.push(run_id);
          if (jobsError) throw new Error(jobsError);
          return { data: { jobs: jobsByRunId[run_id] || [] } };
        },
        downloadJobLogsForWorkflowRun: async ({ job_id }) => {
          calls.jobLogs.push(job_id);
          if (jobLogsError) throw jobLogsError;
          if (!(job_id in jobLogsById)) {
            throw statusError(404, 'Not Found');
          }
          return { data: jobLogsById[job_id] };
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

  it('never folds a cancelled job as FAILURE (LS-8219)', () => {
    // A cancelled granular job is a superseded/post-merge duplicate or a job
    // the runner died under — not a real failure, and never red.
    const results = { ...allPass(), lint: 'cancelled' };
    const { conclusion, failing, cancelled, ignored } =
      computeGateConclusion(results);
    assert.notStrictEqual(conclusion, 'failure');
    assert.deepStrictEqual(failing, []);
    assert.deepStrictEqual(cancelled, ['lint']);
    assert.deepStrictEqual(ignored, ['lint'], '`ignored` stays an alias');
  });

  it('a cancelled job yields NO-VERDICT, not success — it never spoke (LS-10140)', () => {
    // LS-8219 excluded `cancelled` from the verdict entirely, which made a
    // cancelled job indistinguishable from a passing one: with every other
    // input green the gate claimed "All CI checks passed" for checks that had
    // not run. Neither terminal state is honest, so the fold resolves
    // `no-verdict` and postCiGate turns that into a merge-blocking PENDING.
    const results = {
      ...allPass(),
      test: 'cancelled', // exit-130 SIGINT after all Jest projects passed
      e2e: 'cancelled', // concurrency-cancelled duplicate shard
    };
    const { conclusion, failing, cancelled } = computeGateConclusion(results);
    assert.strictEqual(conclusion, 'no-verdict');
    assert.deepStrictEqual(failing, []);
    assert.deepStrictEqual(cancelled.sort(), ['e2e', 'test']);
  });

  it('NEGATIVE CONTROL: no cancellations means no no-verdict — green stays green', () => {
    assert.strictEqual(computeGateConclusion(allPass()).conclusion, 'success');
  });

  it('NEGATIVE CONTROL: a real failure alongside a cancelled job still FAILS — failure outranks no-verdict', () => {
    const results = { ...allPass(), test: 'cancelled', build: 'failure' };
    const { conclusion, failing, cancelled } = computeGateConclusion(results);
    assert.strictEqual(conclusion, 'failure');
    assert.ok(failing.some((f) => f.startsWith('build')));
    assert.ok(!failing.some((f) => f.startsWith('test')));
    assert.deepStrictEqual(cancelled, ['test']);
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

  it('posts nothing for a cancelled post-merge duplicate on an already-green SHA (LS-8219 regression)', async () => {
    // The SHA is still current (the gating run already merged it) but a
    // duplicate post-merge run was SIGINT'd, so its jobs report `cancelled`.
    // A cancelled run carries no evidence: it must not post a fresh red (the
    // original LS-8219 symptom) and — since LS-10140 gave cancellations their
    // own PENDING state — it must not downgrade the standing green either.
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      existingStatuses: [gateStatus('success', OLDER_RUN_ID)],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), test: 'cancelled', e2e: 'cancelled' },
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'terminal-verdict-exists');
    assert.strictEqual(
      calls.statuses.length,
      0,
      'a cancelled duplicate must neither redden nor un-green a SHA a real run already ruled on',
    );
    assert.deepStrictEqual(res.cancelled.sort(), ['e2e', 'test']);
  });

  it('posts PENDING — not red, not green — for a cancelled job on a SHA with no verdict yet (LS-10140)', async () => {
    // PR #7976 run 34722062338: "🚀 CI Pipeline / test" waited 18 minutes for a
    // ci-runner it never got and was cancelled with ZERO steps and no log
    // blob. Nothing failed; nothing passed either. The gate must say exactly
    // that, and a pending required context blocks the merge on its own
    // (merge-queue-processor.js's validateStatusChecks counts it as inProgress).
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            id: 991,
            name: '🚀 CI Pipeline / test',
            conclusion: 'cancelled',
            steps: [],
          },
        ],
      },
      // job 991 is absent from jobLogsById → the mock 404s, as GitHub does.
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), test: 'cancelled' },
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(calls.statuses[0].state, 'pending');
    assert.strictEqual(res.cancelClassifications.test, 'never-ran');
    assert.match(
      calls.statuses[0].description,
      /never-ran/,
      'the description must name the cause so the author can read it off the required check itself',
    );
  });

  it('classifies a mid-install runner shutdown and still posts PENDING (LS-10140, PR #7976 case 2)', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            id: 992,
            name: '🚀 CI Pipeline / custom-checks',
            conclusion: 'cancelled',
            steps: [
              { name: 'Set up job', conclusion: 'success' },
              { name: 'Setup Workspace', conclusion: 'cancelled' },
            ],
          },
        ],
      },
      jobLogsById: {
        992:
          '##[error]The runner has received a shutdown signal.\n' +
          '##[error]The operation was canceled.',
      },
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), 'custom-checks': 'cancelled' },
    });

    assert.strictEqual(calls.statuses[0].state, 'pending');
    assert.strictEqual(
      res.cancelClassifications['custom-checks'],
      'runner-shutdown',
    );
  });

  it('NEGATIVE CONTROL: a cancelled job that ran test bodies and FAILED still posts red (LS-10140)', async () => {
    // The load-bearing AC: the pending path must never become a way to launder
    // a genuine break. This is the LS-9467 / PR #6909 shape, now checked for
    // every gate input rather than only the two matrix ones.
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            id: 993,
            name: '🚀 CI Pipeline / test',
            conclusion: 'cancelled',
            steps: [
              { name: 'Set up job', conclusion: 'success' },
              { name: 'Run Tests', conclusion: 'failure' },
            ],
          },
        ],
      },
      jobLogsById: {
        993:
          '##[error]The runner has received a shutdown signal.\n' +
          '##[error]The operation was canceled.',
      },
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), test: 'cancelled' },
    });

    assert.strictEqual(calls.statuses[0].state, 'failure');
    assert.ok(res.failing.some((f) => f.startsWith('test')));
    assert.strictEqual(
      calls.jobLogs.length,
      0,
      'a job whose steps already record a failure needs no log download',
    );
  });

  it('a deliberate/superseding cancel is PENDING too — never a silent green (LS-10140)', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            id: 994,
            name: '🚀 CI Pipeline / build',
            conclusion: 'cancelled',
            steps: [{ name: 'Set up job', conclusion: 'success' }],
          },
        ],
      },
      jobLogsById: {
        994:
          '##[error]The operation was canceled.\n' +
          '##[error]The runner has received a shutdown signal.',
      },
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), build: 'cancelled' },
    });

    assert.strictEqual(calls.statuses[0].state, 'pending');
    assert.strictEqual(res.cancelClassifications.build, 'deliberate-cancel');
  });

  it('withholds the pending post when a terminal FAILURE already stands (LS-10140)', async () => {
    // Amber over red would hide a real break behind an in-flight-looking gate.
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      existingStatuses: [gateStatus('failure', OLDER_RUN_ID)],
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), test: 'cancelled' },
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'terminal-verdict-exists');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('overwrites the seeded pending — a seed is not a terminal verdict (LS-10140)', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      existingStatuses: [gateStatus('pending', OLDER_RUN_ID)],
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), test: 'cancelled' },
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses[0].state, 'pending');
  });

  it('fails CLOSED — withholds the pending post when the statuses lookup errors (LS-10140)', async () => {
    // seedPendingCiGate has already left a pending status on the SHA, so a
    // withheld pending is never a silently-absent gate; overwriting a verdict
    // we could not read would be the riskier direction.
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      statusesError: 'boom',
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), test: 'cancelled' },
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'status-lookup-failed');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('an unclassifiable cancellation (jobs lookup errors) still posts PENDING, never green (LS-10140)', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsError: 'jobs api down',
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), test: 'cancelled' },
    });

    assert.strictEqual(calls.statuses[0].state, 'pending');
    assert.strictEqual(res.cancelClassifications.test, 'no-signal');
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

  it('a cleanly-cancelled job with no failing step is still NOT a failure (LS-8219 preserved alongside LS-9467)', async () => {
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
    assert.notStrictEqual(
      calls.statuses[0].state,
      'failure',
      'LS-8219: a clean cancellation must never post red',
    );
    // LS-10140: and it is no longer laundered into green either — the job
    // produced no verdict, so the gate says so and blocks with PENDING.
    assert.strictEqual(calls.statuses[0].state, 'pending');
    assert.deepStrictEqual(res.cancelled, ['e2e']);
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

  it('LS-9754: WITHHOLDS failure when a newer run already posted success — a stale flake must not outrank an already-green sibling', async () => {
    // Reproduces PR #7374: two full duplicate runs on the same head SHA (the
    // bug LS-9754's concurrency-group fix prevents at the source). The newer
    // duplicate (by run id) already posted a clean success; this (older) run's
    // own isolated E2E flake must not be allowed to post failure over it.
    const { github, calls } = makeGithub({
      existingStatuses: [gateStatus('success', NEWER_RUN_ID)],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), e2e: 'failure' },
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'newer-success-posted');
    assert.strictEqual(res.supersededBy, NEWER_RUN_ID);
    assert.strictEqual(
      calls.statuses.length,
      0,
      'a stale failure must not overwrite an already-posted newer success',
    );
  });

  it('LS-9754: still posts failure when the newer status is itself a failure (no newer success to defer to)', async () => {
    const { github, calls } = makeGithub({
      existingStatuses: [gateStatus('failure', NEWER_RUN_ID)],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), e2e: 'failure' },
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses[0].state, 'failure');
  });

  it('LS-9754: still posts failure when the only newer success belongs to an OLDER run — must not withhold on a stale/older success', async () => {
    const { github, calls } = makeGithub({
      existingStatuses: [gateStatus('success', OLDER_RUN_ID)],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), e2e: 'failure' },
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses[0].state, 'failure');
  });

  it('LS-9754: fails OPEN and still posts failure when the currency check itself errors — a real failure must always be visible', async () => {
    const { github, calls } = makeGithub({
      statusesError: 'API is down',
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), e2e: 'failure' },
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses[0].state, 'failure');
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

  it("LS-9754: a newer run that is still QUEUED (not started) does NOT supersede — it's blocked behind this run's own SHA-keyed concurrency slot", async () => {
    // Reproduces the interaction between LS-9754's head-SHA-keyed concurrency
    // group and the pre-existing LS-9378 recency guard: a pull_request_review
    // event landing while the synchronize-triggered run is still executing now
    // queues behind it (same SHA => same group) instead of running in
    // parallel. Withholding this run's green verdict just because that queued
    // sibling exists forces the sibling's own check-prior-success guard to
    // find no posted CI Gate and re-run the entire pipeline from scratch —
    // trading LS-9754's parallel-duplicate waste for a sequential-duplicate
    // one. A queued run cannot be racing this one, so it must not supersede.
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
        {
          id: NEWER_RUN_ID,
          name: CI_WORKFLOW,
          status: 'queued',
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

    assert.strictEqual(res.posted, true);
    assert.strictEqual(res.state, 'success');
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(calls.statuses[0].state, 'success');
  });

  it("LS-9754 regression: a newer run whose status is PENDING (not 'queued') still does NOT supersede", async () => {
    // Reproduced live on PR #7830 itself, one run after the 'queued'-only fix
    // above landed: the concurrency-blocked sibling's actual GitHub Actions
    // API status was `pending`, a distinct value from `queued` in GitHub's
    // run-status enum — so the first fix's exact-string check on 'queued'
    // alone missed it, and the identical wasteful sequential re-run happened
    // again one run later. `pending`, `waiting`, and `requested` all mean the
    // same thing as `queued` here: no job has started, so a same-SHA sibling
    // in any of these states cannot be racing this run.
    for (const status of ['pending', 'waiting', 'requested']) {
      const { github, calls } = makeGithub({
        runs: [
          { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
          { id: NEWER_RUN_ID, name: CI_WORKFLOW, status, conclusion: null },
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
        `a newer run with status '${status}' must not block the real verdict`,
      );
      assert.strictEqual(calls.statuses[0].state, 'success');
    }
  });

  it('LS-9591: never posts success when the runs lookup errors, but registers a visible pending verdict rather than leaving the SHA with no CI Gate context at all', async () => {
    const { github, calls } = makeGithub({ runsError: 'API is down' });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    // Never a false success — the API error did not confirm currency.
    assert.notStrictEqual(res.state, 'success');
    assert.strictEqual(res.posted, true);
    assert.strictEqual(res.state, 'pending');
    assert.strictEqual(res.reason, 'run-lookup-failed');
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(calls.statuses[0].state, 'pending');
    assert.match(calls.statuses[0].description, /run-lookup-failed/);
  });

  it('LS-9591: never posts success when the statuses lookup errors, but registers a visible pending verdict rather than leaving the SHA with no CI Gate context at all', async () => {
    const { github, calls } = makeGithub({ statusesError: 'API is down' });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.notStrictEqual(res.state, 'success');
    assert.strictEqual(res.posted, true);
    assert.strictEqual(res.state, 'pending');
    assert.strictEqual(res.reason, 'status-lookup-failed');
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(calls.statuses[0].state, 'pending');
    assert.match(calls.statuses[0].description, /status-lookup-failed/);
  });

  it('LS-9591: a transient rate-limit blip on the runs lookup recovers via retry and posts success normally', async () => {
    const { github, calls } = makeGithub({
      runsErrors: [statusError(403, 'API rate limit exceeded')],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(res.state, 'success');
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(calls.statuses[0].state, 'success');
  });

  it('LS-9591: a confirmed newer run (not an API error) still gets the silent no-op — that run owns the verdict', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
        { id: NEWER_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
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
    assert.strictEqual(
      calls.statuses.length,
      0,
      'a genuinely superseding run must not get a redundant pending post — it will post its own verdict',
    );
  });

  it("LS-9579: a newer run that COMPLETED but never posted any CI Gate status does not block forever — an older re-run's success comes through", async () => {
    // The newest run's own `createCommitStatus` call exhausted its retries
    // (e.g. installation rate limit) and, under continue-on-error, the job
    // still concluded 'success' having posted NOTHING. That run will never
    // speak again — so an older re-run computing the same green verdict must
    // not withhold forever "because the newer run's verdict stands".
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW },
        {
          id: NEWER_RUN_ID,
          name: CI_WORKFLOW,
          status: 'completed',
          conclusion: 'success',
        },
      ],
      existingStatuses: [],
    });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });

    assert.strictEqual(res.posted, true);
    assert.strictEqual(res.state, 'success');
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(calls.statuses[0].state, 'success');
  });

  it('LS-9579: a newer run still IN PROGRESS has not had its chance yet and still supersedes', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW },
        {
          id: NEWER_RUN_ID,
          name: CI_WORKFLOW,
          status: 'in_progress',
          conclusion: null,
        },
      ],
      existingStatuses: [],
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

  it('LS-9579: a newer COMPLETED run that already posted (even a non-terminal state) still supersedes normally', async () => {
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW },
        {
          id: NEWER_RUN_ID,
          name: CI_WORKFLOW,
          status: 'completed',
          conclusion: 'success',
        },
      ],
      existingStatuses: [gateStatus('pending', NEWER_RUN_ID)],
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

  it('LS-9579 safety: a newer COMPLETED run that FAILED and never posted still supersedes — never replay stale success over an unposted real failure', async () => {
    // A run's `conclusion` can read 'failure' for two reasons that look
    // identical from the outside: a genuine GATE_INPUT_JOBS failure (lint,
    // test, build, ...), or an unrelated failure elsewhere in the run (e.g.
    // the failure-labeling step) while the real CI content passed. Only a
    // 'success' conclusion proves the latter — a 'failure' conclusion must
    // never be treated as "silently would have been success", or an older
    // run's stale green could overwrite a real, unposted red verdict
    // (exactly the PR #7006 danger LS-9378 exists to prevent).
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW },
        {
          id: NEWER_RUN_ID,
          name: CI_WORKFLOW,
          status: 'completed',
          conclusion: 'failure',
        },
      ],
      existingStatuses: [],
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
      'must not post a stale success over a completed run that failed and never posted',
    );
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

// ── LS-9811: a not-yet-started pull_request_review candidate does not strand
// the SHA ──────────────────────────────────────────────────────────────────

describe('ci-gate — a not-yet-started pull_request_review run does not supersede (LS-9811)', () => {
  it('regression: PR #7499 — posts success when the newer candidate has ZERO jobs and is a pull_request_review run', async () => {
    // The exact production sequence. Run 33598992411 (the real, fully-green CI
    // run) reached summarize with run 33599197673 — the pull_request_review
    // orchestrator run fired by the Reviewer Bot's approval — sitting at
    // status=pending with ZERO jobs for 20+ minutes (runner saturation).
    // pipelineJobWasSkipped found no jobs at all to inspect and failed CLOSED,
    // withholding the real run's verdict in favour of a candidate whose own
    // check-prior-success step was guaranteed to short-circuit once it ran —
    // stranding the SHA with no CI Gate status at all.
    const REAL_RUN = 33598992411;
    const PENDING_REVIEW_RUN = 33599197673;
    const saved = process.env.GITHUB_RUN_ID;
    process.env.GITHUB_RUN_ID = String(REAL_RUN);
    try {
      const { github, calls } = makeGithub({
        runs: [
          { id: REAL_RUN, name: CI_WORKFLOW, conclusion: 'success' },
          {
            id: PENDING_REVIEW_RUN,
            name: CI_WORKFLOW,
            event: 'pull_request_review',
            status: 'pending',
            conclusion: null,
          },
        ],
        // No jobsByRunId entry for PENDING_REVIEW_RUN — it resolves to `[]`,
        // reproducing "sat pending with ZERO jobs" exactly.
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
        'the real, fully-green run must post its verdict rather than being ' +
          'stranded behind a pull_request_review candidate that will never speak',
      );
      assert.strictEqual(calls.statuses[0].state, 'success');
      assert.deepStrictEqual(
        calls.listJobs,
        [],
        'LS-9754 (the NOT_YET_STARTED_RUN_STATUSES check in ' +
          'assertSuccessIsCurrent) already filters out a `pending` candidate ' +
          'for this exact SHA before the loop ever reaches pipelineJobWasSkipped ' +
          "— it is provably blocked behind this run's own SHA-keyed " +
          'concurrency slot (ci-orchestrator.yml) and cannot be running ' +
          'concurrently, so no job-level probe is needed at all. The ' +
          "candidate's job list is therefore never fetched; only the " +
          'run-level check fires.',
      );
    } finally {
      process.env.GITHUB_RUN_ID = saved;
    }
  });

  it('does not withhold for a not-yet-started candidate that is NOT a pull_request_review run either, because the SHA-keyed concurrency group makes it provably non-racing regardless of event (LS-9754)', async () => {
    // A genuine workflow_dispatch re-run or a fresh pull_request-triggered run
    // that has not started a single job for THIS SHA is blocked behind this
    // run's own concurrency slot (ci-orchestrator.yml's `group:` is keyed
    // purely on head SHA, independent of triggering event) and its
    // check-prior-success step applies to every trigger type — so it is safe
    // to ignore regardless of event, not just for pull_request_review. See
    // the NOT_YET_STARTED_RUN_STATUSES doc comment.
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
        {
          id: NEWER_RUN_ID,
          name: CI_WORKFLOW,
          event: 'workflow_dispatch',
          status: 'queued',
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

    assert.strictEqual(res.posted, true);
    assert.strictEqual(calls.statuses[0].state, 'success');
    assert.deepStrictEqual(
      calls.listJobs,
      [],
      'filtered out by the run-level NOT_YET_STARTED_RUN_STATUSES check ' +
        'before any job-level probe',
    );
  });

  it('STILL withholds for an IN-PROGRESS candidate that is NOT a pull_request_review run and has not created the pipeline job yet', async () => {
    // Unlike a not-yet-started candidate, an `in_progress` run has genuinely
    // begun — it is not blocked by the SHA-keyed concurrency group and may
    // finish and post before this run does. The LS-9811 prediction in
    // pipelineJobWasSkipped is scoped tightly to `pull_request_review`
    // precisely so a genuinely-running, different-event candidate like this
    // one keeps failing closed.
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
        {
          id: NEWER_RUN_ID,
          name: CI_WORKFLOW,
          event: 'workflow_dispatch',
          status: 'in_progress',
          conclusion: null,
        },
      ],
      // No jobsByRunId entry for NEWER_RUN_ID — it resolves to `[]`, i.e. it
      // has started but has not yet created the '🚀 CI Pipeline' job.
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
    assert.deepStrictEqual(
      calls.listJobs,
      [NEWER_RUN_ID],
      'an in_progress candidate is not filtered by the run-level check, so ' +
        'it must still be probed at the job level',
    );
  });

  it('STILL withholds for a COMPLETED pull_request_review candidate that never created the pipeline job', async () => {
    // A candidate that has already finished (here with a run-level `failure`,
    // so the unrelated LS-9579 "completed successfully but never posted"
    // allowance does not also explain the result) without ever creating '🚀 CI
    // Pipeline' is not the in-flight stranding scenario the LS-9811 prediction
    // covers — keep the pre-existing fail-closed default for it.
    const { github, calls } = makeGithub({
      runs: [
        { id: SELF_RUN_ID, name: CI_WORKFLOW, conclusion: 'success' },
        {
          id: NEWER_RUN_ID,
          name: CI_WORKFLOW,
          event: 'pull_request_review',
          status: 'completed',
          conclusion: 'failure',
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
    assert.strictEqual(res.supersededBy, NEWER_RUN_ID);
    assert.strictEqual(calls.statuses.length, 0);
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

// ── LS-10322: wait for the rate-limit reset; a lost verdict fails the job ─────

function rateLimitError(headers) {
  const err = statusError(403, 'API rate limit exceeded for installation');
  err.response = { headers };
  return err;
}

describe('ci-gate — rateLimitResetWaitMs reads the reset window (LS-10322)', () => {
  const NOW = 1_000_000_000_000;

  it('prefers retry-after (seconds) plus a 1 s buffer', () => {
    assert.strictEqual(
      rateLimitResetWaitMs(rateLimitError({ 'retry-after': '30' }), NOW),
      31_000,
    );
  });

  it('uses x-ratelimit-reset (epoch seconds) when the bucket is empty', () => {
    const resetEpoch = NOW / 1000 + 120;
    assert.strictEqual(
      rateLimitResetWaitMs(
        rateLimitError({
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(resetEpoch),
        }),
        NOW,
      ),
      121_000,
    );
  });

  it('ignores x-ratelimit-reset when the bucket is not empty', () => {
    assert.strictEqual(
      rateLimitResetWaitMs(
        rateLimitError({
          'x-ratelimit-remaining': '42',
          'x-ratelimit-reset': String(NOW / 1000 + 120),
        }),
        NOW,
      ),
      null,
    );
  });

  it('returns null when the error carries no headers', () => {
    assert.strictEqual(rateLimitResetWaitMs(new Error('boom'), NOW), null);
  });
});

describe('ci-gate — withStatusRetry waits for the rate-limit reset (LS-10322)', () => {
  it('sleeps until the reset, not the ~500 ms in-window delay', async () => {
    const sleeps = [];
    let calls = 0;
    const result = await withStatusRetry(
      async () => {
        calls++;
        if (calls === 1) throw rateLimitError({ 'retry-after': '90' });
        return 'ok';
      },
      {
        maxRateLimitWaitMs: RATE_LIMIT_MAX_WAIT_MS,
        sleep: async (ms) => sleeps.push(ms),
      },
    );
    assert.strictEqual(result, 'ok');
    assert.deepStrictEqual(sleeps, [91_000]);
  });

  it('caps the wait at maxRateLimitWaitMs', async () => {
    const sleeps = [];
    let calls = 0;
    await withStatusRetry(
      async () => {
        calls++;
        if (calls === 1) throw rateLimitError({ 'retry-after': '3600' });
        return 'ok';
      },
      {
        maxRateLimitWaitMs: RATE_LIMIT_MAX_WAIT_MS,
        sleep: async (ms) => sleeps.push(ms),
      },
    );
    assert.deepStrictEqual(sleeps, [RATE_LIMIT_MAX_WAIT_MS]);
  });

  it('NEGATIVE CONTROL: without maxRateLimitWaitMs it keeps the short delay', async () => {
    const sleeps = [];
    let calls = 0;
    await withStatusRetry(
      async () => {
        calls++;
        if (calls === 1) throw rateLimitError({ 'retry-after': '90' });
        return 'ok';
      },
      { sleep: async (ms) => sleeps.push(ms) },
    );
    assert.deepStrictEqual(sleeps, [500]);
  });
});

describe('ci-gate — postCiGate rate-limited post path (LS-10322)', () => {
  it('waits for the reset then lands the verdict that the in-window retries could not', async () => {
    const sleeps = [];
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      createStatusErrors: [rateLimitError({ 'retry-after': '120' })],
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
      sleep: async (ms) => sleeps.push(ms),
    });

    assert.strictEqual(res.posted, true);
    assert.deepStrictEqual(sleeps, [121_000]);
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(calls.statuses[0].state, 'success');
  });

  it('flags verdictLost when the post is still rate-limited after every retry', async () => {
    const sleeps = [];
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      createStatusErrors: [
        rateLimitError({ 'retry-after': '10' }),
        rateLimitError({ 'retry-after': '10' }),
        rateLimitError({ 'retry-after': '10' }),
      ],
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
      sleep: async (ms) => sleeps.push(ms),
    });

    assert.strictEqual(res.posted, false);
    assert.strictEqual(res.reason, 'status-post-failed');
    assert.strictEqual(
      res.verdictLost,
      true,
      'the workflow keys its failing step off verdictLost',
    );
    assert.strictEqual(
      sleeps.length,
      2,
      'waits between each of the 3 attempts',
    );
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('NEGATIVE CONTROL: a successful post does not flag verdictLost', async () => {
    const { github } = makeGithub({ currentSha: HEAD_SHA });
    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: allPass(),
    });
    assert.strictEqual(res.posted, true);
    assert.notStrictEqual(res.verdictLost, true);
  });
});

describe('ci-pipeline.yml — summarize fails when the CI Gate verdict is lost (LS-10322)', () => {
  it('has a failing step gated on the post step verdict-lost output', async () => {
    const workflow = await readFile(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../workflows/ci-pipeline.yml',
      ),
      'utf8',
    );
    assert.match(workflow, /id: post-ci-gate/);
    assert.match(workflow, /core\.setOutput\('verdict-lost'/);
    assert.match(
      workflow,
      /name: "Fail when CI Gate verdict was lost"\s+if: >-\s+always\(\) &&\s+\(steps\.post-ci-gate\.outputs\.verdict-lost == 'true'/,
    );
  });
});

// ── seedPendingCiGate (LS-9543) ─────────────────────────────────────────────
//
// PR #7202 squash-merged with no `CI Gate` status ever having existed on its
// head SHA — the required context was ABSENT, not merely pending, so the
// owner's status-check bypass produced a silent merge with no outstanding
// requirement to override. seedPendingCiGate closes that "required context
// not yet posted" case by posting `pending` the instant a PR opens or is
// synchronized, before the self-hosted CI Pipeline runner even starts.

describe('ci-gate — seedPendingCiGate seeds a pending status on open/sync (LS-9543)', () => {
  it('posts pending for the PR head SHA when no CI Gate status exists yet', async () => {
    const { github, calls } = makeGithub({ existingStatuses: [] });

    const res = await seedPendingCiGate({
      github,
      context: makeContext(),
      core,
    });

    assert.strictEqual(res.seeded, true);
    assert.strictEqual(res.sha, HEAD_SHA);
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(calls.statuses[0].state, 'pending');
    assert.strictEqual(calls.statuses[0].context, CI_GATE_CONTEXT);
    assert.strictEqual(calls.statuses[0].sha, HEAD_SHA);
  });

  it('does not overwrite an existing pending CI Gate status (idempotent re-seed)', async () => {
    const { github, calls } = makeGithub({
      existingStatuses: [gateStatus('pending', SELF_RUN_ID)],
    });

    const res = await seedPendingCiGate({
      github,
      context: makeContext(),
      core,
    });

    assert.strictEqual(res.seeded, false);
    assert.strictEqual(res.reason, 'already-posted');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('never regresses a terminal success verdict back to pending', async () => {
    const { github, calls } = makeGithub({
      existingStatuses: [gateStatus('success', OLDER_RUN_ID)],
    });

    const res = await seedPendingCiGate({
      github,
      context: makeContext(),
      core,
    });

    assert.strictEqual(res.seeded, false);
    assert.strictEqual(res.reason, 'already-posted');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('never regresses a terminal failure verdict back to pending', async () => {
    const { github, calls } = makeGithub({
      existingStatuses: [gateStatus('failure', OLDER_RUN_ID)],
    });

    const res = await seedPendingCiGate({
      github,
      context: makeContext(),
      core,
    });

    assert.strictEqual(res.seeded, false);
    assert.strictEqual(res.reason, 'already-posted');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('no-ops when the event carries no pull_request payload', async () => {
    const { github, calls } = makeGithub();

    const res = await seedPendingCiGate({
      github,
      context: makeContext(null),
      core,
    });

    assert.strictEqual(res.seeded, false);
    assert.strictEqual(res.reason, 'no-pr');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('fails closed (skips the seed) when listing existing statuses errors', async () => {
    const { github, calls } = makeGithub({ statusesError: 'boom' });

    const res = await seedPendingCiGate({
      github,
      context: makeContext(),
      core,
    });

    assert.strictEqual(res.seeded, false);
    assert.strictEqual(res.reason, 'status-lookup-failed');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('degrades to a no-op instead of throwing when the status post fails after retries', async () => {
    const { github, calls } = makeGithub({
      existingStatuses: [],
      createStatusErrors: [
        statusError(500, 'internal server error'),
        statusError(500, 'internal server error'),
        statusError(500, 'internal server error'),
      ],
    });

    const res = await seedPendingCiGate({
      github,
      context: makeContext(),
      core,
    });

    assert.strictEqual(res.seeded, false);
    assert.strictEqual(res.reason, 'status-post-failed');
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('retries a transient rate-limit error on the status post and succeeds', async () => {
    const { github, calls } = makeGithub({
      existingStatuses: [],
      createStatusErrors: [
        statusError(403, 'API rate limit exceeded for installation'),
      ],
    });

    const res = await seedPendingCiGate({
      github,
      context: makeContext(),
      core,
    });

    assert.strictEqual(res.seeded, true);
    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(calls.statuses[0].state, 'pending');
  });
});

// ── LS-10140: gate-input job-name resolution ────────────────────────────────

describe('ci-gate — jobNameMatchesGateKey (LS-10140)', () => {
  it('matches the reusable-workflow-prefixed name for every gate input', () => {
    assert.ok(jobNameMatchesGateKey('🚀 CI Pipeline / test', 'test'));
    assert.ok(jobNameMatchesGateKey('🚀 CI Pipeline / lint & format', 'lint'));
    assert.ok(
      jobNameMatchesGateKey('🚀 CI Pipeline / E2E Tests (Shard 1/1)', 'e2e'),
      'the matrix shard suffix contains a bare slash — the leaf split must ' +
        'use " / " (spaced), not "/"',
    );
    assert.ok(
      jobNameMatchesGateKey(
        '🚀 CI Pipeline / E2E Tests (Mobile Chrome — Shard 1/2)',
        'e2e-mobile',
      ),
    );
  });

  it('NEGATIVE CONTROL: a short key does not match an unrelated job that merely contains it', () => {
    // Widening the lookup from the two matrix keys to all seven brought in
    // `test` and `build`, which a naive `.includes()` would find inside other
    // job names — mapping an unrelated job's cancellation onto a gate input.
    assert.equal(
      jobNameMatchesGateKey('🚀 CI Pipeline / E2E Tests (Shard 1/1)', 'test'),
      false,
    );
    assert.equal(
      jobNameMatchesGateKey('🔐 Security Scanning / build-scan', 'build'),
      false,
    );
    assert.equal(
      jobNameMatchesGateKey('🚀 CI Pipeline / test', 'build'),
      false,
    );
    assert.equal(jobNameMatchesGateKey(undefined, 'test'), false);
    assert.equal(jobNameMatchesGateKey('🚀 CI Pipeline / test', 'nope'), false);
  });

  it('covers every GATE_INPUT_JOBS entry — a new gate input must not silently go unclassifiable', () => {
    for (const jobKey of GATE_INPUT_JOBS) {
      assert.ok(
        GATE_JOB_LEAF_NAMES[jobKey],
        `GATE_JOB_LEAF_NAMES is missing "${jobKey}" — its cancellations would ` +
          'classify as no-signal and the gate could never tell a real failure ' +
          'behind them from runner churn',
      );
    }
  });

  it('the leaf names match ci-pipeline.yml (drift guard)', async () => {
    // These are matched against the live Actions jobs listing. Renaming a job
    // in ci-pipeline.yml without updating the constant would silently stop
    // every cancellation of that job from being classifiable.
    const pipeline = await readFile(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../workflows/ci-pipeline.yml',
      ),
      'utf8',
    );
    for (const [jobKey, leafName] of Object.entries(GATE_JOB_LEAF_NAMES)) {
      // Find the job block's own `name:` — the first one after the job key.
      const keyAt = pipeline.search(new RegExp(`^ {2}${jobKey}:$`, 'm'));
      assert.ok(keyAt > -1, `ci-pipeline.yml has no "${jobKey}" job`);
      const nameMatch = /^ {4}name: "(.+)"$/m.exec(pipeline.slice(keyAt));
      assert.ok(nameMatch, `ci-pipeline.yml's "${jobKey}" job has no name:`);
      assert.ok(
        nameMatch[1].startsWith(leafName),
        `ci-pipeline.yml's "${jobKey}" job is named "${nameMatch[1]}", which ` +
          `no longer starts with GATE_JOB_LEAF_NAMES' "${leafName}"`,
      );
    }
  });
});

// ── LS-10311: a runner death that concluded `failure` ───────────────────────

describe('ci-gate — a spot-killed job that concluded failure posts PENDING, not red (LS-10311)', () => {
  const SHUTDOWN_LOG =
    '##[error]The runner has received a shutdown signal. This can happen when ' +
    'the runner service is stopped, or a manually started runner is canceled.\n' +
    '##[error]The operation was canceled.';

  it('failure with no failed step + shutdown-first log → pending no-verdict', async () => {
    // The Sep 22-29 2026 shape: GitHub concluded the killed `test` job
    // `failure` even though no step failed.
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            id: 1101,
            name: '🚀 CI Pipeline / test',
            conclusion: 'failure',
            steps: [
              { name: 'Set up job', conclusion: 'success' },
              { name: 'Run Tests', conclusion: null },
            ],
          },
        ],
      },
      jobLogsById: { 1101: SHUTDOWN_LOG },
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), test: 'failure' },
    });

    assert.strictEqual(calls.statuses.length, 1);
    assert.strictEqual(calls.statuses[0].state, 'pending');
    assert.strictEqual(res.cancelClassifications.test, 'runner-shutdown');
    assert.match(calls.statuses[0].description, /test: runner-shutdown/);
  });

  it('NEGATIVE CONTROL: failure with a failed step stays red, and skips the log read', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            id: 1102,
            name: '🚀 CI Pipeline / test',
            conclusion: 'failure',
            steps: [
              { name: 'Set up job', conclusion: 'success' },
              { name: 'Run Tests', conclusion: 'failure' },
            ],
          },
        ],
      },
      jobLogsById: { 1102: SHUTDOWN_LOG },
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), test: 'failure' },
    });

    assert.strictEqual(calls.statuses[0].state, 'failure');
    assert.ok(res.failing.some((f) => f.startsWith('test')));
    assert.strictEqual(calls.jobLogs.length, 0);
  });

  it('NEGATIVE CONTROL: a plain failure with no shutdown notice stays red', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            id: 1103,
            name: '🚀 CI Pipeline / lint & format',
            conclusion: 'failure',
            steps: [],
          },
        ],
      },
      jobLogsById: { 1103: '##[error]Process completed with exit code 1.' },
    });

    await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), lint: 'failure' },
    });

    assert.strictEqual(calls.statuses[0].state, 'failure');
  });

  it('NEGATIVE CONTROL: mixed matrix — one shard really failed, another lost its runner — stays red', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            id: 1104,
            name: '🚀 CI Pipeline / E2E Tests (Shard 1/3)',
            conclusion: 'failure',
            steps: [{ name: 'Run E2E', conclusion: null }],
          },
          {
            id: 1105,
            name: '🚀 CI Pipeline / E2E Tests (Shard 2/3)',
            conclusion: 'failure',
            steps: [{ name: 'Run E2E', conclusion: 'failure' }],
          },
        ],
      },
      jobLogsById: { 1104: SHUTDOWN_LOG, 1105: SHUTDOWN_LOG },
    });

    await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), e2e: 'failure' },
    });

    assert.strictEqual(calls.statuses[0].state, 'failure');
  });

  it('a failed jobs lookup keeps the failure red — unproven is not a runner death', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsError: 'API rate limit exceeded',
    });

    await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), test: 'failure' },
    });

    assert.strictEqual(calls.statuses[0].state, 'failure');
  });

  it('a runner-death failure alongside a real failure in another input stays red', async () => {
    const { github, calls } = makeGithub({
      currentSha: HEAD_SHA,
      jobsByRunId: {
        [SELF_RUN_ID]: [
          {
            id: 1106,
            name: '🚀 CI Pipeline / test',
            conclusion: 'failure',
            steps: [],
          },
          {
            id: 1107,
            name: '🚀 CI Pipeline / build',
            conclusion: 'failure',
            steps: [{ name: 'Build', conclusion: 'failure' }],
          },
        ],
      },
      jobLogsById: { 1106: SHUTDOWN_LOG },
    });

    const res = await postCiGate({
      github,
      context: makeContext(),
      core,
      results: { ...allPass(), test: 'failure', build: 'failure' },
    });

    assert.strictEqual(calls.statuses[0].state, 'failure');
    assert.deepStrictEqual(res.failing, ['build (failure)']);
  });
});
