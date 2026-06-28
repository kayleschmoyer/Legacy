import type { ToolResult } from '../types.js';
import {
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
 */
/** Numeric-only run IDs resolve to nightly-{id} or manual-{id} on GH Pages. */
const NUMERIC_ID_RE = /^\d+$/;

export async function getPlaywrightReport(params: {
  reportName: string;
}): Promise<ToolResult> {
  const { reportName } = params;

  // Try the name directly; for bare numeric run IDs also try nightly-{id} and
  // manual-{id} — the CI workflow deploys under those prefixes.
  const namesToTry = [reportName];
  if (NUMERIC_ID_RE.test(reportName)) {
    namesToTry.push(`nightly-${reportName}`, `manual-${reportName}`);
  }

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
  }

  const triedNames = namesToTry.join(', ');
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Report not found. Tried: ${triedNames}. If this is an integration nightly run, pass source="s3" to ci_get_playwright_test_result with the numeric run ID to fetch from S3 instead.`,
      },
    ],
  };
}
