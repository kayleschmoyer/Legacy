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
export async function getPlaywrightReport(params: {
  reportName: string;
}): Promise<ToolResult> {
  const { reportName } = params;
  const url = reportUrlFor(reportName);

  const published = await fetchPlaywrightSummary(reportName);
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

  const report = await fetchPlaywrightReport(reportName);
  if ('error' in report) {
    return {
      isError: true,
      content: [{ type: 'text', text: report.error }],
    };
  }

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
