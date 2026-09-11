import { minifiedJson } from '@legacy-sports/mcp-format';
import type { ToolResult } from '../types.js';
import {
  fetchDeployReportJobStatus,
  fetchPlaywrightReport,
  fetchPlaywrightSummary,
  renderReportAsMarkdown,
  reportUrlFor,
} from '../playwright-report.js';
import { deploysTokenWasFallback, githubGet } from '../github-api.js';
import { listPlaywrightS3Artifacts, resolveRunSha } from '../s3-artifacts.js';

/**
 * Return a Playwright report as compact, agent-targeted Markdown.
 *
 * Markdown is markedly cheaper for an agent to parse than the full HTML SPA or
 * raw report.json. We prefer the `summary.md` that CI publishes next to the
 * HTML report (one HTTP GET, no zip inflation); when it is absent — historical
 * reports, or runs that predate the reporter — we inflate the embedded
 * report.json and render the identical layout server-side.
 *
 * Resolution priority when multiple params are provided:
 *   prNumber → "pr-{n}"  (most specific — targets the PR's latest E2E run)
 *   runId    → "{id}"    (numeric, auto-expanded to nightly-/manual- fallbacks)
 *   reportName           (exact name, also numeric-expanded when all-digits)
 */
/** Numeric-only run IDs resolve to nightly-{id} or manual-{id} on GH Pages. */
const NUMERIC_ID_RE = /^\d+$/;

interface GitHubPullRequest {
  head: { sha: string };
}

/**
 * Resolve the commit SHA to use for an S3 blob-artifact lookup, from
 * whichever resolution input the caller originally supplied.
 * Returns null when no SHA can be resolved (e.g. the API call itself fails).
 */
async function resolveShaForS3Fallback(params: {
  prNumber?: number;
  runId?: number;
  reportName: string;
}): Promise<{ sha: string; runId: number | null } | null> {
  try {
    if (params.runId !== undefined) {
      return { sha: await resolveRunSha(params.runId), runId: params.runId };
    }
    if (params.prNumber !== undefined) {
      const pr = await githubGet<GitHubPullRequest>(
        `/pulls/${params.prNumber}`,
      );
      return { sha: pr.head.sha, runId: null };
    }
    if (NUMERIC_ID_RE.test(params.reportName)) {
      const runId = Number(params.reportName);
      return { sha: await resolveRunSha(runId), runId };
    }
  } catch {
    // Resolution failed — caller falls through to the generic GH-Pages error.
  }
  return null;
}

/**
 * When the GH Pages fetch failed because this session lacks
 * PREVIEW_APP_PRIVATE_KEY/PREVIEW_APP_ID (a credentials gap, not a missing
 * report — LS-9236), automatically fall back to listing the raw S3 blob
 * artifacts instead of erroring, mirroring the source="s3" fallback that
 * ci_get_playwright_test_result already supports for the same artifact class.
 * Returns null when the fallback isn't applicable or comes up empty, so the
 * caller can fall through to its existing error handling unchanged.
 */
async function tryS3Fallback(params: {
  prNumber?: number;
  runId?: number;
  reportName: string;
}): Promise<ToolResult | null> {
  if (!deploysTokenWasFallback()) return null;

  const resolved = await resolveShaForS3Fallback(params);
  if (!resolved) return null;

  let s3Result;
  try {
    s3Result = await listPlaywrightS3Artifacts(resolved.sha);
  } catch {
    return null;
  }
  if (s3Result.empty) return null;

  const response = {
    source: 's3' as const,
    reason:
      'GH Pages report fetch failed with a credentials gap ' +
      '(PREVIEW_APP_PRIVATE_KEY/PREVIEW_APP_ID are not configured in this ' +
      'session) — falling back to raw S3 blob artifacts instead of erroring.',
    sha: resolved.sha,
    runId: resolved.runId,
    s3Prefix: s3Result.s3Prefix,
    artifactCount: s3Result.artifacts.length,
    artifacts: s3Result.artifacts,
    note:
      'Presigned URLs expire in 1 hour. Each artifact is a Playwright blob ' +
      'zip containing test results. Use `playwright merge-reports` or inspect ' +
      'the zip to extract individual test error-context.md / trace.zip files. ' +
      'For a rendered pass/fail summary instead of raw blobs, call ' +
      'ci_deploys_repo_auth_status (LS-8788) to see exactly which credential ' +
      'tier is missing, then ask a human to fix it per ' +
      '.agents/skills/read-playwright-report/SKILL.md.',
  };

  return {
    content: [{ type: 'text', text: minifiedJson(response) }],
  };
}

