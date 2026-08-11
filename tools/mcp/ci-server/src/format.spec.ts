import {
  formatBatchLogPayload,
  formatLogPayload,
  formatLogSearch,
  formatRunJobs,
  formatRunList,
  formatSessionStats,
  JOB_LIST_COLUMNS,
  type LogMatch,
  type LogSearchMeta,
  RUN_LIST_COLUMNS,
} from './format.js';

/** Parsed shape of a `formatLogSearch` result, for typed assertions in tests. */
type ParsedSearchResult = LogSearchMeta & {
  matches: LogMatch[];
  charTruncated?: boolean;
};

function parseSearchResult(out: string): ParsedSearchResult {
  return JSON.parse(out) as ParsedSearchResult;
}

interface ParsedSessionStats {
  sessionId?: string;
  jsonlPath?: string;
  toolCounts?: Record<string, number>;
  bashFallbackRatio?: number;
  subagentStats?: ParsedSessionStats[];
}

function parseSessionStats(out: string): ParsedSessionStats {
  return JSON.parse(out) as ParsedSessionStats;
}

/** A fully-populated run as produced by list-runs' `mapRun`. */
function makeRun(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 27490583650,
    attempt: 1,
    conclusion: null,
    createdAt: '2026-06-14T06:24:19Z',
    databaseId: 27490583650,
    displayTitle:
      'LS-6489 feat(football): premium-only advanced search filters',
    event: 'pull_request',
    headBranch: 'claude/relaxed-wright-owhd9w',
    headSha: '820001cb9e3d269692d4460d2e72c8031fb1aec5',
    name: 'Legacy Sports CI Orchestrator',
    number: 22728,
    startedAt: null,
    status: 'pending',
    updatedAt: '2026-06-14T06:24:20Z',
    url: 'https://github.com/bkrupa/legacy-sports/actions/runs/27490583650',
    workflowDatabaseId: 200935019,
    workflowName: 'Legacy Sports CI Orchestrator',
    ...overrides,
  };
}

describe('formatRunList', () => {
  it('returns an explicit empty-state string (never a blank table)', () => {
    expect(formatRunList([])).toBe('No workflow runs found.');
  });

  it('renders a compact Markdown table with the pruned column header once', () => {
    const out = formatRunList([
      makeRun(),
      makeRun({ id: 2, status: 'completed' }),
    ]);
    const lines = out.split('\n');
    // Header + separator + 2 data rows.
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(RUN_LIST_COLUMNS.join('|'));
    expect(lines[1]).toBe(RUN_LIST_COLUMNS.map(() => '---').join('|'));
    // No pretty-print indentation.
    expect(out).not.toContain('\n  ');
  });

  it('prunes redundant/low-value fields agents do not read off a list', () => {
    const out = formatRunList([makeRun()]);
    for (const dropped of [
      'databaseId',
      'workflowName',
      'headSha',
      'workflowDatabaseId',
      'startedAt',
      'updatedAt',
    ]) {
      expect(out).not.toContain(dropped);
    }
    // The long run URL is derivable from id and is dropped.
    expect(out).not.toContain('https://github.com');
  });

  it('preserves the fields agents depend on (id is the runId for follow-up calls)', () => {
    const out = formatRunList([makeRun()]);
    expect(out).toContain('27490583650');
    expect(out).toContain('pending');
    expect(out).toContain('claude/relaxed-wright-owhd9w');
  });

  it('truncates a verbose displayTitle so one row cannot dominate', () => {
    const longTitle = 'x'.repeat(200);
    const out = formatRunList([makeRun({ displayTitle: longTitle })]);
    expect(out).not.toContain(longTitle);
    expect(out).toContain('…');
  });
});

describe('formatRunJobs', () => {
  const summary = {
    total: 2,
    returned: 2,
    passed: 1,
    failed: 1,
    cancelled: 0,
    skipped: 0,
    inProgress: 0,
    allPassed: false,
  };

  function makeJob(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      databaseId: 111,
      name: 'build',
      status: 'completed',
      conclusion: 'success',
      startedAt: '2026-06-14T06:24:19Z',
      completedAt: '2026-06-14T06:25:19Z',
      ...overrides,
    };
  }

  it('emits a minified-JSON header carrying runId + summary', () => {
    const out = formatRunJobs(99, summary, [makeJob()], false);
    const header = out.split('\n\n')[0];
    expect(header).toBe(JSON.stringify({ runId: 99, summary }));
    // Minified — no pretty-print whitespace.
    expect(header).not.toContain('\n');
    expect(header).not.toContain(': ');
  });

  it('renders the job list as a Markdown table with pruned columns', () => {
    const out = formatRunJobs(
      99,
      summary,
      [makeJob(), makeJob({ databaseId: 222 })],
      false,
    );
    const body = out.split('\n\n')[1];
    expect(body.split('\n')[0]).toBe(JOB_LIST_COLUMNS.join('|'));
    expect(body).toContain('111');
    expect(body).toContain('222');
    // Per-job timestamps are dropped from a flat job list.
    expect(out).not.toContain('startedAt');
    expect(out).not.toContain('completedAt');
  });

  it('falls back to minified JSON when per-step detail nests the rows', () => {
    const job = makeJob({
      steps: [
        {
          number: 1,
          name: 'checkout',
          status: 'completed',
          conclusion: 'success',
        },
      ],
    });
    const out = formatRunJobs(99, summary, [job], true);
    const body = out.split('\n\n')[1];
    expect(body).toContain('"steps"');
    expect(body).toContain('checkout');
    // Not a table.
    expect(body).not.toContain('databaseId|name|status|conclusion');
  });

  it('signals an empty job list explicitly', () => {
    const out = formatRunJobs(99, summary, [], false);
    expect(out.split('\n\n')[1]).toBe('No jobs found.');
  });
});

