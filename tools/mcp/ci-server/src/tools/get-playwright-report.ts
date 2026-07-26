import type { ToolResult } from '../types.js';
import {
  fetchDeployReportJobStatus,
  fetchPlaywrightReport,
  fetchPlaywrightSummary,
  renderReportAsMarkdown,
  reportUrlFor,
} from '../playwright-report.js';

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

    // If this was the only name to try, surface the error.
    if (namesToTry.length === 1) {
      return {
        isError: true,
        content: [{ type: 'text', text: report.error }],
      };
    }
    lastError = report.error;
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
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Report not found. Tried: ${triedNames}. Last error: ${lastError} If this is an integration nightly run, pass source="s3" to ci_get_playwright_test_result with the numeric run ID to fetch from S3 instead.`,
      },
    ],
  };
}
