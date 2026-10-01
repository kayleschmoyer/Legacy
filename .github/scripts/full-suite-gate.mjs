import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * full-suite-gate.mjs — the post-deploy debounce decision shared by the four
 * schedule-free full-suite lanes (LS-10336):
 *
 *   - run-playwright-tests.yml   ("Full-Suite Gate",        sentinel "Prepare Matrix")
 *   - cross-browser-e2e.yml      ("Cross-Browser Gate",     sentinel "Prepare Matrix")
 *   - run-maestro-sweep.yml      ("Maestro Sweep Gate",     sentinel "Prepare Sweep")
 *   - e2e-native-android.yml     ("Native Android E2E Gate", sentinel "Build Bypass APK")
 *
 * Each lane listens on Deploy's workflow_run completion and must run at most
 * once per MIN_INTERVAL_HOURS. A debounced run skips every downstream job, so
 * its own run-level conclusion is "success" — the debounce therefore inspects
 * the SENTINEL job of each prior automated run (non-skipped, completed = a real
 * attempt) rather than run-level conclusions, which would re-arm the debounce
 * forever on a busy repo.
 *
 * WHY THIS IS A SCRIPT AND NOT INLINE SHELL: the inline gates listed prior runs
 * fail-CLOSED (LS-9329: a `gh api` error → inconclusive → skip) but probed each
 * run's jobs with `gh api ... 2>/dev/null || echo 0`, which fails OPEN — a
 * rate-limit 403 on the shared GITHUB_TOKEN read every prior run as "did not
 * run" and returned should-run=true. Observed 2026-09-30: four automated
 * full-suite executions in five hours under a 20h debounce. Every gh error on
 * either call is now `skip-inconclusive`: this lane exists to bound CI spend,
 * so the cheap failure mode (miss at most one interval, self-heals on the next
 * merge) is preferred over the expensive one (re-running the full suite on
 * every merge while the API is rate-limited).
 *
 * The decision is also echoed to the job LOG (stdout), not only the step
 * summary — step summaries are not readable through the Actions API, so a
 * log line is the only way a later investigation can see why a run did or did
 * not execute.
 *
 * Logging: console.* is used deliberately — this runs on a bare ubuntu-latest
 * runner from a sparse checkout of .github/scripts and cannot import workspace
 * packages. Build-time scripts are an explicit exception to the no-console rule
 * (AGENTS.md, Code Quality → No console.*).
 */

export const DECISION = Object.freeze({
  RUN: 'run',
  SKIP_DEBOUNCED: 'skip-debounced',
  SKIP_INCONCLUSIVE: 'skip-inconclusive',
});

