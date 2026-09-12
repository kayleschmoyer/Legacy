import { describe, expect, it } from '@jest/globals';

import { stripAnsiCodes } from './ansi.js';
import {
  clipFailureMessage,
  MAX_FAILURE_MESSAGE_LINES,
  MAX_FAILURES,
  parseJestJsonReport,
} from './jest-report.js';

const ESC = String.fromCharCode(27);

function report(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    success: false,
    numTotalTests: 20,
    numPassedTests: 4,
    numFailedTests: 16,
    numFailedTestSuites: 4,
    testResults: [],
    ...overrides,
  });
}

function suite(name: string, assertions: unknown[], extra = {}) {
  return { name, status: 'failed', assertionResults: assertions, ...extra };
}

function failedAssertion(fullName: string, message = 'boom') {
  return { status: 'failed', fullName, failureMessages: [message] };
}

describe('stripAnsiCodes', () => {
  it('removes colour codes and cursor-movement sequences', () => {
    const coloured = `${ESC}[31m● FootballLeagueId${ESC}[0m${ESC}[2K done`;
    expect(stripAnsiCodes(coloured)).toBe('● FootballLeagueId done');
  });

  it('leaves plain text untouched', () => {
    expect(stripAnsiCodes('no escapes here')).toBe('no escapes here');
  });
});

describe('clipFailureMessage', () => {
  it('keeps short messages verbatim', () => {
    expect(clipFailureMessage('line1\nline2')).toBe('line1\nline2');
  });

  it('clips to the line cap and reports how many lines were dropped', () => {
    const message = Array.from({ length: 25 }, (_, i) => `line${i}`).join('\n');
    const clipped = clipFailureMessage(message);
    expect(clipped.split('\n')).toHaveLength(MAX_FAILURE_MESSAGE_LINES + 1);
    expect(clipped).toContain(
      `[${25 - MAX_FAILURE_MESSAGE_LINES} more lines clipped]`,
    );
    expect(clipped.startsWith('line0\nline1')).toBe(true);
  });

  it('strips ANSI from the clipped message', () => {
    expect(clipFailureMessage(`${ESC}[31mexpected${ESC}[0m 1`)).toBe(
      'expected 1',
    );
  });

  it('ignores trailing blank lines when deciding to clip', () => {
    const message = `only line${'\n'.repeat(30)}`;
    expect(clipFailureMessage(message)).toBe('only line');
  });

  it('uses the singular form for a single clipped line', () => {
    const message = Array.from(
      { length: MAX_FAILURE_MESSAGE_LINES + 1 },
      (_, i) => `line${i}`,
    ).join('\n');
    expect(clipFailureMessage(message)).toContain('[1 more line clipped]');
  });
});

describe('parseJestJsonReport', () => {
  it('returns null for non-JSON input', () => {
    expect(parseJestJsonReport('not json at all')).toBeNull();
  });

  it('returns null for JSON that is not a jest report', () => {
    expect(parseJestJsonReport('{"ok":true}')).toBeNull();
  });

  it('returns null for an empty file', () => {
    expect(parseJestJsonReport('')).toBeNull();
  });

  it('extracts counts and every failing test name (LS-10092)', () => {
    const assertions = Array.from({ length: 16 }, (_, i) =>
      failedAssertion(`Suite > test ${i}`),
    );
    const parsed = parseJestJsonReport(
      report({ testResults: [suite('/repo/lib/a.spec.ts', assertions)] }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.passed).toBe(false);
    expect(parsed?.numFailedTests).toBe(16);
    expect(parsed?.numPassedTests).toBe(4);
    expect(parsed?.numTotalTests).toBe(20);
    expect(parsed?.numFailedTestSuites).toBe(4);
    // The reported symptom: 2 of 16 names survived the raw-log truncation.
    expect(parsed?.failures).toHaveLength(16);
    expect(parsed?.failures.map((f) => f.fullName)).toContain(
      'Suite > test 15',
    );
  });

  it('shortens absolute suite paths to their last three segments', () => {
    const parsed = parseJestJsonReport(
      report({
        testResults: [
          suite('/home/user/legacy-sports/tools/mcp/jira-server/x.spec.ts', [
            failedAssertion('a'),
          ]),
        ],
      }),
    );
    expect(parsed?.failures[0].suite).toBe('mcp/jira-server/x.spec.ts');
  });

  it('normalises Windows separators in suite paths', () => {
    const parsed = parseJestJsonReport(
      report({
        testResults: [
          suite('C:\\repo\\lib\\db\\x.spec.ts', [failedAssertion('a')]),
        ],
      }),
    );
    expect(parsed?.failures[0].suite).toBe('lib/db/x.spec.ts');
  });

  it('skips passing assertions', () => {
    const parsed = parseJestJsonReport(
      report({
        testResults: [
          suite('/repo/a.spec.ts', [
            { status: 'passed', fullName: 'fine' },
            failedAssertion('broken'),
          ]),
        ],
      }),
    );
    expect(parsed?.failures).toEqual([
      { suite: 'repo/a.spec.ts', fullName: 'broken', message: 'boom' },
    ]);
  });

  it('reports a suite-level failure that ran no tests', () => {
    const parsed = parseJestJsonReport(
      report({
        testResults: [
          suite('/repo/a.spec.ts', [], {
            message: 'Cannot find module "./missing"',
          }),
        ],
      }),
    );
    expect(parsed?.failures).toEqual([
      {
        suite: 'repo/a.spec.ts',
        fullName: '(suite-level failure — no test ran)',
        message: 'Cannot find module "./missing"',
      },
    ]);
  });

  it('does not synthesise a suite-level failure for a passing suite', () => {
    const parsed = parseJestJsonReport(
      report({
        success: true,
        numFailedTests: 0,
        testResults: [
          { name: '/repo/a.spec.ts', status: 'passed', message: '' },
        ],
      }),
    );
    expect(parsed?.passed).toBe(true);
    expect(parsed?.failures).toEqual([]);
  });

  it('caps the failure list and reports the omitted count', () => {
    const assertions = Array.from({ length: MAX_FAILURES + 7 }, (_, i) =>
      failedAssertion(`t${i}`),
    );
    const parsed = parseJestJsonReport(
      report({ testResults: [suite('/repo/a.spec.ts', assertions)] }),
    );
    expect(parsed?.failures).toHaveLength(MAX_FAILURES);
    expect(parsed?.omittedFailures).toBe(7);
  });

  it('omits omittedFailures when nothing was dropped', () => {
    const parsed = parseJestJsonReport(
      report({
        testResults: [suite('/repo/a.spec.ts', [failedAssertion('a')])],
      }),
    );
    expect(parsed?.omittedFailures).toBeUndefined();
  });

  it('falls back to title when fullName is absent', () => {
    const parsed = parseJestJsonReport(
      report({
        testResults: [
          suite('/repo/a.spec.ts', [
            { status: 'failed', title: 'short name', failureMessages: ['x'] },
          ]),
        ],
      }),
    );
    expect(parsed?.failures[0].fullName).toBe('short name');
  });

  it('defaults missing counts to zero rather than NaN', () => {
    const parsed = parseJestJsonReport(
      JSON.stringify({ success: false, testResults: [] }),
    );
    expect(parsed).toEqual({
      passed: false,
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numFailedTestSuites: 0,
      failures: [],
    });
  });
});
