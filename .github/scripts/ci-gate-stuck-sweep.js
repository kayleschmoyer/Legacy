/**
 * ci-gate-stuck-sweep.js — find a `CI Gate` stuck at `pending` after its CI
 * run finished green, and decide whether to re-run the run's Summarize job
 * (LS-10576).
 *
 * The failure this recovers: when the Summarize job hits the installation rate
 * limit while posting `CI Gate`, ci-gate.js posts a `pending` "withheld
 * (status-lookup-failed) — retry pending" status (LS-9591) and expects "a later
 * run" to supersede it. Nothing schedules that run. An approved PR whose jobs
 * are all green never gets another CI run, so the SHA sits at pending and the
 * merge queue waits on it forever (PR #8341 for ~7h, PR #8168 for ~20h on
 * 2026-10-04 — both went green the moment Summarize was re-run by hand).
 *
 * rerun-cancelled-ci.yml does not cover this: it only fires for runs that end
 * `cancelled` or `failure`, and these runs end `success`.
 *
 * The decision fails CLOSED. Anything unproven means "leave it" — a stuck gate
 * costs a human re-run, while a wrong re-run could replay a verdict onto a
 * superseded SHA.
 *
 * Run tests via: node --test .github/scripts/__tests__/ci-gate-stuck-sweep.test.mjs
 */

const CI_GATE_CONTEXT = 'CI Gate';

/** Workflows whose runs post `CI Gate` — mirrors CI_RUN_WORKFLOW_NAMES in ci-gate.js. */
const GATE_WORKFLOW_NAMES = Object.freeze([
  'Legacy Sports CI Orchestrator',
  'Legacy Sports CI Pipeline',
]);

/**
 * The job that posts `CI Gate`. Matched by suffix because the orchestrator
 * prefixes reusable-workflow jobs ("🚀 CI Pipeline / Summarize & Report").
 */
const SUMMARIZE_JOB_SUFFIX = 'Summarize & Report';

/**
 * How long a pending gate must sit before the sweep touches it. The
 * installation rate limit resets on an hourly window, so re-running sooner
 * mostly re-hits it; this also keeps the sweep clear of a Summarize post that
 * is still landing.
 */
const MIN_PENDING_AGE_MS = 30 * 60 * 1000;

/**
 * Cap on the run's `run_attempt`. Every sweep re-run bumps it, so this stops a
 * rate limit that never clears (or a bug that always withholds) from
 * re-running the same job forever. Counted per run, alongside any earlier
 * re-runs (runner churn, manual), which is the conservative direction.
 */
const MAX_RUN_ATTEMPTS = 5;

/**
 * Extract the Actions run id from a `CI Gate` status target URL
 * (`https://github.com/<owner>/<repo>/actions/runs/<id>` with an optional
 * `/job/<id>` or `/attempts/<n>` suffix).
 *
 * @param {string|null|undefined} targetUrl
 * @returns {number|null}
 */
function runIdFromTargetUrl(targetUrl) {
  const match = /\/actions\/runs\/(\d+)/.exec(targetUrl || '');
  return match ? Number(match[1]) : null;
}

/**
 * Pick the newest `CI Gate` status from a list of commit statuses (the API
 * returns newest first, but don't rely on it — last writer by created_at wins).
 *
 * @param {Array<{context: string, created_at: string}>} statuses
 */
function latestGateStatus(statuses) {
  return (statuses || [])
    .filter((s) => s.context === CI_GATE_CONTEXT)
    .reduce(
      (latest, s) =>
        !latest || Date.parse(s.created_at) > Date.parse(latest.created_at)
          ? s
          : latest,
      null,
    );
}

/**
 * Find the Summarize job in a run's job list.
 *
 * @param {Array<{name: string}>} jobs
 */
function findSummarizeJob(jobs) {
  return (
    (jobs || []).find((j) => (j.name || '').endsWith(SUMMARIZE_JOB_SUFFIX)) ||
    null
  );
}

