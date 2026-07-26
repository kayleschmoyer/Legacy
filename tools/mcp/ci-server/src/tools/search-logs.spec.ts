import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../logs.js', () => ({
  fetchRunLogs: jest.fn(),
}));

import { searchLogs } from './search-logs.js';
import { fetchRunLogs, type FetchRunLogsResult } from '../logs.js';

const mockFetchRunLogs = fetchRunLogs as jest.MockedFunction<
  typeof fetchRunLogs
>;

function textOf(result: { content: Array<{ text?: string }> }): string {
  return result.content[0]?.text ?? '';
}

/** Builds a resolved fetchRunLogs() result for a normal (non-zero-scope) fetch. */
function fetchResult(
  text: string,
  overrides: Partial<FetchRunLogsResult> = {},
): FetchRunLogsResult {
  const lineCount = text.length === 0 ? 0 : text.split(/\r?\n/).length;
  return {
    text,
    jobsSearched: lineCount > 0 ? 1 : 0,
    jobsTotal: lineCount > 0 ? 1 : 0,
    skippedByFailedOnly: false,
    ...overrides,
  };
}

describe('searchLogs ReDoS guard', () => {
  beforeEach(() => {
    mockFetchRunLogs.mockReset();
  });

  it('rejects a nested-quantifier pattern without fetching logs', async () => {
    const result = await searchLogs({
      runId: 1,
      pattern: '(a+)+',
      isRegex: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Unsafe regex pattern.*nested quantifiers/);
    expect(mockFetchRunLogs).not.toHaveBeenCalled();
  });

  it('rejects an over-long pattern without fetching logs', async () => {
    const result = await searchLogs({
      runId: 1,
      pattern: 'a'.repeat(1001),
      isRegex: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Unsafe regex pattern.*too long/);
    expect(mockFetchRunLogs).not.toHaveBeenCalled();
  });

  it('surfaces a clear error for an invalid (uncompilable) regex', async () => {
    const result = await searchLogs({
      runId: 1,
      pattern: '(unbalanced',
      isRegex: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Invalid regex pattern/);
    expect(mockFetchRunLogs).not.toHaveBeenCalled();
  });

  it('does not apply the regex guard to literal substring search', async () => {
    mockFetchRunLogs.mockResolvedValue(
      fetchResult('line one\n(a+)+ literal\nline three'),
    );
    const result = await searchLogs({
      runId: 1,
      pattern: '(a+)+', // would be rejected as a regex, but here it is literal
      isRegex: false,
    });
    expect(result.isError).toBeUndefined();
    expect(mockFetchRunLogs).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(textOf(result));
    expect(parsed.returnedMatches).toBe(1);
  });

  it('allows a safe regex and returns matches', async () => {
    mockFetchRunLogs.mockResolvedValue(
      fetchResult('INFO ok\nERROR boom\nINFO done'),
    );
    const result = await searchLogs({
      runId: 1,
      pattern: '^ERROR',
      isRegex: true,
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(textOf(result));
    expect(parsed.returnedMatches).toBe(1);
    expect(parsed.matches[0].line).toBe('ERROR boom');
  });
});

describe('searchLogs response-size bound (LS-8390)', () => {
  beforeEach(() => {
    mockFetchRunLogs.mockReset();
  });

  /**
   * Reproduces the LS-8390 repro: a job with 20+ long, verbose lines matching
   * the pattern, limitMatches: 20, contextBefore: 2, contextAfter: 15. Before
   * the fix this serialized to ~58,660 characters as a single JSON blob
   * because context lines were never truncated in aggregate.
   */
  function buildVerboseLog(): string {
    const lines: string[] = [];
    for (let i = 0; i < 40; i++) {
      // Long shell-script echo lines, as called out in the ticket.
      lines.push(`+ echo "some verbose CI step output ${'x'.repeat(300)}"`);
      if (i % 2 === 0) lines.push(`MATCH pattern here ${'y'.repeat(300)}`);
    }
    return lines.join('\n');
  }

  it('stays well under the tool-output token limit with limitMatches + generous context', async () => {
    mockFetchRunLogs.mockResolvedValue(fetchResult(buildVerboseLog()));
    const result = await searchLogs({
      jobId: 123,
      pattern: 'MATCH',
      limitMatches: 20,
      contextBefore: 2,
      contextAfter: 15,
    });
    expect(result.isError).toBeUndefined();
    const text = textOf(result);
    // The reported overflow was ~58,660 characters on a single line; the
    // response must now stay under the default 50,000-char hard cap.
    expect(text.length).toBeLessThanOrEqual(50_000);
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('threads a caller-supplied truncateLineLength through to every context line', async () => {
    mockFetchRunLogs.mockResolvedValue(fetchResult(buildVerboseLog()));
    const result = await searchLogs({
      jobId: 123,
      pattern: 'MATCH',
      limitMatches: 20,
      contextBefore: 2,
      contextAfter: 15,
      truncateLineLength: 50,
    });
    const parsed = JSON.parse(textOf(result));
    for (const match of parsed.matches) {
      expect(match.line.length).toBeLessThanOrEqual(50);
      for (const l of [...match.before, ...match.after]) {
        expect(l.length).toBeLessThanOrEqual(50);
      }
    }
  });

  it('honors a caller-supplied maxChars, dropping trailing matches to fit', async () => {
    mockFetchRunLogs.mockResolvedValue(fetchResult(buildVerboseLog()));
    const result = await searchLogs({
      jobId: 123,
      pattern: 'MATCH',
      limitMatches: 20,
      contextBefore: 2,
      contextAfter: 15,
      maxChars: 4_000,
    });
    const text = textOf(result);
    expect(text.length).toBeLessThanOrEqual(4_000);
    const parsed = JSON.parse(text);
    expect(parsed.charTruncated).toBe(true);
  });
});

describe('searchLogs zero-scope visibility (LS-8301)', () => {
  beforeEach(() => {
    mockFetchRunLogs.mockReset();
  });

  it('signals zero-scope instead of a bare totalMatches: 0 when failedOnly excludes every job', async () => {
    // failedOnly=true (default) filtered every job in the run to zero — the
    // run itself had jobs, but none matched failedOnly's non-success filter.
    mockFetchRunLogs.mockResolvedValue({
      text: 'No failed jobs found in this workflow run.',
      jobsSearched: 0,
      jobsTotal: 3,
      skippedByFailedOnly: true,
    });
    const result = await searchLogs({
      runId: 28615049081,
      pattern: 'Successfully merged',
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(textOf(result));
    expect(parsed.totalMatches).toBe(0);
    expect(parsed.jobsSearched).toBe(0);
    expect(parsed.jobsTotal).toBe(3);
    expect(parsed.scopeNote).toMatch(/0 of 3 job\(s\) were searched/);
    expect(parsed.scopeNote).toMatch(/failedOnly=false/);
  });

  it('finds matches in a successful job previously excluded by failedOnly when failedOnly=false', async () => {
    // Same run as above, but the caller retried with failedOnly=false — the
    // successful merge-queue job's logs are now in scope and searched.
    mockFetchRunLogs.mockResolvedValue(
      fetchResult('merge-queue-processor\nSuccessfully merged PR #5910', {
        jobsSearched: 3,
        jobsTotal: 3,
      }),
    );
    const result = await searchLogs({
      runId: 28615049081,
      pattern: 'Successfully merged',
      failedOnly: false,
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(textOf(result));
    expect(parsed.totalMatches).toBe(1);
    expect(parsed.jobsSearched).toBe(3);
    expect(parsed.scopeNote).toBeUndefined();
  });
});
