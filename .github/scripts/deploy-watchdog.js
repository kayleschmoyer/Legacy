/**
 * deploy-watchdog.js — Decide whether a Deploy umbrella run is wedged behind a
 * child job that will never get a runner, and say so (LS-10328).
 *
 * WHY THIS EXISTS
 * ---------------
 * deploy.yml serialises main deploys through the `deploy-main` concurrency
 * group with `cancel-in-progress: false` (a cancelled mid-deploy is worse than
 * a queued one). GitHub keeps ONE running and ONE pending run per group, and a
 * newer pending run cancels the older pending one. So when a child job of the
 * running umbrella queues forever — on 2026-09-29 `Build Android App / Build
 * Android APK` sat 1440 min because the Android runner pool orphan-killed every
 * runner it launched (LS-10327) — the running umbrella lives until GitHub's
 * queued-job cap and every later push-to-main Deploy is cancelled while
 * pending. 58 Deploys were cancelled that day and nothing shipped for ~26 h.
 *
 * `timeout-minutes` cannot bound this: it is not accepted on reusable-workflow
 * caller jobs, and even where it is accepted the clock only starts once a
 * runner has picked the job up — the whole failure is that none ever does.
 *
 * WHAT THIS MODULE DECIDES
 * ------------------------
 * The `Deploy Watchdog` job (deploy.yml) runs this script on a GitHub-hosted
 * runner, which always has capacity, for the life of the run. Each poll lists
 * the run's jobs and calls `decideWatchdogAction`:
 *
 *   - `done`   — the terminal job (`Rollup Status`, which `needs` every child
 *                with `if: always()`) has completed: the deploy is over.
 *   - `cancel` — at least one child has been waiting for a runner for the
 *                deadline (30 min) AS OBSERVED BY THIS WATCHDOG, and NO job is
 *                in progress. Only then is cancelling the run safe: nothing is
 *                mid-flight, so no terraform apply (or anything else) is torn
 *                down half-way. Cancelling frees the `deploy-main` slot so the
 *                pending Deploy for the newest main HEAD starts, and its
 *                freshly-queued jobs fire new scale-up webhooks for the pool.
 *   - `wait`   — anything else. In particular a job that IS running is left
 *                alone no matter how old the run is: a running job has a
 *                runner, so its own `timeout-minutes` bounds it, and killing
 *                `Apply Lambda Infrastructure` mid-apply can strand Terraform
 *                state (see lambda-terraform-apply.yml's concurrency comment).
 *
 * WHERE THE CLOCK STARTS (LS-10365)
 * -------------------------------
 * A job's wait is measured from the first poll on which THIS watchdog saw it
 * waiting — never from the run's `run_started_at` / `created_at`. GitHub stamps
 * `run_started_at` when the run is created, not when it is released from the
 * `deploy-main` group, so a run that sat pending behind another Deploy has
 * hours on that clock before any of its jobs is runnable. Run 36817980251
 * (2026-10-01) was created 05:03Z, released 16:20Z, and the old run-age
 * baseline cancelled it on the first poll for "waiting 676.8 min". The
 * watchdog job only starts once the run is released, so what it observes is
 * exactly the time a job has been runnable without a runner. Tracking the wait
 * per job (`trackWaitingSince`) also means a job that has only just been
 * dispatched late in a long deploy starts its own 30 min, rather than
 * inheriting the age of the run.
 *
 * The decision is pure so it can be unit-tested, and the poll loop
 * (`watchRun`) takes its clock, sleep and job lister as arguments for the same
 * reason; GitHub API calls and `$GITHUB_OUTPUT` writes live in `main()`. The
 * script never cancels the run itself — it reports `cancelled=true` and the workflow posts a Discord
 * notice before issuing the cancel, because a cancelled run's rollup job may
 * not get to run.
 *
 * Fail-open by design: this is a safety net, not a gate. API errors are
 * retried; a persistent outage logs a warning and exits 0 so the watchdog can
 * never turn a healthy deploy red (the job also carries continue-on-error).
 *
 * Logging: uses console.* — this script runs on a bare GitHub-hosted runner
 * and cannot import workspace packages like `@legacy-sports/logging`.
 * Build-time scripts are an explicit exception to the no-console rule (see
 * AGENTS.md, Code Quality → No console.*).
 */

