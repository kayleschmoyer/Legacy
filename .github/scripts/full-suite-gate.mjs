import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  checkRunSuperseded,
  triggerRunConclusion,
  triggerRunId,
} from './deploy-superseded.mjs';

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
 * A run triggered by a SUPERSEDED Deploy (LS-10964: the merge queue landed
 * more of a batch, so that Deploy skipped itself and deployed nothing) is
 * skipped before the debounce walk. It must not use up the interval testing a
 * production that the newer Deploy has not reached yet. That check fails OPEN
 * (any error → carry on with the normal debounce), unlike the debounce itself,
 * so a broken lookup never changes behaviour from before LS-10964. The
 * workflow's sparse checkout must include deploy-superseded.mjs.
 *
 * LS-11040 adds two more trigger checks. A CANCELLED Deploy (routinely a
 * pending run replaced by a newer push, so it deployed nothing) is skipped the
 * same way — `workflow_run: completed` fires for it too, and nightly
 * 37943431617 tested whatever was live under Deploy 6052's headSha. And a run
 * whose triggering Deploy WITHHELD Deploy Web (a lambda child failed, so the
 * web stayed on its last good build while the backend may have moved ahead)
 * still runs, but labels itself: `web-withheld=true` output, a warning
 * annotation, and a summary line, so its failures are read as possible
 * server-ahead-of-client skew rather than as main's code.
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
  SKIP_SUPERSEDED: 'skip-superseded',
  SKIP_CANCELLED_TRIGGER: 'skip-cancelled-trigger',
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

    /**
     * Conclusion of a prior run (or its status while still in flight), used
     * only to label a debounced run (LS-10309) — never to make the decision.
     */
    getRunConclusion({ repo, runId }) {
      const out = exec([
        'api',
        `repos/${repo}/actions/runs/${runId}`,
        '--jq',
        '.conclusion // .status',
      ]);
      return out.trim();
    },

    /**
     * Was the triggering run a superseded Deploy (LS-10964)? Never throws:
     * an error reads as "not superseded" (fail open).
     */
    checkTriggerSuperseded({ repo, runId }) {
      return checkRunSuperseded({ repo, runId, exec });
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
 * Best-effort conclusion of the prior real attempt, so a debounced run — whose
 * own conclusion is a green "success" with every job skipped — can say what
 * the last real full-suite attempt actually did (LS-10309). Any error degrades
 * to "unknown"; it must never change the skip decision (LS-9329).
 */
function priorConclusionOf(api, repo, runId) {
  if (typeof api.getRunConclusion !== 'function') return 'unknown';
  try {
    return api.getRunConclusion({ repo, runId }) || 'unknown';
  } catch {
    return 'unknown';
  }
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
 * @param {string|number} [opts.triggerRunId]  the Deploy run that triggered
 *   this one (`workflow_run.id`); checked for supersession (LS-10964) and for
 *   a withheld Deploy Web (LS-11040)
 * @param {string} [opts.triggerConclusion]  that run's conclusion
 *   (`workflow_run.conclusion`); `cancelled` skips (LS-11040)
 * @param {{ listRuns: Function, countSentinelJobs: Function, checkTriggerSuperseded?: Function }} api
 * @returns {{ decision: string, reason: string, inspected: number, foundRunId?: number|string, priorConclusion?: string, error?: string, webWithheldRunId?: number|string }}
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
    triggerRunId: triggerId,
    triggerConclusion,
  } = opts;

  if (eventName !== 'workflow_run') {
    return {
      decision: DECISION.RUN,
      reason: 'Manual dispatch — always runs.',
      inspected: 0,
    };
  }

  // LS-11040: a cancelled Deploy is almost always a pending run replaced by a
  // newer push (deploy-main keeps one pending run), so it deployed nothing,
  // and the replacing run triggers this lane when it completes. Read from the
  // event payload, so this costs no API call and cannot fail.
  if (triggerConclusion === 'cancelled') {
    return {
      decision: DECISION.SKIP_CANCELLED_TRIGGER,
      reason: `Triggering Deploy run ${triggerId ?? '(unknown)'} was cancelled, so production may not reflect its commit; the next completed Deploy will trigger this lane.`,
      inspected: 0,
    };
  }

  // LS-10964: a superseded Deploy deployed nothing; the newer Deploy run will
  // trigger this lane again. Fail open: an error or a missing id never skips.
  let webWithheldRunId;
  if (triggerId && typeof api.checkTriggerSuperseded === 'function') {
    let superseded;
    try {
      superseded = api.checkTriggerSuperseded({ repo, runId: triggerId });
    } catch {
      superseded = null;
    }
    if (superseded?.superseded === true) {
      return {
        decision: DECISION.SKIP_SUPERSEDED,
        reason: `Triggering Deploy run ${triggerId} was superseded by a newer push and deployed nothing; the newer Deploy will trigger this lane.`,
        inspected: 0,
      };
    }
    if (superseded?.webWithheld === true) webWithheldRunId = triggerId;
  }
  // LS-11040: a withheld web never skips the lane, it only labels the result.
  const tag = (result) =>
    webWithheldRunId === undefined ? result : { ...result, webWithheldRunId };

  let runs;
  try {
    runs = api.listRuns({ repo, workflowFile, cutoff });
  } catch (err) {
    return tag({
      decision: DECISION.SKIP_INCONCLUSIVE,
      reason: 'gh api failed while listing prior runs',
      error: ghErrorMessage(err),
      inspected: 0,
    });
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
      return tag({
        decision: DECISION.SKIP_INCONCLUSIVE,
        reason: `gh api failed while inspecting the jobs of prior run ${run.id}`,
        error: ghErrorMessage(err),
        inspected,
      });
    }
    inspected += 1;
    if (prepared > 0) {
      return tag({
        decision: DECISION.SKIP_DEBOUNCED,
        reason: `Debounced — run ${run.id} already made a real attempt (non-skipped "${sentinelJob}") within the interval.`,
        foundRunId: run.id,
        priorConclusion: priorConclusionOf(api, repo, run.id),
        inspected,
      });
    }
  }

  return tag({
    decision: DECISION.RUN,
    reason: `No automated run made a real attempt (non-skipped "${sentinelJob}") within the interval.`,
    inspected,
  });
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
    // Human-facing label for a skipped run (LS-10309), e.g. a job name in the
    // run's job list and main's check-runs, so a green skipped run is never
    // read as a passing full suite.
    const skipLabel =
      result.decision === DECISION.SKIP_DEBOUNCED
        ? `Debounced — last real attempt: ${result.priorConclusion ?? 'unknown'} (run ${result.foundRunId}), full suite NOT run`
        : result.decision === DECISION.SKIP_SUPERSEDED
          ? 'Skipped — triggering Deploy was superseded (deployed nothing), full suite NOT run'
          : result.decision === DECISION.SKIP_CANCELLED_TRIGGER
            ? 'Skipped — triggering Deploy was cancelled, full suite NOT run'
            : 'Skipped — gate inconclusive (gh api error), full suite NOT run';
    outputLines.push(`skip-label=${skipLabel}`);
  }
  // LS-11040: lets the results notification say the web was not deployed.
  // Emitted only when true, so an unset output reads as "not withheld".
  if (result.webWithheldRunId !== undefined) {
    outputLines.push('web-withheld=true');
  }

  const heading =
    result.decision === DECISION.RUN
      ? `## ${title} — RUNNING`
      : result.decision === DECISION.SKIP_DEBOUNCED
        ? `## ${title} — SKIPPED (debounced)`
        : result.decision === DECISION.SKIP_SUPERSEDED
          ? `## ${title} — SKIPPED (superseded deploy)`
          : result.decision === DECISION.SKIP_CANCELLED_TRIGGER
            ? `## ${title} — SKIPPED (cancelled deploy)`
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
      `- **Last real attempt: \`${result.priorConclusion ?? 'unknown'}\`** — this run's green status means *skipped*, not *passed*.`,
    );
  } else if (result.decision === DECISION.SKIP_SUPERSEDED) {
    summaryLines.push(
      `- Decision: **superseded → skip** — ${result.reason} This run does not count toward the debounce.`,
    );
  } else if (result.decision === DECISION.SKIP_CANCELLED_TRIGGER) {
    summaryLines.push(
      `- Decision: **cancelled deploy → skip** — ${result.reason} This run does not count toward the debounce.`,
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
  const withheldText =
    result.webWithheldRunId === undefined
      ? null
      : `Triggering Deploy run ${result.webWithheldRunId} withheld Deploy Web (a lambda child failed or was cancelled): the web under test is the previously deployed build and the backend may be ahead of it (LS-11040).`;
  if (withheldText)
    summaryLines.push(`- ⚠️ **Web NOT deployed.** ${withheldText}`);

  const logLines = [
    `[${title}] decision=${result.decision} should-run=${shouldRun} cutoff=${cutoff} interval=${interval} inspected=${result.inspected}`,
    `[${title}] ${result.reason}`,
  ];
  if (result.error) logLines.push(`[${title}] gh error: ${result.error}`);
  // Workflow-command annotation (stdout) so the skip is visible on the run page.
  if (result.decision === DECISION.SKIP_DEBOUNCED) {
    const prior = result.priorConclusion ?? 'unknown';
    const level = prior === 'success' ? 'notice' : 'warning';
    logLines.push(
      `::${level} title=${title} — debounced (full suite NOT run)::Last real attempt (run ${result.foundRunId}) concluded ${prior}.`,
    );
  } else if (result.decision === DECISION.SKIP_SUPERSEDED) {
    logLines.push(
      `::notice title=${title} — skipped (superseded deploy)::${result.reason.replace(/\r?\n/g, ' ')} (LS-10964)`,
    );
  } else if (result.decision === DECISION.SKIP_CANCELLED_TRIGGER) {
    logLines.push(
      `::notice title=${title} — skipped (cancelled deploy)::${result.reason.replace(/\r?\n/g, ' ')} (LS-11040)`,
    );
  } else if (result.decision === DECISION.SKIP_INCONCLUSIVE) {
    logLines.push(
      `::warning title=${title} — full suite NOT run::Gate inconclusive (${result.reason.replace(/\r?\n/g, ' ')}) — skipped fail-open (LS-9329). This green run tested nothing.`,
    );
  }

  if (withheldText && shouldRun) {
    logLines.push(
      `::warning title=${title} — web NOT deployed::${withheldText}`,
    );
  }

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
      triggerRunId: triggerRunId(),
      triggerConclusion: triggerRunConclusion(),
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
