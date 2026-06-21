import {
  formatLogSearch,
  formatRunJobs,
  formatRunList,
  formatSessionStats,
  JOB_LIST_COLUMNS,
  RUN_LIST_COLUMNS,
  type LogMatch,
} from './format.js';

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
    const parsed = JSON.parse(formatLogSearch(meta, [match]));
    expect(parsed.returnedMatches).toBe(1);
    expect(parsed.truncated).toBe(true);
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0].lineNumber).toBe(42);
  });

  it('truncates a pathologically long matched line with an omitted-count marker', () => {
    const longLine = 'x'.repeat(2000);
    const parsed = JSON.parse(
      formatLogSearch(meta, [{ ...match, line: longLine }]),
    );
    expect(parsed.matches[0].line.length).toBeLessThanOrEqual(500);
    expect(parsed.matches[0].line).toContain('…+');
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
    const parsed = JSON.parse(formatSessionStats(stats));
    expect(parsed.jsonlPath).toBeUndefined();
    expect(parsed.toolCounts).toEqual({ Bash: 5, Read: 10 });
    expect(parsed.bashFallbackRatio).toBe(0.33);
  });

  it('strips jsonlPath recursively across subagentStats', () => {
    const out = formatSessionStats({
      ...stats,
      subagentStats: [{ ...stats, sessionId: 'sub', jsonlPath: '/sub.jsonl' }],
    });
    const parsed = JSON.parse(out);
    expect(parsed.subagentStats[0].jsonlPath).toBeUndefined();
    expect(parsed.subagentStats[0].sessionId).toBe('sub');
  });
});
