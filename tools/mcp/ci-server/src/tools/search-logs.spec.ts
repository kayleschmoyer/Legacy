import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Real stripAnsiCodes implementation (duplicated, not jest.requireActual'd):
// requireActual('../logs.js') transitively pulls in github-api.js ->
// repo-root.js, which uses import.meta.url and breaks under ts-jest's CJS
// transform for specs (LS-8322).
jest.mock('../logs.js', () => {
  const ESC = String.fromCharCode(27);
  const ANSI_ESCAPE_SEQUENCE = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g');
  // Real unsafePatternReason implementation (same reason as stripAnsiCodes
  // above — requireActual transitively breaks under ts-jest's CJS transform).
  const MAX_PATTERN_LENGTH = 1000;
  function unsafePatternReason(pattern: string): string | null {
    if (pattern.length > MAX_PATTERN_LENGTH) {
      return `pattern too long (${pattern.length} > ${MAX_PATTERN_LENGTH} characters)`;
    }
    const nestedQuantifier = /\([^()]*[+*{][^()]*\)[+*{]/;
    if (nestedQuantifier.test(pattern)) {
      return 'pattern contains nested quantifiers (possible ReDoS); simplify the pattern or set isRegex=false for a literal substring search';
    }
    return null;
  }
  return {
    fetchRunLogs: jest.fn(),
    stripAnsiCodes: (text: string) => text.replace(ANSI_ESCAPE_SEQUENCE, ''),
    unsafePatternReason,
  };
});

import { searchLogs } from './search-logs.js';
import { fetchRunLogs, type FetchRunLogsResult } from '../logs.js';
import type { LogMatch, LogSearchMeta } from '../format.js';

const mockFetchRunLogs = fetchRunLogs as jest.MockedFunction<
  typeof fetchRunLogs
>;

function textOf(result: { content: Array<{ text?: string }> }): string {
  return result.content[0]?.text ?? '';
}

/** Parsed shape of a `searchLogs` JSON response, for typed assertions. */
type ParsedSearchResult = LogSearchMeta & {
  matches: LogMatch[];
  charTruncated?: boolean;
};

function parseSearchResult(text: string): ParsedSearchResult {
  return JSON.parse(text) as ParsedSearchResult;
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
    const parsed = parseSearchResult(textOf(result));
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
    const parsed = parseSearchResult(textOf(result));
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
    expect(() => {
      JSON.parse(text);
    }).not.toThrow();
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
    const parsed = parseSearchResult(textOf(result));
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
    const parsed = parseSearchResult(text);
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
    const parsed = parseSearchResult(textOf(result));
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
    const parsed = parseSearchResult(textOf(result));
    expect(parsed.totalMatches).toBe(1);
    expect(parsed.jobsSearched).toBe(3);
    expect(parsed.scopeNote).toBeUndefined();
  });
});

describe('searchLogs partial job coverage (LS-9389)', () => {
  beforeEach(() => {
    mockFetchRunLogs.mockReset();
  });

  it('flags partial coverage instead of a bare totalMatches: 0 when failedOnly excludes some (not all) jobs', async () => {
    // Reproduces the LS-9389 repro: an orchestrator run with 16 jobs, 11 of
    // them contributed by a called (workflow_call) workflow. failedOnly=true
    // (default) filters to only the 5 non-success jobs, so the pattern —
    // which lives in a *passing* job (custom-checks) — is never searched.
    mockFetchRunLogs.mockResolvedValue(
      fetchResult('some-failed-job\nunrelated output', {
        jobsSearched: 5,
        jobsTotal: 16,
        skippedByFailedOnly: false,
      }),
    );
    const result = await searchLogs({
      runId: 31648029740,
      pattern: 'reusable-workflow call site',
    });
    expect(result.isError).toBeUndefined();
    const parsed = parseSearchResult(textOf(result));
    expect(parsed.totalMatches).toBe(0);
    expect(parsed.jobsSearched).toBe(5);
    expect(parsed.jobsTotal).toBe(16);
    // The old bug: totalMatches: 0 with no truncated/scopeNote signal at all.
    expect(parsed.truncated).toBe(true);
    expect(parsed.scopeNote).toMatch(/5 of 16 job\(s\) were searched/);
    expect(parsed.scopeNote).toMatch(/11 job\(s\) were not searched/);
    expect(parsed.scopeNote).toMatch(/does NOT mean the pattern is absent/);
  });

  it('names the actual skipped jobs and reasons in the scopeNote (LS-9748)', async () => {
    mockFetchRunLogs.mockResolvedValue(
      fetchResult('some-failed-job\nunrelated output', {
        jobsSearched: 7,
        jobsTotal: 26,
        skippedByFailedOnly: false,
        skippedJobs: [
          {
            name: 'lint',
            reason: 'excluded by failedOnly=true (job conclusion: success)',
          },
          {
            name: 'e2e-shard-12',
            reason: 'excluded by the per-call job cap (MAX_LOG_JOBS=10)',
          },
        ],
      }),
    );
    const result = await searchLogs({
      runId: 32696766559,
      pattern: 'FootballLeagueId',
    });
    expect(result.isError).toBeUndefined();
    const parsed = parseSearchResult(textOf(result));
    expect(parsed.truncated).toBe(true);
    expect(parsed.scopeNote).toContain('"lint"');
    expect(parsed.scopeNote).toContain('excluded by failedOnly=true');
    expect(parsed.scopeNote).toContain('"e2e-shard-12"');
    expect(parsed.scopeNote).toContain('per-call job cap');
  });

  it('does not flag partial coverage when every job in scope was searched', async () => {
    mockFetchRunLogs.mockResolvedValue(
      fetchResult('job-a\nMATCH here', {
        jobsSearched: 3,
        jobsTotal: 3,
      }),
    );
    const result = await searchLogs({ runId: 1, pattern: 'MATCH' });
    expect(result.isError).toBeUndefined();
    const parsed = parseSearchResult(textOf(result));
    expect(parsed.truncated).toBe(false);
    expect(parsed.scopeNote).toBeUndefined();
  });
});