/** ISO-8601 UTC timestamp without milliseconds, as the Actions API expects. */
export function isoCutoff(now, minIntervalHours) {
  const cutoff = new Date(now.getTime() - minIntervalHours * 3_600_000);
  return cutoff.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function ghErrorMessage(err) {
  const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : '';
  const stdout = typeof err?.stdout === 'string' ? err.stdout.trim() : '';
  return stderr || stdout || err?.message || String(err);
}

/**
 * Wrap a `gh` executor into the two API reads the decision needs. `exec(args)`
 * must run `gh <args>` and return stdout, throwing (with `.stderr`) on a
 * non-zero exit — which is what `execFileSync` does and what a 403 looks like.
 */
export function createGhApi(exec) {
  return {
    /**
     * Every automated run of `workflowFile` created after `cutoff`, across all
     * pages (LS-9329: a single page is not enough on a busy day). Returns
     * `{ id, run_started_at, updated_at }[]`, newest first.
     */
    listRuns({ repo, workflowFile, cutoff }) {
      const url =
        `repos/${repo}/actions/workflows/${workflowFile}/runs` +
        `?event=workflow_run&created=%3E${cutoff}&per_page=100`;
      const out = exec([
        'api',
        '--paginate',
        url,
        '--jq',
        '.workflow_runs[] | {id, run_started_at, updated_at} | @json',
      ]);
      return out
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },

    /** Count of completed, non-skipped jobs named `sentinelJob` in `runId`. */
    countSentinelJobs({ repo, runId, sentinelJob }) {
      const name = JSON.stringify(sentinelJob);
      const out = exec([
        'api',
        `repos/${repo}/actions/runs/${runId}/jobs?per_page=100`,
        '--jq',
        `[.jobs[] | select(.name == ${name} and .conclusion != null and .conclusion != "skipped")] | length`,
      ]);
      const n = Number.parseInt(out.trim(), 10);
      if (!Number.isInteger(n)) {
        throw new Error(
          `unexpected jobs response for run ${runId}: ${out.trim() || '<empty>'}`,
        );
      }
      return n;
    },
  };
}

function elapsedSeconds(run) {
  const started = Date.parse(run.run_started_at ?? '');
  const updated = Date.parse(run.updated_at ?? '');
  if (Number.isNaN(started) || Number.isNaN(updated)) return null;
  return (updated - started) / 1000;
}

/**
 * The gate decision.
 *
 * @param {object} opts
 * @param {string} opts.eventName   `github.event_name` — anything other than
 *   `workflow_run` (a manual dispatch) always runs.
 * @param {string} opts.repo        `owner/name`
 * @param {string} opts.workflowFile  e.g. `run-playwright-tests.yml`
 * @param {string} opts.sentinelJob   job name whose non-skipped completion marks
 *   a real attempt, e.g. `Prepare Matrix`
 * @param {string|number} opts.selfRunId  this run's id (excluded from the walk)
 * @param {string} opts.cutoff      ISO timestamp; runs created after it count
 * @param {number} [opts.minRealAttemptSeconds=0]  pre-filter: skip probing runs
 *   whose wall time is below this (a debounced run finishes in well under a
 *   minute; a real attempt takes far longer). Keeps job introspection to a
 *   handful of calls on a busy lane. Runs with missing timestamps are probed.
 * @param {{ listRuns: Function, countSentinelJobs: Function }} api
 * @returns {{ decision: string, reason: string, inspected: number, foundRunId?: number|string, error?: string }}
 */
export function decideFullSuiteGate(opts, api) {
  const {
    eventName,
    repo,
    workflowFile,
    sentinelJob,
    selfRunId,
    cutoff,
    minRealAttemptSeconds = 0,
  } = opts;

  if (eventName !== 'workflow_run') {
    return {
      decision: DECISION.RUN,
      reason: 'Manual dispatch — always runs.',
      inspected: 0,
    };
  }

  let runs;
  try {
    runs = api.listRuns({ repo, workflowFile, cutoff });
  } catch (err) {
    return {
      decision: DECISION.SKIP_INCONCLUSIVE,
      reason: 'gh api failed while listing prior runs',
      error: ghErrorMessage(err),
      inspected: 0,
    };
  }

  const candidates = runs
    .filter((run) => String(run.id) !== String(selfRunId))
    .filter((run) => {
      if (minRealAttemptSeconds <= 0) return true;
      const elapsed = elapsedSeconds(run);
      return elapsed === null || elapsed >= minRealAttemptSeconds;
    });

  let inspected = 0;
  for (const run of candidates) {
    let prepared;
    try {
      prepared = api.countSentinelJobs({
        repo,
        runId: run.id,
        sentinelJob,
      });
    } catch (err) {
      // The LS-10336 fix: a failed probe is NOT "this run did not attempt";
      // it is "we cannot tell", and an inconclusive gate skips.
      return {
        decision: DECISION.SKIP_INCONCLUSIVE,
        reason: `gh api failed while inspecting the jobs of prior run ${run.id}`,
        error: ghErrorMessage(err),
        inspected,
      };
    }
    inspected += 1;
    if (prepared > 0) {
      return {
        decision: DECISION.SKIP_DEBOUNCED,
        reason: `Debounced — run ${run.id} already made a real attempt (non-skipped "${sentinelJob}") within the interval.`,
        foundRunId: run.id,
        inspected,
      };
    }
  }

  return {
    decision: DECISION.RUN,
    reason: `No automated run made a real attempt (non-skipped "${sentinelJob}") within the interval.`,
    inspected,
  };
}

/**
 * Render a decision into the three places it must land: `$GITHUB_OUTPUT`
 * lines, the step-summary markdown, and job-log lines. Pure so it is testable.
 *
 * @param {ReturnType<typeof decideFullSuiteGate>} result
 * @param {{ title: string, cutoff: string, minIntervalHours: string|number, note?: string, serverUrl?: string, repo?: string }} ctx
 */
export function renderGateDecision(result, ctx) {
  const { title, cutoff, minIntervalHours, note, serverUrl, repo } = ctx;
  const shouldRun = result.decision === DECISION.RUN;
  const interval = `${minIntervalHours}h`;

  const outputLines = [`should-run=${shouldRun}`];
  if (!shouldRun) {
    const skipReason =
      result.decision === DECISION.SKIP_INCONCLUSIVE
        ? `Inconclusive — ${result.reason}; skipping rather than re-running the full suite blind.`
        : result.reason;
    outputLines.push(`skip-reason=${skipReason.replace(/\r?\n/g, ' ')}`);
  }

  const heading =
    result.decision === DECISION.RUN
      ? `## ${title} — RUNNING`
      : result.decision === DECISION.SKIP_DEBOUNCED
        ? `## ${title} — SKIPPED (debounced)`
        : `## ${title} — SKIPPED (inconclusive)`;

  const summaryLines = [heading, ''];
  if (note && !shouldRun) summaryLines.push(note, '');
  summaryLines.push(
    `- Cutoff: ${cutoff} (interval: ${interval})`,
    `- Prior automated runs inspected: ${result.inspected}`,
  );
  if (result.foundRunId !== undefined) {
    const link =
      serverUrl && repo
        ? `[\`${result.foundRunId}\`](${serverUrl}/${repo}/actions/runs/${result.foundRunId})`
        : `\`${result.foundRunId}\``;
    summaryLines.push(
      `- Decision: **debounced → skip** — run ${link} already made a real attempt within the last ${interval}.`,
    );
  } else if (result.decision === DECISION.SKIP_INCONCLUSIVE) {
    summaryLines.push(
      `- Decision: **inconclusive → skip** — ${result.reason}:`,
      '```',
      result.error ?? '<no error output>',
      '```',
    );
  } else {
    summaryLines.push(`- Decision: **run** — ${result.reason}`);
  }

  const logLines = [
    `[${title}] decision=${result.decision} should-run=${shouldRun} cutoff=${cutoff} interval=${interval} inspected=${result.inspected}`,
    `[${title}] ${result.reason}`,
  ];
  if (result.error) logLines.push(`[${title}] gh error: ${result.error}`);

  return { outputLines, summaryLines, logLines };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

/**
 * CLI. Reads the standard Actions env (GITHUB_EVENT_NAME, GITHUB_REPOSITORY,
 * GITHUB_RUN_ID, GITHUB_SERVER_URL, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY, and
 * GH_TOKEN for `gh`) plus:
 *
 *   GATE_TITLE                    heading for the summary / log prefix
 *   GATE_WORKFLOW_FILE            this workflow's file name
 *   GATE_SENTINEL_JOB             job whose non-skipped completion = real attempt
 *   MIN_INTERVAL_HOURS            debounce interval
 *   GATE_MIN_REAL_ATTEMPT_SECONDS optional wall-time pre-filter (see decide)
 *   GATE_NOTE                     optional extra summary line on a skip
 *
 * Always exits 0 once it has written its outputs — the decision itself is the
 * failure channel; an errored gate must never hard-fail the job (LS-9329).
 */
function main() {
  const title = requireEnv('GATE_TITLE');
  const minIntervalHours = requireEnv('MIN_INTERVAL_HOURS');
  const cutoff = isoCutoff(new Date(), Number(minIntervalHours));
  const repo = requireEnv('GITHUB_REPOSITORY');

  const api = createGhApi((args) =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    }),
  );

  const result = decideFullSuiteGate(
    {
      eventName: process.env.GITHUB_EVENT_NAME,
      repo,
      workflowFile: requireEnv('GATE_WORKFLOW_FILE'),
      sentinelJob: requireEnv('GATE_SENTINEL_JOB'),
      selfRunId: requireEnv('GITHUB_RUN_ID'),
      cutoff,
      minRealAttemptSeconds: Number(
        process.env.GATE_MIN_REAL_ATTEMPT_SECONDS ?? '0',
      ),
    },
    api,
  );

  const { outputLines, summaryLines, logLines } = renderGateDecision(result, {
    title,
    cutoff,
    minIntervalHours,
    note: process.env.GATE_NOTE,
    serverUrl: process.env.GITHUB_SERVER_URL,
    repo,
  });

  for (const line of logLines) console.log(line);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${outputLines.join('\n')}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${summaryLines.join('\n')}\n`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
