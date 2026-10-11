import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * deploy-superseded.mjs — did a Deploy run skip itself as superseded (LS-10964)?
 *
 * deploy.yml's `Supersede Gate` job skips a push-triggered Deploy when the
 * merge queue has landed more of a batch behind it. Such a run deploys nothing
 * and concludes `success`, but `workflow_run: completed` still fires every
 * post-deploy consumer. The full-suite lanes would spend their debounce window
 * testing a production that has not changed yet, minutes before the real
 * deploy lands.
 *
 * A superseded run is recognised from its jobs: `Supersede Gate` concluded
 * `success` and `Detect Deploy Targets` (which every deploy child needs)
 * concluded `skipped`. A gate that failed, was cancelled, or let the deploy
 * through does not match. Neither does any run of another workflow, which
 * lets consumers that also listen on other workflows call this
 * unconditionally.
 *
 * Fail open: any error (API, missing run id, unexpected shape) reports
 * "not superseded", so the consumer behaves exactly as it did before LS-10964.
 *
 * The same jobs read also answers whether that Deploy WITHHELD the web deploy
 * (LS-11040): Deploy Web skipped while Upload Lambdas or Apply Lambda
 * Infrastructure failed or was cancelled. A post-deploy suite that runs off
 * such a Deploy tests the previously deployed web against a backend that may
 * already be ahead of it, so it labels itself (full-suite-gate.mjs).
 *
 * Used by:
 *   - full-suite-gate.mjs (run-playwright-tests, cross-browser-e2e,
 *     run-maestro-sweep, e2e-native-android)
 *   - lambda-drift-check.yml and terraform-lock-watchdog.yml through the CLI
 *     below
 *
 * Logging: console.* is used deliberately; this is a build-time script run
 * from a sparse checkout (AGENTS.md, Code Quality → No console.*).
 */

/** Job display names in deploy.yml. Pinned by deploy-superseded.test.mjs. */
export const SUPERSEDE_GATE_JOB = 'Supersede Gate';
export const DETECT_JOB = 'Detect Deploy Targets';

/**
 * Caller-job display names of the deploy children whose results decide
 * whether Deploy Web was withheld (LS-11040). A reusable-workflow caller job
 * shows up in the jobs API as `<caller> / <inner job>` when it ran and as
 * `<caller>` alone when it was skipped. Pinned by deploy-superseded.test.mjs.
 */
export const DEPLOY_WEB_JOB = 'Deploy Web';
export const LAMBDA_JOBS = Object.freeze([
  'Upload Lambdas',
  'Apply Lambda Infrastructure',
]);

const jobsOf = (jobs, caller) =>
  jobs.filter(
    (job) => job?.name === caller || job?.name?.startsWith(`${caller} / `),
  );

/**
 * Pure decision over a run's jobs (the `jobs` array of the Actions jobs API).
 *
 * @param {{ name: string, conclusion: string|null }[]} jobs
 * @returns {boolean}
 */
export function isSupersededDeployJobs(jobs) {
  if (!Array.isArray(jobs)) return false;
  const byName = (name) => jobs.find((job) => job?.name === name);
  const gate = byName(SUPERSEDE_GATE_JOB);
  const detect = byName(DETECT_JOB);
  return gate?.conclusion === 'success' && detect?.conclusion === 'skipped';
}

/**
 * Did this Deploy run withhold Deploy Web behind a failed or cancelled lambda
 * child (LS-11040)? deploy.yml's deploy-web `if` blocks on exactly those
 * results, so "every Deploy Web job skipped AND a lambda job failed/cancelled"
 * is the withheld case. A web that was simply not targeted (lambda children
 * green or skipped) does not match.
 *
 * @param {{ name: string, conclusion: string|null }[]} jobs
 * @returns {boolean}
 */
export function isWebWithheldJobs(jobs) {
  if (!Array.isArray(jobs)) return false;
  const web = jobsOf(jobs, DEPLOY_WEB_JOB);
  if (web.length === 0 || web.some((job) => job.conclusion !== 'skipped')) {
    return false;
  }
  return LAMBDA_JOBS.some((caller) =>
    jobsOf(jobs, caller).some(
      (job) => job.conclusion === 'failure' || job.conclusion === 'cancelled',
    ),
  );
}