describe('searchLogs log-download failures (LS-10250)', () => {
  beforeEach(() => {
    mockFetchRunLogs.mockReset();
  });

  it('returns an error, not totalMatches: 0, when every searched job failed to download', async () => {
    mockFetchRunLogs.mockResolvedValue(
      fetchResult('job-a\n(Log fetch failed for this job: boom)', {
        jobsSearched: 1,
        jobsTotal: 1,
        fetchFailedJobs: ['job-a'],
      }),
    );
    const result = await searchLogs({ runId: 1, pattern: 'ReferenceError' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/could not download logs for 1 job/);
    expect(textOf(result)).toMatch(/NOT evidence the pattern is absent/);
  });

  it('flags failed-download jobs in scopeNote when other jobs were searched', async () => {
    mockFetchRunLogs.mockResolvedValue(
      fetchResult('job-a\n(Log fetch failed for this job: boom)\njob-b\nok', {
        jobsSearched: 2,
        jobsTotal: 2,
        fetchFailedJobs: ['job-a'],
      }),
    );
    const result = await searchLogs({ runId: 1, pattern: 'ReferenceError' });
    expect(result.isError).toBeUndefined();
    const parsed = parseSearchResult(textOf(result));
    expect(parsed.truncated).toBe(true);
    expect(parsed.scopeNote).toMatch(/Log download failed for 1 searched job/);
    expect(parsed.scopeNote).toContain('"job-a"');
  });
});

describe('searchLogs ANSI stripping (LS-9557)', () => {
  // Built from String.fromCharCode rather than a \x1b literal — same
  // no-control-regex rationale as get-logs.ts.
  const ESC = String.fromCharCode(27);

  beforeEach(() => {
    mockFetchRunLogs.mockReset();
  });

  it('matches a literal pattern that previously required a wildcard around the ANSI codes (AC4)', async () => {
    // Reproduces the sample from LS-9557's description (run 32586634982,
    // job 97065111167): raw text splits "●" from "FootballLeagueId" with
    // escape codes, so the natural literal pattern used to 0-match.
    const rawLine =
      `2026-08-22T17:38:02.9319059Z ${ESC}[1m${ESC}[31m  ${ESC}[1m● ${ESC}[22m${ESC}[1m` +
      'FootballLeagueId › matchups tab playoff bracket toggle (FLD-017)';
    mockFetchRunLogs.mockResolvedValue(fetchResult(rawLine));

    const result = await searchLogs({
      runId: 1,
      pattern: '● FootballLeagueId',
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseSearchResult(textOf(result));
    expect(parsed.totalMatches).toBe(1);
    expect(parsed.matches[0].line).toContain('● FootballLeagueId');
  });

  it('returns matched and context lines with no ANSI escape sequences (AC2)', async () => {
    const before = `${ESC}[36mbefore line${ESC}[0m`;
    const match = `${ESC}[31mFAIL${ESC}[39m src/foo.spec.ts`;
    const after = `${ESC}[36mafter line${ESC}[0m`;
    mockFetchRunLogs.mockResolvedValue(
      fetchResult([before, match, after].join('\n')),
    );

    const result = await searchLogs({ runId: 1, pattern: 'FAIL' });

    expect(result.isError).toBeUndefined();
    const parsed = parseSearchResult(textOf(result));
    expect(parsed.matches).toHaveLength(1);
    const [hit] = parsed.matches;
    expect(hit.line).toBe('FAIL src/foo.spec.ts');
    expect(hit.before).toEqual(['before line']);
    expect(hit.after).toEqual(['after line']);
    expect(textOf(result).includes(ESC)).toBe(false);
  });
});
