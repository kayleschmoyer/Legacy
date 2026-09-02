import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Real stripAnsiCodes implementation (duplicated, not jest.requireActual'd):
// requireActual('../logs.js') transitively pulls in github-api.js ->
// repo-root.js, which uses import.meta.url and breaks under ts-jest's CJS
// transform for specs (LS-8322).
jest.mock('../logs.js', () => {
  const ESC = String.fromCharCode(27);
  const ANSI_ESCAPE_SEQUENCE = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g');
  return {
    fetchRunLogsRing: jest.fn(),
    stripAnsiCodes: (text: string) => text.replace(ANSI_ESCAPE_SEQUENCE, ''),
  };
});

import {
  getLogs,
  isEslintFailureLine,
  isGithubErrorAnnotationLine,
  isJestFailureLine,
  isPlaywrightFailureLine,
  isPriorityFailureLine,
  isTestFailureLine,
} from './get-logs.js';
import * as logs from '../logs.js';

const mockFetch = logs.fetchRunLogsRing as jest.MockedFunction<
  typeof logs.fetchRunLogsRing
>;

/** Singular-path response: minified-JSON header line + blank line + raw log text. */
function parseHeader(text: string): Record<string, unknown> {
  return JSON.parse(text.split('\n')[0]) as Record<string, unknown>;
}

function parseLogs(text: string): string {
  return text.slice(text.indexOf('\n\n') + 2);
}

/** Batch-path response: header line, then a `=== run <id> ===` section per run. */
function parseBatchHeader(text: string): {
  runIds: number[];
  missing: Array<{ runId: number; reason: string }>;
} {
  return JSON.parse(text.split('\n\n')[0]) as {
    runIds: number[];
    missing: Array<{ runId: number; reason: string }>;
  };
}

function parseBatchRun(
  text: string,
  runId: number,
): { meta: Record<string, unknown>; logs: string } {
  const marker = `=== run ${runId} ===\n`;
  const start = text.indexOf(marker) + marker.length;
  const rest = text.slice(start);
  const nextMarkerIdx = rest.indexOf('\n\n=== run ');
  const section = nextMarkerIdx === -1 ? rest : rest.slice(0, nextMarkerIdx);
  const sepIdx = section.indexOf('\n\n');
  return {
    meta: JSON.parse(section.slice(0, sepIdx)) as Record<string, unknown>,
    logs: section.slice(sepIdx + 2),
  };
}

describe('getLogs', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('singular runId', () => {
    it('returns a metadata header + raw log text (back-compat fields, LS-8504 format)', async () => {
      mockFetch.mockResolvedValue({
        lines: ['line a', 'line b'],
        totalLines: 2,
      });

      const result = await getLogs({ runId: 123 });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      const header = parseHeader(text);
      expect(header.runId).toBe(123);
      expect(header.totalLines).toBe(2);
      // Singular path is not wrapped in { logs: { [runId]: ... } }.
      expect(header).not.toHaveProperty('missing');
      expect(parseLogs(text)).toBe('line a\nline b');
    });

    it('keeps real newlines in the log text instead of JSON-escaping them (LS-8504)', async () => {
      const manyLines = Array.from({ length: 50 }, (_, i) => `log line ${i}`);
      mockFetch.mockResolvedValue({ lines: manyLines, totalLines: 50 });

      const result = await getLogs({ runId: 1 });
      const text = result.content[0].text;

      // The log content must never appear as a literal backslash-n escape —
      // that escaping is exactly what breaks grep/chunked Read once this
      // response is large enough to be persisted to a tool-results file.
      const logsText = parseLogs(text);
      expect(logsText).not.toContain('\\n');
      const physicalLines = logsText.split('\n');
      expect(physicalLines).toHaveLength(50);
      expect(physicalLines[0]).toBe('log line 0');
      expect(physicalLines[49]).toBe('log line 49');
    });

    it('errors when neither runId, runIds, nor jobId is provided', async () => {
      const result = await getLogs({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/required/i);
    });

    it('surfaces the underlying error in singular mode', async () => {
      mockFetch.mockRejectedValue(new Error('boom'));
      const result = await getLogs({ runId: 7 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('boom');
    });
  });

  describe('offset (LS-9291)', () => {
    it('skips the requested number of lines from the start of the fetched window', async () => {
      const manyLines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
      mockFetch.mockResolvedValue({ lines: manyLines, totalLines: 10 });

      const result = await getLogs({ runId: 1, offset: 5 });

      const text = result.content[0].text;
      const header = parseHeader(text);
      expect(header.offset).toBe(5);
      expect(header.linesInWindow).toBe(10);
      expect(parseLogs(text)).toBe('line 5\nline 6\nline 7\nline 8\nline 9');
    });

    it('defaults offset to 0 when omitted', async () => {
      mockFetch.mockResolvedValue({ lines: ['a', 'b'], totalLines: 2 });
      const result = await getLogs({ runId: 1 });
      const header = parseHeader(result.content[0].text);
      expect(header.offset).toBe(0);
    });

    it('reports linesRemainingInWindow and a paging hint when maxChars still truncates after offset', async () => {
      // Each line is long enough that only a couple fit under a small
      // maxChars budget, while staying well clear of the header itself
      // (a minified-JSON meta line, ~250-350 chars) so applyHardCharCap
      // doesn't also cut into the header.
      const manyLines = Array.from(
        { length: 20 },
        (_, i) => `line ${i} ${'x'.repeat(50)}`,
      );
      mockFetch.mockResolvedValue({ lines: manyLines, totalLines: 20 });

      const result = await getLogs({ runId: 1, offset: 2, maxChars: 500 });

      const header = parseHeader(result.content[0].text);
      expect(header.linesRemainingInWindow).toBeGreaterThan(0);
      expect(header.hint).toMatch(/offset: \d+/);
    });

    it('returns an empty log when offset is past the end of the fetched window', async () => {
      mockFetch.mockResolvedValue({ lines: ['a', 'b'], totalLines: 2 });
      const result = await getLogs({ runId: 1, offset: 10 });
      const text = result.content[0].text;
      expect(parseLogs(text)).toBe('');
      expect(parseHeader(text).returnedLines).toBe(0);
    });

    it('also applies to errorSummary mode', async () => {
      mockFetch.mockResolvedValue({
        lines: [],
        totalLines: 0,
        priorityLines: ['err 1', 'err 2', 'err 3'],
      });

      const result = await getLogs({ runId: 1, errorSummary: true, offset: 1 });
      const text = result.content[0].text;
      const header = parseHeader(text);
      expect(header.offset).toBe(1);
      expect(parseLogs(text)).toBe('err 2\nerr 3');
    });
  });

  describe('batch runIds', () => {
    it('returns per-run sections keyed by runId', async () => {
      mockFetch.mockImplementation((params) =>
        Promise.resolve({
          lines: [`log-for-${params.runId}`],
          totalLines: 1,
        }),
      );

      const result = await getLogs({ runIds: [10, 20, 30] });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      const header = parseBatchHeader(text);
      expect(header.runIds.slice().sort((a, b) => a - b)).toEqual([10, 20, 30]);
      expect(header.missing).toEqual([]);
      expect(parseBatchRun(text, 10).logs).toBe('log-for-10');
      expect(parseBatchRun(text, 20).logs).toBe('log-for-20');
      expect(parseBatchRun(text, 30).logs).toBe('log-for-30');
    });

    it('isolates a BlobNotFound 404 to missing[] without failing the others', async () => {
      mockFetch.mockImplementation((params) => {
        if (params.runId === 999) {
          throw new Error(
            'GitHub API 404: <Error><Code>BlobNotFound</Code></Error>',
          );
        }
        return Promise.resolve({
          lines: [`log-for-${params.runId}`],
          totalLines: 1,
        });
      });

      const result = await getLogs({ runIds: [1, 999, 2] });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      const header = parseBatchHeader(text);
      expect(header.runIds.slice().sort((a, b) => a - b)).toEqual([1, 2]);
      expect(header.missing).toHaveLength(1);
      expect(header.missing[0].runId).toBe(999);
      expect(header.missing[0].reason).toContain('BlobNotFound');
      expect(parseBatchRun(text, 1).logs).toBe('log-for-1');
      expect(parseBatchRun(text, 2).logs).toBe('log-for-2');
    });

    it('caps the batch at 10 runs', async () => {
      const result = await getLogs({
        runIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/at most 10/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects combining runIds with jobId', async () => {
      const result = await getLogs({ runIds: [1, 2], jobId: 5 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/cannot be combined with jobId/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('caps concurrent fetches at 3', async () => {
      let inFlight = 0;
      let peak = 0;
      mockFetch.mockImplementation(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return { lines: ['x'], totalLines: 1 };
      });

      await getLogs({ runIds: [1, 2, 3, 4, 5, 6, 7, 8] });

      expect(peak).toBeLessThanOrEqual(3);
      expect(mockFetch).toHaveBeenCalledTimes(8);
    });

    it('returns an empty missing[] and a run section when all runs succeed', async () => {
      mockFetch.mockResolvedValue({ lines: ['ok'], totalLines: 1 });
      const result = await getLogs({ runIds: [42] });
      const text = result.content[0].text;
      const header = parseBatchHeader(text);
      expect(header.runIds).toEqual([42]);
      expect(header.missing).toEqual([]);
      expect(parseBatchRun(text, 42).logs).toBe('ok');
    });
  });

  describe('isJestFailureLine (LS-8391)', () => {
    it('matches a plain jest FAIL suite header', () => {
      expect(isJestFailureLine('FAIL src/foo.spec.ts')).toBe(true);
    });

    it('matches an ANSI-colored FAIL suite header', () => {
      expect(
        isJestFailureLine(
          '\x1b[41m\x1b[30m FAIL \x1b[39m\x1b[49m src/foo.spec.ts',
        ),
      ).toBe(true);
    });

    it('matches "Tests: N failed" and "Test Suites: N failed" summary lines', () => {
      expect(isJestFailureLine('Tests:       1 failed, 5 total')).toBe(true);
      expect(isJestFailureLine('Test Suites: 1 failed, 3 total')).toBe(true);
    });

    it('matches an individual failing test marker (✕)', () => {
      expect(isJestFailureLine('  ✕ renders the button (12 ms)')).toBe(true);
    });

    it('does not match console.error noise or unrelated "FAILED" text', () => {
      expect(
        isJestFailureLine(
          'console.error: Warning: React does not recognize prop X',
        ),
      ).toBe(false);
      expect(isJestFailureLine('Failed to propose trade')).toBe(false);
      expect(isJestFailureLine('BUILD FAILED')).toBe(false);
    });
  });

  describe('isPlaywrightFailureLine (LS-8405)', () => {
    it('matches the list-reporter failing test marker (✘)', () => {
      expect(
        isPlaywrightFailureLine(
          '  1) [chromium] › login.spec.ts:12:5 › logs in ✘ (2.1s)',
        ),
      ).toBe(true);
    });

    it('matches TimeoutError, Error: expect(, and Error Context: lines', () => {
      expect(
        isPlaywrightFailureLine(
          'TimeoutError: locator.click: Timeout 30000ms exceeded.',
        ),
      ).toBe(true);
      expect(
        isPlaywrightFailureLine('Error: expect(locator).toBeVisible() failed'),
      ).toBe(true);
      expect(
        isPlaywrightFailureLine(
          'Error Context: apps/web-e2e/test-results/login-spec-ts/error-context.md',
        ),
      ).toBe(true);
    });

    it('matches the end-of-run "N failed" summary line', () => {
      expect(isPlaywrightFailureLine('  1 failed')).toBe(true);
      expect(isPlaywrightFailureLine('2 failed, 18 passed (45s)')).toBe(true);
    });

    it('does not match composite-action wrapper status lines', () => {
      expect(isPlaywrightFailureLine('❌ Critical E2E tests failed')).toBe(
        false,
      );
      expect(
        isPlaywrightFailureLine(
          '⚠️ Playwright browser installation failed — attempting fallback without --with-deps',
        ),
      ).toBe(false);
      expect(
        isPlaywrightFailureLine(
          '💥 E2E tests failed - critical user paths may be broken',
        ),
      ).toBe(false);
      expect(isPlaywrightFailureLine('::error::E2E tests failed (3/10).')).toBe(
        false,
      );
    });
  });

  describe('isTestFailureLine (LS-8405)', () => {
    it('matches either a jest or a playwright failure marker', () => {
      expect(isTestFailureLine('FAIL src/foo.spec.ts')).toBe(true);
      expect(isTestFailureLine('TimeoutError: boom')).toBe(true);
      expect(isTestFailureLine('console.log("hello")')).toBe(false);
    });
  });

  describe('isGithubErrorAnnotationLine (LS-8772)', () => {
    it('matches a raw ##[error] annotation', () => {
      expect(
        isGithubErrorAnnotationLine(
          '##[error]Process completed with exit code 1.',
        ),
      ).toBe(true);
    });

    it('matches an ANSI-colored ##[error] annotation', () => {
      expect(
        isGithubErrorAnnotationLine(
          '\x1b[31;1m##[error]Theme compliance check failed\x1b[0m',
        ),
      ).toBe(true);
    });

    it('does not match unrelated lines', () => {
      expect(isGithubErrorAnnotationLine('##[group]Run pnpm test')).toBe(false);
      expect(isGithubErrorAnnotationLine('some error occurred')).toBe(false);
    });
  });

  describe('isPriorityFailureLine (LS-8772)', () => {
    it('matches test-failure markers and GitHub error annotations', () => {
      expect(isPriorityFailureLine('FAIL src/foo.spec.ts')).toBe(true);
      expect(isPriorityFailureLine('TimeoutError: boom')).toBe(true);
      expect(
        isPriorityFailureLine('##[error]Process completed with exit code 1.'),
      ).toBe(true);
      expect(isPriorityFailureLine('console.log("hello")')).toBe(false);
    });
  });

  describe('errorSummary excludes script-source and git noise (LS-8772)', () => {
    it('excludes echoed shell source inside a ##[group]Run block even when it contains error-like text', async () => {
      const lines = [
        '##[group]Run pnpm run check-lockfile',
        'if [ ! -f pnpm-lock.yaml ]; then',
        '  echo "❌ pnpm-lock.yaml not found"',
        '  exit 1',
        'fi',
        'shell: /usr/bin/bash -e {0}',
        '##[endgroup]',
        '##[error]Process completed with exit code 1.',
      ];
      mockFetch.mockResolvedValue({
        lines,
        totalLines: lines.length,
        priorityLines: ['##[error]Process completed with exit code 1.'],
      });

      const result = await getLogs({ runId: 1, errorSummary: true });
      const logsText = parseLogs(result.content[0].text);

      expect(logsText).not.toContain('pnpm-lock.yaml not found');
      expect(logsText).toContain(
        '##[error]Process completed with exit code 1.',
      );
    });

    it('excludes git fetch branch-listing noise even when the branch name contains "error" or "failed"', async () => {
      const lines = [
        '* [new branch]      LS-1001-fix-join-league-error-logging -> origin/LS-1001-fix-join-league-error-logging',
        '* [new branch]      LS-2002-failed-payment-retry -> origin/LS-2002-failed-payment-retry',
        '##[error]Theme compliance check failed',
      ];
      mockFetch.mockResolvedValue({
        lines,
        totalLines: lines.length,
        priorityLines: ['##[error]Theme compliance check failed'],
      });

      const result = await getLogs({ runId: 1, errorSummary: true });
      const logsText = parseLogs(result.content[0].text);

      expect(logsText).not.toContain('new branch');
      expect(logsText).toContain('##[error]Theme compliance check failed');
    });

    it('prioritizes ##[error] annotations over generic-pattern noise when the 200-line cap would otherwise drop them', async () => {
      const noise = Array.from(
        { length: 250 },
        (_, i) => `console.error: React does not recognize prop X (${i})`,
      );
      mockFetch.mockResolvedValue({
        lines: noise,
        totalLines: noise.length,
        priorityLines: ['##[error]Theme compliance ratchet: 3 new violations'],
      });

      const result = await getLogs({ runId: 1, errorSummary: true });
      const logsText = parseLogs(result.content[0].text);

      expect(logsText).toContain('Theme compliance ratchet: 3 new violations');
      expect(logsText.indexOf('##[error]')).toBeLessThan(
        logsText.indexOf('console.error'),
      );
    });
  });

  describe('errorSummary playwright-marker priority (LS-8405)', () => {
    it('prioritizes Playwright failure markers over composite-action wrapper noise when the 200-line cap would otherwise drop them', async () => {
      // Composite-action wrapper noise (LS-8405): status/echo lines that match
      // the generic ERROR_PATTERNS scan but carry no test-failure detail.
      const noise = Array.from(
        { length: 250 },
        (_, i) =>
          `::error::E2E tests failed (${i}/10). Critical user functionality may be broken.`,
      );
      mockFetch.mockResolvedValue({
        lines: noise,
        totalLines: noise.length,
        priorityLines: [
          '  1) [chromium] › login.spec.ts:12:5 › logs in ✘ (2.1s)',
          'TimeoutError: locator.click: Timeout 30000ms exceeded.',
          '  1 failed',
        ],
      });

      const result = await getLogs({ runId: 1, errorSummary: true });

      expect(result.isError).toBeUndefined();
      const logsText = parseLogs(result.content[0].text);
      expect(logsText).toContain('TimeoutError:');
      expect(logsText).toContain('1 failed');
      // Playwright markers appear before the generic wrapper noise in the merged summary.
      expect(logsText.indexOf('TimeoutError:')).toBeLessThan(
        logsText.indexOf('::error::'),
      );
    });
  });

  describe('errorSummary jest-marker priority (LS-8391)', () => {
    it('prioritizes jest failure markers over console.error noise when the 200-line cap would otherwise drop them', async () => {
      // 250 console.error lines (generic ERROR_PATTERNS noise) plus a single
      // jest failure summary buried past the cap.
      const noise = Array.from(
        { length: 250 },
        (_, i) => `console.error: React does not recognize prop X (${i})`,
      );
      mockFetch.mockResolvedValue({
        lines: noise,
        totalLines: noise.length,
        priorityLines: [
          'FAIL src/foo.spec.ts',
          'Tests:       1 failed, 5 total',
        ],
      });

      const result = await getLogs({ runId: 1, errorSummary: true });

      expect(result.isError).toBeUndefined();
      const logsText = parseLogs(result.content[0].text);
      expect(logsText).toContain('FAIL src/foo.spec.ts');
      expect(logsText).toContain('Tests:       1 failed, 5 total');
      // Jest markers appear before the generic noise in the merged summary.
      expect(logsText.indexOf('FAIL src/foo.spec.ts')).toBeLessThan(
        logsText.indexOf('console.error'),
      );
    });

    it('passes a priority matcher to fetchRunLogsRing only when errorSummary is set', async () => {
      mockFetch.mockResolvedValue({ lines: ['x'], totalLines: 1 });

      await getLogs({ runId: 1 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 1 }),
        expect.any(Number),
        undefined,
      );

      mockFetch.mockClear();
      await getLogs({ runId: 1, errorSummary: true });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 1 }),
        expect.any(Number),
        expect.any(Function),
      );
    });
  });

  describe('isEslintFailureLine (LS-9556)', () => {
    it('matches a stylish-formatter violation row', () => {
      expect(
        isEslintFailureLine(
          "  12:5  error  'foo' is defined but never used  no-unused-vars",
        ),
      ).toBe(true);
    });

    it('matches the "N problems" summary line', () => {
      expect(isEslintFailureLine('✖ 6 problems (6 errors, 0 warnings)')).toBe(
        true,
      );
    });

    it('does not match a bare file path or unrelated text', () => {
      expect(isEslintFailureLine('src/app/foo.ts')).toBe(false);
      expect(
        isEslintFailureLine('All matched files use Prettier code style!'),
      ).toBe(false);
    });
  });

  describe('isPriorityFailureLine includes ESLint (LS-9556)', () => {
    it('matches an ESLint violation row and summary', () => {
      expect(
        isPriorityFailureLine(
          "  12:5  error  'foo' is defined  no-unused-vars",
        ),
      ).toBe(true);
      expect(isPriorityFailureLine('✖ 6 problems (6 errors, 0 warnings)')).toBe(
        true,
      );
    });
  });

  describe('isJestFailureLine matches the ● per-test failure header (LS-9556)', () => {
    it('matches a "●" failing-test detail line', () => {
      expect(
        isJestFailureLine(
          '● FootballLeagueId › matchups tab › playoff bracket toggle (FLD-017) › renders',
        ),
      ).toBe(true);
    });

    it('does not match a line with no leading "●" marker', () => {
      expect(isJestFailureLine('console.log("hello")')).toBe(false);
    });
  });

  describe('errorSummary regression fixtures (LS-9556, LS-8391/LS-8405/LS-8772 recurrence)', () => {
    it('AC1: returns real ESLint diagnostics, not runner-bootstrap noise, for the lint job (job 97065111193)', async () => {
      // Mirrors the actual regression from run 32586634982 / job 97065111193:
      // once logs.ts scopes to the failing "Lint" step, fetchRunLogsRing's
      // `lines` no longer contain runner-bootstrap/fetch noise at all — this
      // test locks in that extractErrorSummary correctly surfaces the real
      // diagnostics and never re-admits the Prettier success line as context.
      const lines = [
        'src/app/foo.ts',
        "  12:5  error  'foo' is defined but never used  no-unused-vars",
        '  20:1  error  Missing return type on function  @typescript-eslint/explicit-function-return-type',
        'src/app/bar.ts',
        "  5:10  error  'bar' is never reassigned. Use 'const' instead  prefer-const",
        '  8:3   error  Unexpected console statement  no-console',
        "  9:1   error  'baz' is defined but never used  no-unused-vars",
        '  15:2  error  Missing semicolon  semi',
        '',
        '✖ 6 problems (6 errors, 0 warnings)',
        'All matched files use Prettier code style!',
      ];
      mockFetch.mockResolvedValue({
        lines,
        totalLines: lines.length,
        priorityLines: [
          "  12:5  error  'foo' is defined but never used  no-unused-vars",
          '✖ 6 problems (6 errors, 0 warnings)',
        ],
      });

      const result = await getLogs({
        runId: 32586634982,
        jobId: 97065111193,
        errorSummary: true,
      });

      const logsText = parseLogs(result.content[0].text);
      expect(logsText).toContain('no-unused-vars');
      expect(logsText).toContain('✖ 6 problems (6 errors, 0 warnings)');
      // AC4: the Prettier success line must never be selected as an error line.
      expect(logsText).not.toContain(
        'All matched files use Prettier code style!',
      );
    });

    it('AC2: returns the ● failing test names and the Tests: summary, not jsdom console.error noise (job 97065111167)', async () => {
      const jsdomNoise = Array.from(
        { length: 50 },
        (_, i) => `console.error: Not implemented: window.scrollTo (${i})`,
      );
      const lines = [
        ...jsdomNoise,
        'FAIL app src/app/(app)/football/league/[leagueId].spec.tsx',
        '● FootballLeagueId › matchups tab › playoff bracket toggle (FLD-017) › renders the bracket',
        '● FootballLeagueId › matchups tab › playoff bracket toggle (FLD-017) › toggles open',
        '● FootballLeagueId › matchups tab › playoff bracket toggle (FLD-017) › persists state',
        'Tests:       3 failed, 1428 passed, 1431 total',
      ];
      mockFetch.mockResolvedValue({
        lines,
        totalLines: lines.length,
        priorityLines: [
          'FAIL app src/app/(app)/football/league/[leagueId].spec.tsx',
          '● FootballLeagueId › matchups tab › playoff bracket toggle (FLD-017) › renders the bracket',
          '● FootballLeagueId › matchups tab › playoff bracket toggle (FLD-017) › toggles open',
          '● FootballLeagueId › matchups tab › playoff bracket toggle (FLD-017) › persists state',
          'Tests:       3 failed, 1428 passed, 1431 total',
        ],
      });

      const result = await getLogs({
        runId: 32586634982,
        jobId: 97065111167,
        errorSummary: true,
      });

      const logsText = parseLogs(result.content[0].text);
      expect(logsText).toContain(
        '● FootballLeagueId › matchups tab › playoff bracket toggle (FLD-017) › renders the bracket',
      );
      expect(logsText).toContain(
        '● FootballLeagueId › matchups tab › playoff bracket toggle (FLD-017) › toggles open',
      );
      expect(logsText).toContain(
        '● FootballLeagueId › matchups tab › playoff bracket toggle (FLD-017) › persists state',
      );
      expect(logsText).toContain(
        'Tests:       3 failed, 1428 passed, 1431 total',
      );
      // The three ● lines must appear before the jsdom noise in the summary.
      expect(logsText.indexOf('●')).toBeLessThan(
        logsText.indexOf('console.error'),
      );
    });

    it('AC4: never selects a success-marker line even when it survives as generic-scan context', async () => {
      const lines = [
        "  12:5  error  'foo' is defined but never used  no-unused-vars",
        'All matched files use Prettier code style!',
      ];
      mockFetch.mockResolvedValue({
        lines,
        totalLines: lines.length,
        priorityLines: [],
      });

      const result = await getLogs({ runId: 1, errorSummary: true });
      const logsText = parseLogs(result.content[0].text);

      expect(logsText).toContain('no-unused-vars');
      expect(logsText).not.toContain(
        'All matched files use Prettier code style!',
      );
    });

    it('AC4: never selects a success-marker line even if it is (incorrectly) passed as a priority line', async () => {
      mockFetch.mockResolvedValue({
        lines: ['some other line'],
        totalLines: 1,
        priorityLines: ['All matched files use Prettier code style!'],
      });

      const result = await getLogs({ runId: 1, errorSummary: true });
      const logsText = parseLogs(result.content[0].text);

      expect(logsText).not.toContain(
        'All matched files use Prettier code style!',
      );
    });
  });

  describe('char limits (maxChars / truncateLineLength)', () => {
    it('truncates per-line when truncateLineLength is set', async () => {
      const longLine = 'x'.repeat(1000);
      mockFetch.mockResolvedValue({
        lines: [longLine, longLine],
        totalLines: 2,
      });

      const result = await getLogs({ runId: 1, truncateLineLength: 50 });
      expect(result.isError).toBeUndefined();
      const logsText = parseLogs(result.content[0].text);
      for (const line of logsText.split('\n')) {
        expect(line.length).toBeLessThanOrEqual(
          50 + '...[line truncated]'.length,
        );
      }
    });

    it('caps total response text at maxChars for singular path', async () => {
      // 12 lines of 10KB each — 120KB total, well over maxChars=80000
      const bigLine = 'a'.repeat(10_000);
      mockFetch.mockResolvedValue({
        lines: Array.from({ length: 12 }, () => bigLine),
        totalLines: 12,
      });

      const maxChars = 80_000;
      const result = await getLogs({ runId: 1, maxChars });
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text.length).toBeLessThanOrEqual(
        maxChars + '... [truncated at 80000 chars]'.length + 1,
      );
      expect(text).toContain('... [truncated at 80000 chars]');
    });

    it('caps total response text at maxChars for batch path', async () => {
      const bigLine = 'a'.repeat(10_000);
      mockFetch.mockResolvedValue({
        lines: Array.from({ length: 12 }, () => bigLine),
        totalLines: 12,
      });

      const maxChars = 80_000;
      const result = await getLogs({ runIds: [1, 2], maxChars });
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text.length).toBeLessThanOrEqual(
        maxChars + '... [truncated at 80000 chars]'.length + 1,
      );
      expect(text).toContain('... [truncated at 80000 chars]');
    });

    it('does not truncate when response fits within maxChars', async () => {
      mockFetch.mockResolvedValue({ lines: ['short line'], totalLines: 1 });

      const result = await getLogs({ runId: 1, maxChars: 10_000 });
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).not.toContain('[truncated at');
      // The header line is still valid JSON.
      expect(() => parseHeader(text)).not.toThrow();
      expect(parseLogs(text)).toBe('short line');
    });
  });

  describe('ANSI stripping (LS-9557)', () => {
    // Built from String.fromCharCode rather than a \x1b literal — same
    // no-control-regex rationale as get-logs.ts.
    const ESC = String.fromCharCode(27);

    it('returns log text with no ANSI escape sequences (AC1)', async () => {
      const coloredLine = `${ESC}[1m${ESC}[31mFAIL${ESC}[39m${ESC}[22m src/foo.spec.ts`;
      mockFetch.mockResolvedValue({
        lines: [coloredLine],
        totalLines: 1,
      });

      const result = await getLogs({ runId: 1 });
      const logsText = parseLogs(result.content[0].text);

      expect(logsText.includes(ESC)).toBe(false);
      expect(logsText).toBe('FAIL src/foo.spec.ts');
    });

    it('strips ANSI codes from the errorSummary path too', async () => {
      const coloredLine = `${ESC}[1m##[error]${ESC}[22m Process completed with exit code 1.`;
      mockFetch.mockResolvedValue({
        lines: [coloredLine],
        totalLines: 1,
        priorityLines: [coloredLine],
      });

      const result = await getLogs({ runId: 1, errorSummary: true });
      const logsText = parseLogs(result.content[0].text);

      expect(logsText.includes(ESC)).toBe(false);
      expect(logsText).toContain(
        '##[error] Process completed with exit code 1.',
      );
    });

    it('strips before truncateLineLength so a truncated line is not mostly escape codes (AC3/AC5)', async () => {
      // Visible content is short, but wrapping ANSI codes push the raw length
      // well past a 20-char truncateLineLength — truncation must be judged on
      // the stripped (visible) length, not the raw one.
      const line = `${ESC}[1m${ESC}[31m${ESC}[4mshort${ESC}[24m${ESC}[39m${ESC}[22m visible text`;
      expect(line.length).toBeGreaterThan(20);

      mockFetch.mockResolvedValue({ lines: [line], totalLines: 1 });

      const result = await getLogs({ runId: 1, truncateLineLength: 40 });
      const logsText = parseLogs(result.content[0].text);

      expect(logsText.includes(ESC)).toBe(false);
      expect(logsText).not.toContain('[line truncated]');
      expect(logsText).toBe('short visible text');
    });
  });
});