'use strict';

const fs = require('node:fs');

// Defaults — mirrored by the `Deploy Watchdog` job's env in deploy.yml and
// pinned by .github/scripts/__tests__/deploy-watchdog.test.mjs.
const DEFAULT_DEADLINE_MINUTES = 30;
const DEFAULT_POLL_SECONDS = 30;
const DEFAULT_JOB_NAME = 'Deploy Watchdog';
const DEFAULT_TERMINAL_JOB_NAME = 'Rollup Status';
// Consecutive failed polls tolerated before the watchdog gives up (fail-open).
const MAX_CONSECUTIVE_API_FAILURES = 10;

const ACTION_DONE = 'done';
const ACTION_WAIT = 'wait';
const ACTION_CANCEL = 'cancel';

// Job `status` values the Actions API reports for a job that has not finished.
// Only `in_progress` means a runner has the job; everything else is some form
// of "waiting" — for a runner, for a concurrency slot, or for an environment
// approval. A job blocked on `needs` is not listed at all until dispatched.
const RUNNING_STATUS = 'in_progress';
const WAITING_STATUSES = new Set(['queued', 'waiting', 'pending', 'requested']);

/**
 * Carry forward, per job name, the epoch ms at which this watchdog first saw
 * the job waiting. A job seen waiting for the first time starts at `nowMs`; a
 * job that is no longer waiting (it got a runner, or finished) is dropped, so
 * a later wait starts a fresh clock. Job timestamps from the API are
 * deliberately not read — see "WHERE THE CLOCK STARTS" in the header.
 *
 * @param {Record<string, number>} previous  Result of the previous poll ({} on the first).
 * @param {Array<{name: string, status: string}>} jobs
 * @param {number} nowMs
 * @param {string} [selfJobName]
 * @returns {Record<string, number>}
 */
function trackWaitingSince(
  previous,
  jobs,
  nowMs,
  selfJobName = DEFAULT_JOB_NAME,
) {
  const next = {};
  for (const job of jobs ?? []) {
    if (job.name === selfJobName || !WAITING_STATUSES.has(job.status)) continue;
    next[job.name] = previous?.[job.name] ?? nowMs;
  }
  return next;
}

/**
 * Pure decision over one snapshot of the run's jobs.
 *
 * @param {object} args
 * @param {Array<{name: string, status: string, conclusion?: string|null}>} args.jobs
 *   The run's jobs as returned by GET /actions/runs/{id}/jobs (only `name` and
 *   `status` are read).
 * @param {Record<string, number>} args.waitingSinceMs  Per-job first-seen-waiting
 *   epoch ms from `trackWaitingSince` for this same snapshot. A waiting job
 *   missing from the map counts as having waited 0 min.
 * @param {number} args.nowMs          Epoch ms of this poll.
 * @param {number} [args.deadlineMinutes]
 * @param {string} [args.selfJobName]      Display name of the watchdog job itself.
 * @param {string} [args.terminalJobName]  Display name of the job whose completion
 *   means the deploy is over.
 * @returns {{action: string, reason: string, ageMinutes: number,
 *            waitingJobs: string[], stuckJobs: string[], runningJobs: string[]}}
 *   `ageMinutes` is the longest any job has been observed waiting; `stuckJobs`
 *   are the waiting jobs at or past the deadline.
 */