export async function getPlaywrightReport(params: {
  reportName?: string;
  prNumber?: number;
  runId?: number;
}): Promise<ToolResult> {
  const { prNumber, runId } = params;

  // Resolve the effective report name from whichever resolution input was given.
  const reportName =
    prNumber !== undefined
      ? `pr-${prNumber}`
      : runId !== undefined
        ? String(runId)
        : params.reportName;

  if (!reportName) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'One of prNumber, runId, or reportName is required.',
        },
      ],
    };
  }

  // Try the name directly; for bare numeric run IDs also try nightly-{id} and
  // manual-{id} — the CI workflow deploys under those prefixes.
  const namesToTry = [reportName];
  if (NUMERIC_ID_RE.test(reportName)) {
    namesToTry.push(`nightly-${reportName}`, `manual-${reportName}`);
  }

  let lastError = 'unknown fetch error';
  for (const name of namesToTry) {
    const url = reportUrlFor(name);

    const published = await fetchPlaywrightSummary(name);
    if (published && published.trim() !== '') {
      return {
        content: [
          {
            type: 'text',
            text: `${published}\n\n---\n_Source: ${url}summary.md_`,
          },
        ],
      };
    }

    const report = await fetchPlaywrightReport(name);
    if (!('error' in report)) {
      const markdown = renderReportAsMarkdown(report);
      return {
        content: [
          {
            type: 'text',
            text: `${markdown}\n\n---\n_Source: ${url} (rendered from report.json)_`,
          },
        ],
      };
    }

    // If this was the only name to try, surface the error — after first
    // trying the S3 fallback for a credentials-gap failure (LS-9236).
    if (namesToTry.length === 1) {
      const s3Fallback = await tryS3Fallback({ prNumber, runId, reportName });
      if (s3Fallback) return s3Fallback;
      // The S3 fallback couldn't help (unresolvable SHA, or an empty/failed
      // listing) — proactively flag the credentials-gap root cause (LS-9846)
      // instead of surfacing a bare 404, since this is the common single-name
      // lookup path (prNumber/reportName) that never reaches the multi-name
      // fallthrough message below.
      const credentialsGapNote = deploysTokenWasFallback()
        ? ' This session is using a fallback GitHub token without read access ' +
          'to the private legacy-sports-deploys repo (PREVIEW_APP_PRIVATE_KEY/' +
          'PREVIEW_APP_ID are not configured) — that is the likely cause of ' +
          'this 404, not a missing report. Try ci_get_playwright_test_result ' +
          'with source: "s3" and the numeric run ID to read raw artifacts from ' +
          'S3 instead.'
        : '';
      return {
        isError: true,
        content: [
          { type: 'text', text: `${report.error}${credentialsGapNote}` },
        ],
      };
    }
    lastError = report.error;
  }

  {
    const s3Fallback = await tryS3Fallback({ prNumber, runId, reportName });
    if (s3Fallback) return s3Fallback;
  }

  // No name variant resolved. When the failed name was numeric (a runId, or a
  // bare-numeric reportName), inspect the run's "Deploy Playwright Report" job
  // to explain *why* — a failed Merge Reports step, a successful deploy that
  // published zero blob reports, or (if the job can't be found) fall through
  // to the generic message unchanged (LS-7882).
  if (NUMERIC_ID_RE.test(reportName)) {
    const numericRunId = Number(reportName);
    try {
      const jobStatus = await fetchDeployReportJobStatus(numericRunId);
      if (jobStatus.jobFound) {
        const failureConclusion =
          jobStatus.mergeStepConclusion === 'failure'
            ? jobStatus.mergeStepConclusion
            : jobStatus.jobConclusion === 'failure'
              ? jobStatus.jobConclusion
              : null;
        if (failureConclusion) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text:
                  `The Deploy Playwright Report job's Merge Reports step failed for run ` +
                  `${numericRunId} (conclusion: ${failureConclusion}) — no report was published. ` +
                  `Check job logs with ci_get_logs({ runId: ${numericRunId} }).`,
              },
            ],
          };
        }
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text:
                `No Playwright blob reports were produced for run ${numericRunId} ` +
                `(0 shards uploaded artifacts) — the run may have been misconfigured ` +
                `or skipped before tests started.`,
            },
          ],
        };
      }
    } catch {
      // Jobs API unreachable — fall through to the generic message below.
    }
  }

  // Include the last per-name fetch error: it carries the
  // credentials-gap explanation from fetchFileContent when the request used
  // the broad fallback token (PREVIEW_APP_PRIVATE_KEY/PREVIEW_APP_ID unset),
  // in which case a 404 here does NOT mean the report is missing (LS-8546).
  const triedNames = namesToTry.join(', ');
  // Proactively call out the credentials-gap root cause (LS-9846) rather than
  // surfacing a bare 404: this still fires even when tryS3Fallback() above ran
  // but couldn't help (SHA unresolvable, or the S3 listing came back
  // empty/failed).
  const credentialsGapNote = deploysTokenWasFallback()
    ? ' This session is using a fallback GitHub token without read access to ' +
      'the private legacy-sports-deploys repo (PREVIEW_APP_PRIVATE_KEY/' +
      'PREVIEW_APP_ID are not configured) — that is the likely cause of this ' +
      '404, not a missing report. Try ci_get_playwright_test_result with ' +
      'source: "s3" and the numeric run ID to read raw artifacts from S3 instead.'
    : ' If this is an integration nightly run, pass source="s3" to ci_get_playwright_test_result with the numeric run ID to fetch from S3 instead.';
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Report not found. Tried: ${triedNames}. Last error: ${lastError}${credentialsGapNote}`,
      },
    ],
  };
}
