import type { ToolResult } from '../types.js';
import {
  fetchPlaywrightReport,
  fullTitle,
  reportUrlFor,
  type PlaywrightTest,
  type PlaywrightTestFile,
  type PlaywrightTestResult,
} from '../playwright-report.js';

/** Hard cap on any single string field in the response. Prevents a chatty
 * test (huge stdout / multi-MB snippet) from blowing past MCP limits. */
const MAX_FIELD_CHARS = 4000;

function truncate(input: string | undefined | null): string | null {
  if (input == null) return null;
  if (input.length <= MAX_FIELD_CHARS) return input;
  return (
    input.slice(0, MAX_FIELD_CHARS) +
    `\n...[truncated ${input.length - MAX_FIELD_CHARS} chars]`
  );
}

function chunkText(
  chunks: Array<{ text?: string; buffer?: string }> | undefined,
): string | null {
  if (!chunks || chunks.length === 0) return null;
  const joined = chunks
    .map(
      (c) =>
        c.text ??
        (c.buffer ? Buffer.from(c.buffer, 'base64').toString('utf-8') : ''),
    )
    .join('');
  return truncate(joined);
}

interface AttemptSummary {
  attempt: number;
  status: string;
  durationMs: number | null;
  startTime: string | null;
  error: string | null;
  snippet: string | null;
  errorLocation: string | null;
  stdout: string | null;
  stderr: string | null;
  attachments: Array<{
    name: string | null;
    contentType: string | null;
    path: string | null;
  }>;
}

interface Candidate {
  title: string;
  file: string;
  outcome: string;
  projectName: string | null;
}

interface TestResultResponse {
  matched: boolean;
  reportName: string;
  url: string;
  candidates?: Candidate[];
  test?: {
    title: string;
    file: string;
    outcome: string;
    projectName: string | null;
    location: string | null;
    retries: number;
    attempts: AttemptSummary[];
  };
  message?: string;
}

function summariseAttempt(
  result: PlaywrightTestResult,
  index: number,
): AttemptSummary {
  const firstError = result.errors?.find(
    (e) => e.message || e.value || e.snippet,
  );
  const loc = firstError?.location;
  const errorLocation =
    loc && loc.file
      ? `${loc.file}${loc.line != null ? `:${loc.line}` : ''}${loc.column != null ? `:${loc.column}` : ''}`
      : null;
  return {
    attempt: result.retry ?? index,
    status: result.status,
    durationMs: result.duration ?? null,
    startTime: result.startTime ?? null,
    error: truncate(firstError?.message ?? firstError?.value ?? null),
    snippet: truncate(firstError?.snippet ?? null),
    errorLocation,
    stdout: chunkText(result.stdout),
    stderr: chunkText(result.stderr),
    attachments: (result.attachments ?? []).map((a) => ({
      name: a.name ?? null,
      contentType: a.contentType ?? null,
      path: a.path ?? null,
    })),
  };
}

export async function getPlaywrightTestResult(params: {
  reportName: string;
  testTitle: string;
  fileName?: string;
}): Promise<ToolResult> {
  const { reportName, testTitle, fileName } = params;

  const report = await fetchPlaywrightReport(reportName);
  if ('error' in report) {
    return {
      isError: true,
      content: [{ type: 'text', text: report.error }],
    };
  }

  const titleNeedle = testTitle.toLowerCase();
  const fileNeedle = fileName?.toLowerCase();

  const matches: Array<{ file: PlaywrightTestFile; test: PlaywrightTest }> = [];
  for (const file of report.files ?? []) {
    if (fileNeedle && !file.fileName.toLowerCase().includes(fileNeedle)) {
      continue;
    }
    for (const test of file.tests ?? []) {
      if (fullTitle(test).toLowerCase().includes(titleNeedle)) {
        matches.push({ file, test });
      }
    }
  }

  const url = reportUrlFor(reportName);

  if (matches.length === 0) {
    const response: TestResultResponse = {
      matched: false,
      reportName,
      url,
      candidates: [],
      message: fileNeedle
        ? `No test matched title "${testTitle}" in files matching "${fileName}".`
        : `No test matched title "${testTitle}".`,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    };
  }

  if (matches.length > 1) {
    const response: TestResultResponse = {
      matched: false,
      reportName,
      url,
      candidates: matches.slice(0, 25).map(({ file, test }) => ({
        title: fullTitle(test),
        file: file.fileName,
        outcome: test.outcome,
        projectName: test.projectName ?? null,
      })),
      message:
        `Found ${matches.length} tests matching "${testTitle}". ` +
        `Pass fileName to disambiguate, or use a more specific testTitle.`,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    };
  }

  const { file, test } = matches[0];
  const loc = test.location;
  const location =
    loc && loc.file
      ? `${loc.file}${loc.line != null ? `:${loc.line}` : ''}${loc.column != null ? `:${loc.column}` : ''}`
      : null;

  const results = test.results ?? [];
  const response: TestResultResponse = {
    matched: true,
    reportName,
    url,
    test: {
      title: fullTitle(test),
      file: file.fileName,
      outcome: test.outcome,
      projectName: test.projectName ?? null,
      location,
      retries: Math.max(0, results.length - 1),
      attempts: results.map((r, i) => summariseAttempt(r, i)),
    },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
  };
}