function decideWatchdogAction({
  jobs,
  waitingSinceMs,
  nowMs,
  deadlineMinutes = DEFAULT_DEADLINE_MINUTES,
  selfJobName = DEFAULT_JOB_NAME,
  terminalJobName = DEFAULT_TERMINAL_JOB_NAME,
}) {
  const others = (jobs ?? []).filter((job) => job.name !== selfJobName);

  const terminalDone = others.some(
    (job) => job.name === terminalJobName && job.status === 'completed',
  );
  const runningJobs = others
    .filter((job) => job.status === RUNNING_STATUS)
    .map((job) => job.name);
  const waitingJobs = others
    .filter((job) => WAITING_STATUSES.has(job.status))
    .map((job) => job.name);

  const waitedMinutes = (name) =>
    Math.max(0, (nowMs - (waitingSinceMs?.[name] ?? nowMs)) / 60_000);
  const ageMinutes = Math.max(0, ...waitingJobs.map(waitedMinutes));
  const stuckJobs = waitingJobs.filter(
    (name) => waitedMinutes(name) >= deadlineMinutes,
  );

  const base = { ageMinutes, waitingJobs, stuckJobs, runningJobs };

  if (terminalDone) {
    return {
      ...base,
      action: ACTION_DONE,
      reason: `${terminalJobName} has completed — deploy finished.`,
    };
  }

  if (runningJobs.length > 0) {
    return {
      ...base,
      action: ACTION_WAIT,
      reason:
        `${runningJobs.length} job(s) in progress (${runningJobs.join(', ')}) — ` +
        'never cancel a run with work mid-flight.',
    };
  }

  if (waitingJobs.length === 0) {
    return {
      ...base,
      action: ACTION_WAIT,
      reason:
        'No child is waiting or running; the next needs-gated job has not been dispatched yet.',
    };
  }

  if (stuckJobs.length === 0) {
    return {
      ...base,
      action: ACTION_WAIT,
      reason:
        `${waitingJobs.length} job(s) waiting for a runner (${waitingJobs.join(', ')}) ` +
        `for ${ageMinutes.toFixed(1)} min — deadline is ${deadlineMinutes} min.`,
    };
  }

  return {
    ...base,
    action: ACTION_CANCEL,
    reason:
      `${stuckJobs.length} job(s) still waiting for a runner after ` +
      `${ageMinutes.toFixed(1)} min (deadline ${deadlineMinutes} min) with nothing ` +
      `in progress: ${stuckJobs.join(', ')}.`,
  };
}

/**
 * The poll loop: list jobs, decide, sleep, until the deploy is done, the run
 * should be cancelled, or the API has failed too many times in a row
 * (fail-open — returns `null`). The clock, sleep and job lister are injected
 * so the loop is testable without GitHub or real time.
 *
 * @returns {Promise<ReturnType<typeof decideWatchdogAction> | null>}
 */
async function watchRun({
  listJobs,
  now = Date.now,
  sleep = defaultSleep,
  log = console.log,
  warn = console.warn,
  deadlineMinutes = DEFAULT_DEADLINE_MINUTES,
  pollSeconds = DEFAULT_POLL_SECONDS,
  selfJobName = DEFAULT_JOB_NAME,
  terminalJobName = DEFAULT_TERMINAL_JOB_NAME,
}) {
  const armedMs = now();
  let waitingSinceMs = {};
  let consecutiveFailures = 0;
  let lastLogged = '';
  for (;;) {
    let decision;
    let nowMs;
    try {
      const jobs = await listJobs();
      nowMs = now();
      waitingSinceMs = trackWaitingSince(
        waitingSinceMs,
        jobs,
        nowMs,
        selfJobName,
      );
      decision = decideWatchdogAction({
        jobs,
        waitingSinceMs,
        nowMs,
        deadlineMinutes,
        selfJobName,
        terminalJobName,
      });
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures += 1;
      warn(
        `⚠️  poll failed (${consecutiveFailures}/${MAX_CONSECUTIVE_API_FAILURES}): ${error.message}`,
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_API_FAILURES) {
        warn(
          '::warning::deploy-watchdog: giving up after repeated API failures — this run is NOT guarded.',
        );
        return null;
      }
      await sleep(pollSeconds * 1000);
      continue;
    }

    // Log only on change so a 25-minute deploy does not produce 50 identical
    // lines. The prefix is minutes since the watchdog armed; the comparison
    // skips it and the reason's own running minute count.
    const body = `${decision.action}: ${decision.reason}`;
    const key = body.replace(/\d+\.\d+ min/g, 'N min');
    if (key !== lastLogged) {
      log(`[${((nowMs - armedMs) / 60_000).toFixed(1)} min] ${body}`);
      lastLogged = key;
    }

    if (decision.action !== ACTION_WAIT) return decision;

    await sleep(pollSeconds * 1000);
  }
}

// ── Runtime (GitHub Actions) ─────────────────────────────────────────────────

function readIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function fetchJson(url, token) {
  const response = await fetch(url, { headers: githubHeaders(token) });
  if (!response.ok) {
    throw new Error(`GET ${url} failed (HTTP ${response.status})`);
  }
  return response.json();
}

