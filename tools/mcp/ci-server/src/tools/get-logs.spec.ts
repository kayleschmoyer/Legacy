import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../logs.js', () => ({
  fetchRunLogsRing: jest.fn(),
}));

import { getLogs, isJestFailureLine } from './get-logs.js';
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
  return JSON.parse(text.split('\n\n')[0]);
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
    meta: JSON.parse(section.slice(0, sepIdx)),
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

  describe('batch runIds', () => {
    it('returns per-run sections keyed by runId', async () => {
      mockFetch.mockImplementation(async (params) => ({
        lines: [`log-for-${params.runId}`],
        totalLines: 1,
      }));

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
      mockFetch.mockImplementation(async (params) => {
        if (params.runId === 999) {
          throw new Error(
            'GitHub API 404: <Error><Code>BlobNotFound</Code></Error>',
          );
        }
        return { lines: [`log-for-${params.runId}`], totalLines: 1 };
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
});