/**
 * Decide whether a PR's pending `CI Gate` is stuck behind a finished green run
 * and should have that run's Summarize job re-run.
 *
 * @param {object} opts
 * @param {object|null} opts.gateStatus  Latest `CI Gate` status on the PR head
 *   ({ state, description, target_url, created_at }), or null if none.
 * @param {string} opts.prHeadSha        The PR's head SHA right now.
 * @param {object|null} [opts.run]       The run the status points at
 *   ({ id, name, status, conclusion, head_sha, run_attempt }); null if it could
 *   not be fetched.
 * @param {object|null} [opts.summarizeJob] That run's Summarize job
 *   ({ id, status, conclusion }); null if the run has none.
 * @param {number} opts.now              Current time in ms.
 * @param {number} [opts.minPendingAgeMs]
 * @param {number} [opts.maxRunAttempts]
 * @returns {{ rerun: boolean, reason: string, needsHuman?: boolean }}
 */
function shouldRerunStuckGate({
  gateStatus,
  prHeadSha,
  run = null,
  summarizeJob = null,
  now,
  minPendingAgeMs = MIN_PENDING_AGE_MS,
  maxRunAttempts = MAX_RUN_ATTEMPTS,
}) {
  if (!gateStatus) {
    return { rerun: false, reason: 'no CI Gate status on the head SHA' };
  }
  if (gateStatus.state !== 'pending') {
    return {
      rerun: false,
      reason: `CI Gate is '${gateStatus.state}', not pending`,
    };
  }

  const createdAt = Date.parse(gateStatus.created_at);
  if (!Number.isFinite(createdAt) || !Number.isFinite(now)) {
    return { rerun: false, reason: 'pending age is unknown — failing closed' };
  }
  const ageMinutes = Math.floor((now - createdAt) / 60000);
  if (now - createdAt < minPendingAgeMs) {
    return {
      rerun: false,
      reason: `pending for ${ageMinutes}m, under the ${Math.round(minPendingAgeMs / 60000)}m threshold`,
    };
  }

  if (runIdFromTargetUrl(gateStatus.target_url) === null) {
    return {
      rerun: false,
      reason: 'CI Gate status has no run link — failing closed',
    };
  }
  if (!run) {
    return {
      rerun: false,
      reason: 'the linked run could not be read — failing closed',
    };
  }
  if (!GATE_WORKFLOW_NAMES.includes(run.name)) {
    return {
      rerun: false,
      reason: `linked run is '${run.name}', not a CI run`,
    };
  }
  if (run.status !== 'completed') {
    // Still running: its own Summarize job will post.
    return { rerun: false, reason: `linked run is still '${run.status}'` };
  }
  if (run.conclusion !== 'success') {
    // Cancelled / runner-killed runs belong to rerun-cancelled-ci.yml; a real
    // failure is a real verdict.
    return {
      rerun: false,
      reason: `linked run concluded '${run.conclusion}' — not a green run with a lost verdict`,
    };
  }
  if (!run.head_sha || !prHeadSha) {
    return { rerun: false, reason: 'head SHA is unknown — failing closed' };
  }
  if (run.head_sha !== prHeadSha) {
    return {
      rerun: false,
      reason: `linked run tested ${run.head_sha} but PR head is now ${prHeadSha} — superseded`,
    };
  }
  if (!summarizeJob) {
    // A scoped-out run (e.g. a label event) never reaches Summarize; re-running
    // it cannot post a verdict.
    return {
      rerun: false,
      reason: 'linked run has no Summarize job to re-run',
    };
  }
  if (summarizeJob.status !== 'completed') {
    return {
      rerun: false,
      reason: `Summarize job is still '${summarizeJob.status}'`,
    };
  }

  if (!Number.isInteger(run.run_attempt) || run.run_attempt < 1) {
    return { rerun: false, reason: 'run attempt is unknown — failing closed' };
  }
  if (run.run_attempt >= maxRunAttempts) {
    return {
      rerun: false,
      needsHuman: true,
      reason: `run is on attempt ${run.run_attempt}, at the cap of ${maxRunAttempts} — needs a human`,
    };
  }

  return {
    rerun: true,
    reason: `CI Gate pending for ${ageMinutes}m ("${gateStatus.description || ''}") after run ${run.id} finished green on the current head — re-running Summarize`,
  };
}

module.exports = {
  CI_GATE_CONTEXT,
  GATE_WORKFLOW_NAMES,
  SUMMARIZE_JOB_SUFFIX,
  MIN_PENDING_AGE_MS,
  MAX_RUN_ATTEMPTS,
  runIdFromTargetUrl,
  latestGateStatus,
  findSummarizeJob,
  shouldRerunStuckGate,
};