/**
 * Look up whether run `runId` was a superseded Deploy run, and whether it
 * withheld Deploy Web (LS-11040). Never throws.
 *
 * @param {{ repo: string, runId: string|number|undefined|null, exec: (args: string[]) => string }} opts
 *   `exec(args)` runs `gh <args>` and returns stdout, throwing on failure.
 * @returns {{ superseded: boolean, webWithheld: boolean, reason: string }}
 */
export function checkRunSuperseded({ repo, runId, exec }) {
  if (!runId) {
    return {
      superseded: false,
      webWithheld: false,
      reason: 'no triggering run id',
    };
  }
  let jobs;
  try {
    const out = exec([
      'api',
      `repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
      '--jq',
      '[.jobs[] | {name, conclusion}]',
    ]);
    jobs = JSON.parse(out);
  } catch (err) {
    const detail = (err?.stderr || err?.message || String(err)).toString();
    return {
      superseded: false,
      webWithheld: false,
      reason: `could not read the jobs of run ${runId} (${detail.trim()}); treating it as a real deploy`,
    };
  }
  if (isSupersededDeployJobs(jobs)) {
    return {
      superseded: true,
      webWithheld: false,
      reason: `run ${runId} was a superseded Deploy (Supersede Gate skipped it; it deployed nothing)`,
    };
  }
  const webWithheld = isWebWithheldJobs(jobs);
  return {
    superseded: false,
    webWithheld,
    reason: webWithheld
      ? `run ${runId} was not a superseded Deploy, but it withheld Deploy Web (a lambda child failed or was cancelled)`
      : `run ${runId} was not a superseded Deploy`,
  };
}

/**
 * The triggering run's conclusion: `TRIGGER_RUN_CONCLUSION` when set,
 * otherwise `workflow_run.conclusion` from the event payload. Undefined for
 * any other event or an unreadable payload (LS-11040).
 */
export function triggerRunConclusion(env = process.env) {
  if (env.TRIGGER_RUN_CONCLUSION) return env.TRIGGER_RUN_CONCLUSION;
  if (env.GITHUB_EVENT_NAME !== 'workflow_run' || !env.GITHUB_EVENT_PATH) {
    return undefined;
  }
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    return event?.workflow_run?.conclusion ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The triggering run's id: `TRIGGER_RUN_ID` when set, otherwise
 * `workflow_run.id` from the event payload. Undefined for any other event.
 */
export function triggerRunId(env = process.env) {
  if (env.TRIGGER_RUN_ID) return env.TRIGGER_RUN_ID;
  if (env.GITHUB_EVENT_NAME !== 'workflow_run' || !env.GITHUB_EVENT_PATH) {
    return undefined;
  }
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    return event?.workflow_run?.id ?? undefined;
  } catch {
    return undefined;
  }
}

export function ghExec(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * CLI: writes `superseded=true|false` to $GITHUB_OUTPUT and always exits 0.
 * Env: GITHUB_REPOSITORY, GH_TOKEN, and TRIGGER_RUN_ID or a workflow_run event.
 */
function main() {
  const runId = triggerRunId();
  const result =
    process.env.GITHUB_EVENT_NAME === 'workflow_run' ||
    process.env.TRIGGER_RUN_ID
      ? checkRunSuperseded({
          repo: process.env.GITHUB_REPOSITORY ?? '',
          runId,
          exec: ghExec,
        })
      : { superseded: false, reason: 'not a workflow_run event' };

  console.log(
    `[deploy-superseded] superseded=${result.superseded} — ${result.reason}`,
  );
  if (result.superseded) {
    console.log(
      `::notice title=Triggering Deploy was superseded::${result.reason}. Skipping (LS-10964); the newer Deploy run will trigger this workflow again.`,
    );
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `superseded=${result.superseded}\n`,
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY && result.superseded) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Skipped — triggering Deploy was superseded\n\n${result.reason}. The newer Deploy run triggers this workflow again (LS-10964).\n`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