describe('formatLogSearch', () => {
  const meta = {
    runId: 5,
    jobId: null,
    pattern: 'error',
    totalMatches: 3,
    returnedMatches: 1,
    truncated: true,
    jobsSearched: 2,
    jobsTotal: 2,
  };

  const match: LogMatch = {
    lineNumber: 42,
    line: 'error: something failed',
    before: ['line 41'],
    after: ['line 43'],
  };

  it('emits minified JSON (no pretty-print whitespace)', () => {
    const out = formatLogSearch(meta, [match]);
    expect(out).not.toContain('\n');
    expect(out).not.toContain('  ');
    expect(JSON.parse(out)).toMatchObject({ runId: 5, totalMatches: 3 });
  });

  it('drops input-echo flags the agent already supplied', () => {
    const out = formatLogSearch(meta, [match]);
    expect(out).not.toContain('isRegex');
    expect(out).not.toContain('caseSensitive');
    expect(out).not.toContain('failedOnly');
  });

  it('preserves result metadata + the matches array', () => {
    const parsed = parseSearchResult(formatLogSearch(meta, [match]));
    expect(parsed.returnedMatches).toBe(1);
    expect(parsed.truncated).toBe(true);
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0].lineNumber).toBe(42);
    expect(parsed.jobsSearched).toBe(2);
    expect(parsed.jobsTotal).toBe(2);
  });

  it('surfaces scopeNote when the caller supplies one (zero-scope search)', () => {
    const parsed = parseSearchResult(
      formatLogSearch(
        {
          ...meta,
          totalMatches: 0,
          returnedMatches: 0,
          truncated: false,
          jobsSearched: 0,
          jobsTotal: 3,
          scopeNote:
            '0 of 3 job(s) were searched — all were excluded by failedOnly=true (default). Retry with failedOnly=false to search successful-job logs too.',
        },
        [],
      ),
    );
    expect(parsed.jobsSearched).toBe(0);
    expect(parsed.scopeNote).toMatch(/0 of 3 job\(s\) were searched/);
  });

  it('truncates a pathologically long matched line with an omitted-count marker', () => {
    const longLine = 'x'.repeat(2000);
    const parsed = parseSearchResult(
      formatLogSearch(meta, [{ ...match, line: longLine }]),
    );
    expect(parsed.matches[0].line.length).toBeLessThanOrEqual(500);
    expect(parsed.matches[0].line).toContain('…+');
  });

  it('accepts a caller-supplied truncateLineLength applied to matched line and context alike', () => {
    const parsed = parseSearchResult(
      formatLogSearch(
        meta,
        [
          {
            ...match,
            line: 'x'.repeat(100),
            before: ['y'.repeat(100)],
            after: ['z'.repeat(100)],
          },
        ],
        { truncateLineLength: 20 },
      ),
    );
    expect(parsed.matches[0].line.length).toBeLessThanOrEqual(20);
    expect(parsed.matches[0].before[0].length).toBeLessThanOrEqual(20);
    expect(parsed.matches[0].after[0].length).toBeLessThanOrEqual(20);
  });

  it('drops trailing matches to keep the full serialized response under maxChars (LS-8390)', () => {
    // Reproduces LS-8390: 20 matches with long context arrays can overflow the
    // token limit in aggregate even though every individual line is capped.
    const manyMatches: LogMatch[] = Array.from({ length: 20 }, (_, i) => ({
      lineNumber: i + 1,
      line: `ERROR: verbose CI step output ${'v'.repeat(400)}`,
      before: Array.from({ length: 2 }, () => 'x'.repeat(180)),
      after: Array.from({ length: 15 }, () => 'y'.repeat(180)),
    }));

    const out = formatLogSearch(
      { ...meta, totalMatches: 20, returnedMatches: 20 },
      manyMatches,
      { maxChars: 5_000 },
    );

    expect(out.length).toBeLessThanOrEqual(5_000);
    const parsed = parseSearchResult(out);
    expect(parsed.charTruncated).toBe(true);
    expect(parsed.truncated).toBe(true);
    expect(parsed.matches.length).toBeLessThan(20);
    expect(parsed.matches.length).toBe(parsed.returnedMatches);
  });

  it('stays under the default 50000-char cap without a caller-supplied maxChars', () => {
    const manyMatches: LogMatch[] = Array.from({ length: 20 }, (_, i) => ({
      lineNumber: i + 1,
      line: `ERROR: verbose CI step output ${'v'.repeat(400)}`,
      before: Array.from({ length: 2 }, () => 'x'.repeat(180)),
      after: Array.from({ length: 15 }, () => 'y'.repeat(180)),
    }));

    const out = formatLogSearch(
      { ...meta, totalMatches: 20, returnedMatches: 20 },
      manyMatches,
    );

    expect(out.length).toBeLessThanOrEqual(50_000);
  });
});