async function fetchJobs({ api, repo, runId, token }) {
  const jobs = [];
  for (let page = 1; page <= 10; page++) {
    const data = await fetchJson(
      `${api}/repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100&page=${page}`,
      token,
    );
    const batch = Array.isArray(data.jobs) ? data.jobs : [];
    jobs.push(...batch);
    if (batch.length < 100) break;
  }
  return jobs.map((job) => ({
    name: job.name,
    status: job.status,
    conclusion: job.conclusion ?? null,
  }));
}

function writeOutputs(outputs) {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  const lines = Object.entries(outputs).map(([key, value]) => {
    const text = String(value);
    if (!text.includes('\n')) return `${key}=${text}`;
    const delimiter = `EOF_${key}_${Date.now()}`;
    return `${key}<<${delimiter}\n${text}\n${delimiter}`;
  });
  fs.appendFileSync(target, `${lines.join('\n')}\n`);
}

function writeStepSummary(text) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;
  fs.appendFileSync(target, `${text}\n`);
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const token = process.env.GITHUB_TOKEN ?? '';
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const runId = process.env.GITHUB_RUN_ID ?? '';
  const api = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const deadlineMinutes = readIntEnv(
    'WATCHDOG_DEADLINE_MINUTES',
    DEFAULT_DEADLINE_MINUTES,
  );
  const pollSeconds = readIntEnv('WATCHDOG_POLL_SECONDS', DEFAULT_POLL_SECONDS);
  const selfJobName = process.env.WATCHDOG_JOB_NAME || DEFAULT_JOB_NAME;
  const terminalJobName =
    process.env.WATCHDOG_TERMINAL_JOB_NAME || DEFAULT_TERMINAL_JOB_NAME;

  if (!token || !repo || !runId) {
    console.warn(
      '::warning::deploy-watchdog: GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_RUN_ID are required — watchdog disabled for this run.',
    );
    writeOutputs({ cancelled: 'false' });
    return;
  }

  const ctx = { api, repo, runId, token };

  console.log(
    `🐕 Deploy Watchdog armed: deadline ${deadlineMinutes} min, polling every ${pollSeconds}s, ` +
      `terminal job "${terminalJobName}".`,
  );

  const decision = await watchRun({
    listJobs: () => fetchJobs(ctx),
    deadlineMinutes,
    pollSeconds,
    selfJobName,
    terminalJobName,
  });

  if (decision?.action !== ACTION_CANCEL) {
    writeOutputs({ cancelled: 'false' });
    return;
  }

  const stuck = decision.stuckJobs.join(', ');
  const summary =
    `Deploy run cancelled by the watchdog: ${stuck} waited ` +
    `${decision.ageMinutes.toFixed(0)} min for a runner that never came (LS-10328). ` +
    'Nothing was in progress when it was cancelled. ' +
    'The pending Deploy for the newest main HEAD will start now.';
  console.log(`::error::${summary}`);
  writeStepSummary(
    `## 🐕 Deploy Watchdog — run cancelled\n\n${summary}\n\n` +
      `Waiting jobs:\n${decision.waitingJobs.map((name) => `- \`${name}\``).join('\n')}`,
  );
  writeOutputs({
    cancelled: 'true',
    stuck_jobs: stuck,
    age_minutes: decision.ageMinutes.toFixed(0),
    summary,
  });
}

module.exports = {
  decideWatchdogAction,
  trackWaitingSince,
  watchRun,
  ACTION_DONE,
  ACTION_WAIT,
  ACTION_CANCEL,
  DEFAULT_DEADLINE_MINUTES,
  DEFAULT_POLL_SECONDS,
  DEFAULT_JOB_NAME,
  DEFAULT_TERMINAL_JOB_NAME,
  MAX_CONSECUTIVE_API_FAILURES,
  WAITING_STATUSES,
  RUNNING_STATUS,
};

if (require.main === module) {
  main().catch((error) => {
    // Fail open: a crashed watchdog must never fail a healthy deploy.
    console.warn(
      `::warning::deploy-watchdog crashed: ${error.stack || error.message}`,
    );
    writeOutputs({ cancelled: 'false' });
  });
}
