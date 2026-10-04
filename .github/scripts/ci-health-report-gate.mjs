import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * ci-health-report-gate.mjs — the debounce decision for ci-health-report.yml
 * (LS-10558).
 *
 * The CI Health Report listens on every "Legacy Sports CI Orchestrator"
 * completion (dozens an hour) but must analyze at most once per
 * MIN_INTERVAL_HOURS (default 168h). Manual dispatch always runs.
 *
 * WHY A MARKER ARTIFACT: the previous inline gate listed every automated run
 * of this workflow inside the window (`--paginate`) and then called
 * `/actions/runs/{id}/jobs` once per run until it found one whose "Analyze"
 * job had run. Nearly every run is debounced, so the last analyzing run sat
 * thousands of runs back and every trigger cost O(runs-in-window) calls on
 * the repo's shared GITHUB_TOKEN — the main drain behind the 2026-10-04
 * "API rate limit exceeded for installation" outage (run 37214281121).
 *
 * Instead, the Analyze job of an automated run uploads a tiny artifact named
 * MARKER_ARTIFACT_NAME as its FIRST step (so a failed analysis still counts as
 * an attempt, matching the old "Analyze conclusion != skipped" rule). The gate
 * reads the newest such artifact with one name-filtered list call and compares
 * its created_at against the cutoff: exactly one API call per trigger, however
 * busy the repo is. Manual dispatches do not upload the marker, so — as
 * before — they neither debounce nor are debounced.
 *
 * Fail-safe: any `gh api` error (403 rate limit included) or unparseable
 * response resolves to `skip-inconclusive` → should-run=false. A missed weekly
 * report self-heals on the next orchestrator completion; failing the job, or
 * failing open and re-analyzing on every completion, would not (LS-9329,
 * LS-10336 — same policy as full-suite-gate.mjs).
 *
 * Logging: console.* is used deliberately — this runs on a bare runner from a
 * sparse checkout of .github/scripts and cannot import workspace packages
 * (AGENTS.md, Code Quality → No console.*, build-time script exception).
 */

export const MARKER_ARTIFACT_NAME = 'ci-health-report-marker';

export const DECISION = Object.freeze({
  RUN: 'run',
  SKIP_DEBOUNCED: 'skip-debounced',
  SKIP_INCONCLUSIVE: 'skip-inconclusive',
});

/** ISO-8601 UTC timestamp without milliseconds. */
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
 * Wrap a `gh` executor into the single API read the decision needs.
 * `exec(args)` must run `gh <args>` and return stdout, throwing (with
 * `.stderr`) on a non-zero exit — which is what `execFileSync` does.
 */
export function createGhApi(exec) {
  return {
    /**
     * The newest marker artifact as `{ created_at, run_id }`, or null when none
     * exists. One request, no pagination: the list is newest-first, and the
     * max over the first 100 is taken rather than trusting `.[0]` alone.
     */
    latestMarker({ repo, artifactName }) {
      const out = exec([
        'api',
        `repos/${repo}/actions/artifacts?name=${encodeURIComponent(artifactName)}&per_page=100`,
        '--jq',
        '[.artifacts[] | {created_at, run_id: .workflow_run.id}] | max_by(.created_at) // empty | @json',
      ]).trim();
      if (!out) return null;
      const marker = JSON.parse(out);
      if (Number.isNaN(Date.parse(marker?.created_at ?? ''))) {
        throw new Error(`unexpected artifacts response: ${out}`);
      }
      return marker;
    },
  };
}

/**
 * The gate decision.
 *
 * @param {{ eventName: string, repo: string, cutoff: string, artifactName?: string }} opts
 * @param {{ latestMarker: Function }} api
 * @returns {{ decision: string, reason: string, apiCalls: number, foundRunId?: number|string, markerCreatedAt?: string, error?: string }}
 */
export function decideHealthReportGate(opts, api) {
  const { eventName, repo, cutoff, artifactName = MARKER_ARTIFACT_NAME } = opts;

  if (eventName !== 'workflow_run') {
    return {
      decision: DECISION.RUN,
      reason: 'Manual dispatch — always runs.',
      apiCalls: 0,
    };
  }

  let marker;
  try {
    marker = api.latestMarker({ repo, artifactName });
  } catch (err) {
    return {
      decision: DECISION.SKIP_INCONCLUSIVE,
      reason: `gh api failed while reading the latest "${artifactName}" artifact`,
      error: ghErrorMessage(err),
      apiCalls: 1,
    };
  }

  if (marker && Date.parse(marker.created_at) > Date.parse(cutoff)) {
    return {
      decision: DECISION.SKIP_DEBOUNCED,
      reason: `Debounced — run ${marker.run_id} already analyzed at ${marker.created_at}.`,
      foundRunId: marker.run_id,
      markerCreatedAt: marker.created_at,
      apiCalls: 1,
    };
  }

  return {
    decision: DECISION.RUN,
    reason: marker
      ? `Last automated report (run ${marker.run_id}) was at ${marker.created_at}, before the cutoff.`
      : 'No automated report marker found.',
    apiCalls: 1,
  };
}

/**
 * Render a decision into `$GITHUB_OUTPUT` lines, step-summary markdown and
 * job-log lines (step summaries are not API-readable, so the log is the only
 * place a later investigation can see why a run did or did not analyze).
 */
export function renderGateDecision(result, { cutoff, minIntervalHours }) {
  const shouldRun = result.decision === DECISION.RUN;
  const interval = `${minIntervalHours}h`;
  const title = 'CI Health Report Gate';

  const heading = {
    [DECISION.RUN]: `## ${title} — RUNNING`,
    [DECISION.SKIP_DEBOUNCED]: `## ${title} — SKIPPED (debounced)`,
    [DECISION.SKIP_INCONCLUSIVE]: `## ${title} — SKIPPED (inconclusive)`,
  }[result.decision];

  const summaryLines = [
    heading,
    '',
    `- Cutoff: ${cutoff} (interval: ${interval})`,
    `- Decision: ${result.reason}`,
  ];
  if (result.error) summaryLines.push('```', result.error, '```');

  const logLines = [
    `[${title}] decision=${result.decision} should-run=${shouldRun} cutoff=${cutoff} interval=${interval} api-calls=${result.apiCalls}`,
    `[${title}] ${result.reason}`,
  ];
  if (result.error) {
    logLines.push(
      `[${title}] gh error: ${result.error}`,
      `::warning title=${title} — report NOT run::Gate inconclusive (gh api error) — skipped fail-safe.`,
    );
  }

  return { outputLines: [`should-run=${shouldRun}`], summaryLines, logLines };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

/**
 * CLI. Reads GITHUB_EVENT_NAME, GITHUB_REPOSITORY, GITHUB_OUTPUT,
 * GITHUB_STEP_SUMMARY, GH_TOKEN (for `gh`) and MIN_INTERVAL_HOURS. Exits 0
 * once its outputs are written — the decision is the failure channel.
 */
function main() {
  const minIntervalHours = requireEnv('MIN_INTERVAL_HOURS');
  const cutoff = isoCutoff(new Date(), Number(minIntervalHours));

  const api = createGhApi((args) =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );

  const result = decideHealthReportGate(
    {
      eventName: process.env.GITHUB_EVENT_NAME,
      repo: requireEnv('GITHUB_REPOSITORY'),
      cutoff,
    },
    api,
  );

  const { outputLines, summaryLines, logLines } = renderGateDecision(result, {
    cutoff,
    minIntervalHours,
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
