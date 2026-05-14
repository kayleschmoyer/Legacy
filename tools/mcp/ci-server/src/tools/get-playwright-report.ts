import type { ToolResult } from '../types.js';
import {
  fetchPlaywrightReport,
  fullTitle,
  reportUrlFor,
} from '../playwright-report.js';

interface TestFileSummary {
  fileName: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
}

interface ReportStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  ok: boolean;
}

interface FailureDetail {
  name: string;
  file: string;
  error: string | null;
  snippet: string | null;
}

interface SkippedTestDetail {
  name: string;
  file: string;
  reason: string | null;
}

interface ReportResult {
  reportName: string;
  url: string;
  stats: ReportStats;
  files: TestFileSummary[];
  failedTests: string[];
  flakyTests: string[];
  skippedTests: SkippedTestDetail[];
  failureDetails: FailureDetail[];
}

export async function getPlaywrightReport(params: {
  reportName: string;
}): Promise<ToolResult> {
  const { reportName } = params;

  const report = await fetchPlaywrightReport(reportName);
  if ('error' in report) {
    return {
      isError: true,
      content: [{ type: 'text', text: report.error }],
    };
  }

  const stats = report.stats;
  const files: TestFileSummary[] = (report.files ?? []).map((file) => {
    const fileStats = file.stats;
    if (fileStats) {
      return {
        fileName: file.fileName,
        total: fileStats.total,
        passed: fileStats.expected,
        failed: fileStats.unexpected,
        skipped: fileStats.skipped,
        flaky: fileStats.flaky,
      };
    }
    let passed = 0,
      failed = 0,
      skipped = 0,
      flaky = 0;
    for (const test of file.tests ?? []) {
      if (test.outcome === 'expected') passed++;
      else if (test.outcome === 'unexpected') failed++;
      else if (test.outcome === 'skipped') skipped++;
      else if (test.outcome === 'flaky') flaky++;
    }
    return {
      fileName: file.fileName,
      total: (file.tests ?? []).length,
      passed,
      failed,
      skipped,
      flaky,
    };
  });

  const failedTests: string[] = [];
  const flakyTests: string[] = [];
  const skippedTests: SkippedTestDetail[] = [];
  const failureDetails: FailureDetail[] = [];
  for (const file of report.files ?? []) {
    for (const test of file.tests ?? []) {
      const title = fullTitle(test);
      if (test.outcome === 'unexpected') {
        failedTests.push(title);
        const firstResult = test.results?.find(
          (r) => r.errors && r.errors.length > 0,
        );
        const firstError = firstResult?.errors?.[0];
        failureDetails.push({
          name: title,
          file: file.fileName,
          error: firstError?.message ?? firstError?.value ?? null,
          snippet: firstError?.snippet ?? null,
        });
      } else if (test.outcome === 'flaky') {
        flakyTests.push(title);
      } else if (test.outcome === 'skipped') {
        const skipAnnotation = test.annotations?.find(
          (a) => a.type === 'skip' || a.type === 'fixme',
        );
        skippedTests.push({
          name: title,
          file: file.fileName,
          reason: skipAnnotation?.description ?? null,
        });
      }
    }
  }

  const result: ReportResult = {
    reportName,
    url: reportUrlFor(reportName),
    stats: {
      total: stats.total,
      passed: stats.expected,
      failed: stats.unexpected,
      skipped: stats.skipped,
      flaky: stats.flaky,
      ok: stats.ok,
    },
    files,
    failedTests,
    flakyTests,
    skippedTests,
    failureDetails,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}