describe('formatLogPayload (LS-8504)', () => {
  const meta = { runId: 1, jobId: null, totalLines: 3 };

  it('renders a minified-JSON header line followed by a blank line then the raw log text', () => {
    const out = formatLogPayload(meta, 'line 1\nline 2\nline 3');
    const [header, blank, ...rest] = out.split('\n');
    expect(JSON.parse(header)).toEqual(meta);
    expect(blank).toBe('');
    expect(rest).toEqual(['line 1', 'line 2', 'line 3']);
  });

  it('keeps every log line on its own physical line — never JSON-escapes the log content (the LS-8504 bug)', () => {
    const logs = Array.from({ length: 500 }, (_, i) => `log line ${i}`).join(
      '\n',
    );
    const out = formatLogPayload(meta, logs);
    const physicalLines = out.split('\n');
    // Header + blank + 500 log lines.
    expect(physicalLines).toHaveLength(502);
    expect(physicalLines[2]).toBe('log line 0');
    expect(physicalLines[501]).toBe('log line 499');
    // The bug: JSON.stringify({ ...meta, logs }) would escape every log
    // newline to a literal `\n` two-character sequence instead of a real
    // newline byte. That never happens here.
    expect(out).not.toContain('\\n');
  });

  it('a grep-style line search finds the matching physical line, not the whole blob', () => {
    const logs = ['setup', 'ERROR: something broke', 'teardown'].join('\n');
    const out = formatLogPayload(meta, logs);
    const matches = out.split('\n').filter((line) => line.includes('ERROR'));
    expect(matches).toEqual(['ERROR: something broke']);
  });
});

describe('formatBatchLogPayload (LS-8504)', () => {
  it('renders a header with runIds + missing, then one section per run', () => {
    const out = formatBatchLogPayload(
      [{ runId: 99, reason: 'BlobNotFound' }],
      [
        { runId: 1, meta: { runId: 1 }, logs: 'log a1\nlog a2' },
        { runId: 2, meta: { runId: 2 }, logs: 'log b1\nlog b2' },
      ],
    );

    const header = out.split('\n\n')[0];
    expect(JSON.parse(header)).toEqual({
      runIds: [1, 2],
      missing: [{ runId: 99, reason: 'BlobNotFound' }],
    });
    expect(out).toContain('=== run 1 ===');
    expect(out).toContain('=== run 2 ===');
    expect(out).toContain('log a1\nlog a2');
    expect(out).toContain('log b1\nlog b2');
    // No JSON-escaped newlines anywhere in the log content.
    expect(out).not.toContain('\\n');
  });

  it('omits run sections when every run is missing', () => {
    const out = formatBatchLogPayload([{ runId: 1, reason: 'boom' }], []);
    expect(JSON.parse(out)).toEqual({
      runIds: [],
      missing: [{ runId: 1, reason: 'boom' }],
    });
  });
});

describe('formatSessionStats', () => {
  const stats = {
    project: 'legacy-sports',
    sessionId: 'abc',
    jsonlPath: '/home/user/.claude/projects/legacy-sports/abc.jsonl',
    totalLines: 100,
    totalMessages: 50,
    firstMessageAt: '2026-06-14T06:00:00Z',
    lastMessageAt: '2026-06-14T06:30:00Z',
    toolCounts: { Bash: 5, Read: 10 },
    bashFallbackRatio: 0.33,
  };

  it('emits minified JSON', () => {
    const out = formatSessionStats(stats);
    expect(out).not.toContain('\n');
    expect(JSON.parse(out)).toMatchObject({ sessionId: 'abc' });
  });

  it('prunes the verbose jsonlPath but preserves the stats agents read', () => {
    const parsed = parseSessionStats(formatSessionStats(stats));
    expect(parsed.jsonlPath).toBeUndefined();
    expect(parsed.toolCounts).toEqual({ Bash: 5, Read: 10 });
    expect(parsed.bashFallbackRatio).toBe(0.33);
  });

  it('strips jsonlPath recursively across subagentStats', () => {
    const out = formatSessionStats({
      ...stats,
      subagentStats: [{ ...stats, sessionId: 'sub', jsonlPath: '/sub.jsonl' }],
    });
    const parsed = parseSessionStats(out);
    expect(parsed.subagentStats?.[0].jsonlPath).toBeUndefined();
    expect(parsed.subagentStats?.[0].sessionId).toBe('sub');
  });
});
