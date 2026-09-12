import { stripAnsiCodes } from './ansi.js';

/**
 * Server-side parsing of a Jest `--json --outputFile=<path>` report into the
 * compact failure list an agent actually needs (LS-10092).
 *
 * Before this, the only way to learn which tests failed was to read the raw
 * ANSI-coloured nx log — which, for a suite with a double-digit failure
 * count, overflows MAX_OUTPUT_CHARS and gets truncated straight through the
 * middle of the failure list. The observed case reported 16 failures and
 * surfaced 2 of the names; recovering the other 14 meant bypassing MCP for
 * `pnpm exec jest --json` plus a post-processing script.
 */

/** Per-failure message cap — enough for the assertion diff, not the whole stack. */
export const MAX_FAILURE_MESSAGE_LINES = 10;

/**
 * Cap on the number of failures listed. A run with more failing tests than
 * this is a "something is structurally broken" signal, not a list to work
 * through one by one — the count and the first 50 names carry that just as
 * well, and an uncapped list would reintroduce the overflow this fixes.
 */
export const MAX_FAILURES = 50;

export interface JestFailure {
  /** Test file the failure came from, repo-relative where it can be derived. */
  suite: string;
  /** Jest's `fullName` — the concatenated describe/it path. */
  fullName: string;
  /** First MAX_FAILURE_MESSAGE_LINES lines of the failure message, ANSI-stripped. */
  message: string;
}

export interface JestReportSummary {
  passed: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numFailedTestSuites: number;
  failures: JestFailure[];
  /** Present only when the failure list was capped at MAX_FAILURES. */
  omittedFailures?: number;
}

/** The subset of Jest's `--json` output this module reads. */
interface JestJsonAssertion {
  status?: unknown;
  fullName?: unknown;
  title?: unknown;
  failureMessages?: unknown;
}

interface JestJsonTestResult {
  name?: unknown;
  status?: unknown;
  message?: unknown;
  assertionResults?: unknown;
}

interface JestJsonReport {
  success?: unknown;
  numTotalTests?: unknown;
  numPassedTests?: unknown;
  numFailedTests?: unknown;
  numFailedTestSuites?: unknown;
  testResults?: unknown;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Make a suite path readable without assuming a particular checkout layout:
 * Jest writes absolute paths, so trim to the last few segments and normalise
 * Windows separators.
 */
function shortenSuitePath(name: string): string {
  const segments = name.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.slice(-3).join('/');
}

/**
 * Clip a failure message to its first `maxLines` lines and strip ANSI. The
 * head is the useful part for an assertion failure — Jest puts the expected/
 * received diff first and the (long, mostly node_modules) stack last.
 */
export function clipFailureMessage(
  message: string,
  maxLines: number = MAX_FAILURE_MESSAGE_LINES,
): string {
  const lines = stripAnsiCodes(message).split('\n');
  // Drop trailing blank lines so the "N more lines" note reflects real content.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  if (lines.length <= maxLines) return lines.join('\n');
  const omitted = lines.length - maxLines;
  return `${lines.slice(0, maxLines).join('\n')}\n[${omitted} more line${omitted === 1 ? '' : 's'} clipped]`;
}

function collectSuiteFailures(suite: JestJsonTestResult): JestFailure[] {
  const suiteName =
    typeof suite.name === 'string' ? shortenSuitePath(suite.name) : 'unknown';
  const assertions = Array.isArray(suite.assertionResults)
    ? (suite.assertionResults as JestJsonAssertion[])
    : [];

  const failures: JestFailure[] = [];
  for (const assertion of assertions) {
    if (assertion?.status !== 'failed') continue;
    const fullName =
      (typeof assertion.fullName === 'string' ? assertion.fullName : null) ??
      (typeof assertion.title === 'string' ? assertion.title : null) ??
      '(unnamed test)';
    const messages = Array.isArray(assertion.failureMessages)
      ? (assertion.failureMessages as unknown[]).filter(
          (m): m is string => typeof m === 'string',
        )
      : [];
    failures.push({
      suite: suiteName,
      fullName,
      message: clipFailureMessage(messages.join('\n')),
    });
  }

  // A suite that fails to compile or throws at module scope has a
  // suite-level `message` and zero assertionResults — without this branch the
  // most severe failure class would report as "0 failures".
  if (
    failures.length === 0 &&
    suite.status === 'failed' &&
    typeof suite.message === 'string' &&
    suite.message.trim() !== ''
  ) {
    failures.push({
      suite: suiteName,
      fullName: '(suite-level failure — no test ran)',
      message: clipFailureMessage(suite.message),
    });
  }

  return failures;
}

/**
 * Parse the contents of a Jest `--outputFile` report. Returns null when the
 * text is not a Jest JSON report (empty file, nx wrapper noise, a cache
 * replay that never wrote one) so callers can fall back to the raw output
 * rather than reporting a false green.
 */
export function parseJestJsonReport(raw: string): JestReportSummary | null {
  let parsed: JestJsonReport;
  try {
    parsed = JSON.parse(raw) as JestJsonReport;
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== 'object') return null;
  // `testResults` is the one field every Jest report carries and no other
  // JSON we might be handed does — use it as the shape check.
  if (!Array.isArray(parsed.testResults)) return null;

  const suites = parsed.testResults as JestJsonTestResult[];
  const allFailures = suites.flatMap(collectSuiteFailures);
  const omitted = Math.max(0, allFailures.length - MAX_FAILURES);

  return {
    passed: parsed.success === true,
    numTotalTests: asNumber(parsed.numTotalTests),
    numPassedTests: asNumber(parsed.numPassedTests),
    numFailedTests: asNumber(parsed.numFailedTests),
    numFailedTestSuites: asNumber(parsed.numFailedTestSuites),
    failures: allFailures.slice(0, MAX_FAILURES),
    ...(omitted > 0 ? { omittedFailures: omitted } : {}),
  };
}
