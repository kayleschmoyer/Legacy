jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import {
  BATCH_CONCURRENCY,
  ERROR_LINE_PATTERN,
  MAX_BATCH_FUNCTIONS,
  RECENT_LINES,
  extractErrorLines,
  logsTail,
  renderLogsAsMarkdown,
  type CommandRunner,
} from './logs-tail.js';

function parseText(text: string): unknown {
  return JSON.parse(text);
}

function unwrap(result: Awaited<ReturnType<typeof logsTail>>): {
  body: Record<string, unknown>;
  isError: boolean;
} {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Expected a text content block');
  }
  return {
    body: parseText(block.text) as Record<string, unknown>,
    isError: Boolean(result.isError),
  };
}

function rawText(result: Awaited<ReturnType<typeof logsTail>>): string {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Expected a text content block');
  }
  return block.text;
}

// `format: 'json'` is set explicitly here so the existing structured-shape
// tests continue to exercise the JSON branch (the public default is now
// `markdown`).
const baseParams = {
  since: '1h',
  environment: 'dev',
  maxLines: 500,
  format: 'json' as const,
};

describe('logsTail (singular)', () => {
  it('returns log output for the requested function', async () => {
    const runner: CommandRunner = jest.fn().mockResolvedValue('line1\nline2');
    const { body, isError } = unwrap(
      await logsTail({ ...baseParams, function: 'graphql' }, runner),
    );
    expect(isError).toBe(false);
    expect(body.logGroup).toBe('/aws/lambda/legacy-sports-dev-graphql');
    expect(body.truncated).toBe(false);
    expect(body.logs).toBe('line1\nline2');
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('substitutes the empty-output placeholder when the runner returns ""', async () => {
    const runner: CommandRunner = jest.fn().mockResolvedValue('');
    const { body } = unwrap(
      await logsTail({ ...baseParams, function: 'db' }, runner),
    );
    expect(body.logs).toBe('(no log events found in the given time range)');
  });

  it('returns an error block when the runner throws', async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockRejectedValue(new Error('sso session has expired'));
    const { body, isError } = unwrap(
      await logsTail({ ...baseParams, function: 'graphql' }, runner),
    );
    expect(isError).toBe(true);
    expect(body.ok).toBe(false);
    expect(body.remedy).toMatch(/aws sso login/);
  });
});

describe('logsTail (batch)', () => {
  it('returns a per-function block under `logs` for each requested function', async () => {
    const runner: CommandRunner = jest.fn(async (_cmd, args) => {
      const group = args[2];
      if (group.endsWith('graphql')) return 'g1\ng2';
      if (group.endsWith('db')) return 'd1';
      return '';
    });

    const { body, isError } = unwrap(
      await logsTail(
        { ...baseParams, functions: ['graphql', 'db', 'stats'] },
        runner,
      ),
    );

    expect(isError).toBe(false);
    const logs = body.logs as Record<
      string,
      { logs: string; logGroup: string }
    >;
    expect(Object.keys(logs)).toEqual(['graphql', 'db', 'stats']);
    expect(logs.graphql.logs).toBe('g1\ng2');
    expect(logs.db.logs).toBe('d1');
    // Function with empty output gets the placeholder, not an error.
    expect(logs.stats.logs).toBe(
      '(no log events found in the given time range)',
    );
  });

  it('isolates failures: one function erroring does not fail the others', async () => {
    const runner: CommandRunner = jest.fn(async (_cmd, args) => {
      const group = args[2];
      if (group.endsWith('graphql')) throw new Error('boom for graphql');
      return 'ok-line';
    });

    const { body, isError } = unwrap(
      await logsTail({ ...baseParams, functions: ['graphql', 'db'] }, runner),
    );

    expect(isError).toBe(false);
    const logs = body.logs as Record<string, Record<string, unknown>>;
    expect(logs.graphql.ok).toBe(false);
    expect(logs.graphql.error).toBe('boom for graphql');
    expect(logs.db.logs).toBe('ok-line');
  });

  it(`rejects more than ${MAX_BATCH_FUNCTIONS} functions`, async () => {
    const runner: CommandRunner = jest.fn();
    const eleven = Array.from({ length: 11 }, (_, i) => `fn${i}`);
    const { body, isError } = unwrap(
      await logsTail({ ...baseParams, functions: eleven }, runner),
    );
    expect(isError).toBe(true);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/at most 10/);
    expect(runner).not.toHaveBeenCalled();
  });

  it('rejects when both `function` and `functions` are provided', async () => {
    const runner: CommandRunner = jest.fn();
    const { body, isError } = unwrap(
      await logsTail(
        { ...baseParams, function: 'graphql', functions: ['db'] },
        runner,
      ),
    );
    expect(isError).toBe(true);
    expect(body.error).toMatch(/either `function`.*or `functions`/);
    expect(runner).not.toHaveBeenCalled();
  });

  it(`caps concurrency at ${BATCH_CONCURRENCY}`, async () => {
    let inFlight = 0;
    let peak = 0;
    const runner: CommandRunner = jest.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return 'x';
    });

    const ten = [
      'graphql',
      'db',
      'oauth-proxy',
      'notifications',
      'stats',
      'game-selection',
      'draft-processor',
      'websocket',
      'apple-iap',
      'stripe-webhook',
    ];
    const { isError } = unwrap(
      await logsTail({ ...baseParams, functions: ten }, runner),
    );

    expect(isError).toBe(false);
    expect(runner).toHaveBeenCalledTimes(10);
    expect(peak).toBeLessThanOrEqual(BATCH_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });

  it('rejects when neither `function` nor `functions` is provided', async () => {
    const runner: CommandRunner = jest.fn();
    const { body, isError } = unwrap(await logsTail({ ...baseParams }, runner));
    expect(isError).toBe(true);
    expect(body.error).toMatch(/must be provided/);
  });
});

const FIXTURE_LINES = [
  '2026-06-20T00:00:00.000Z START RequestId: abc',
  '2026-06-20T00:00:00.100Z INFO  Handling request',
  '2026-06-20T00:00:00.200Z DEBUG cache miss for key=foo',
  '2026-06-20T00:00:00.300Z WARN  retrying upstream (attempt 1)',
  '2026-06-20T00:00:00.400Z INFO  fetched 12 rows',
  '2026-06-20T00:00:00.500Z ERROR TypeError: Cannot read properties of undefined (reading "id")',
  '    at handler (/var/task/index.js:42:17)',
  '    at processTicksAndRejections (node:internal/process/task_queues.js:95:5)',
  '2026-06-20T00:00:00.600Z INFO  request completed in 421ms',
  '2026-06-20T00:00:00.700Z END RequestId: abc',
  '2026-06-20T00:00:01.000Z Exception in scheduled task: queue drained',
  '    at drain (/var/task/queue.js:9:11)',
];

const FIXTURE = FIXTURE_LINES.join('\n');

describe('extractErrorLines', () => {
  it('captures ERROR/WARN/Exception lines plus following stack frames', () => {
    const extracted = extractErrorLines(FIXTURE_LINES);
    expect(extracted).toMatchInlineSnapshot(`
[
  "2026-06-20T00:00:00.300Z WARN  retrying upstream (attempt 1)",
  "2026-06-20T00:00:00.500Z ERROR TypeError: Cannot read properties of undefined (reading "id")",
  "    at handler (/var/task/index.js:42:17)",
  "    at processTicksAndRejections (node:internal/process/task_queues.js:95:5)",
  "2026-06-20T00:00:01.000Z Exception in scheduled task: queue drained",
  "    at drain (/var/task/queue.js:9:11)",
]
`);
  });

  it('returns an empty list when no log lines match the error pattern', () => {
    const clean = [
      '2026-06-20T00:00:00.000Z INFO  ok',
      '2026-06-20T00:00:00.100Z DEBUG  cache hit',
    ];
    expect(clean.some((l) => ERROR_LINE_PATTERN.test(l))).toBe(false);
    expect(extractErrorLines(clean)).toEqual([]);
  });
});

describe('renderLogsAsMarkdown', () => {
  it('renders Errors section + Recent code-block (snapshot)', () => {
    const md = renderLogsAsMarkdown({
      logGroup: '/aws/lambda/legacy-sports-dev-graphql',
      since: '1h',
      filter: null,
      rawText: FIXTURE,
      totalLines: FIXTURE_LINES.length,
      shownLines: FIXTURE_LINES.length,
      truncated: false,
    });
    expect(md).toMatchSnapshot();
  });

  it('caps the Recent section at the last 50 lines', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `INFO line ${i}`);
    const md = renderLogsAsMarkdown({
      logGroup: '/aws/lambda/legacy-sports-dev-graphql',
      since: '5m',
      filter: 'INFO',
      rawText: lines.join('\n'),
      totalLines: 200,
      shownLines: 200,
      truncated: false,
    });
    expect(md).toContain(`### Recent (last ${RECENT_LINES} lines)`);
    expect(md).toContain(`INFO line ${200 - RECENT_LINES}`);
    expect(md).toContain('INFO line 199');
    expect(md).not.toContain(`INFO line ${200 - RECENT_LINES - 1}\n`);
  });

  it('surfaces truncation in the header', () => {
    const md = renderLogsAsMarkdown({
      logGroup: '/aws/lambda/legacy-sports-dev-graphql',
      since: '1h',
      filter: null,
      rawText: 'INFO only line',
      totalLines: 1234,
      shownLines: 500,
      truncated: true,
    });
    expect(md).toContain('500 shown / 1234 total (truncated)');
  });
});

describe('logsTail markdown integration', () => {
  it('returns markdown by default (singular)', async () => {
    const runner: CommandRunner = jest.fn().mockResolvedValue(FIXTURE);
    const params = { ...baseParams, function: 'graphql', format: undefined };
    const text = rawText(await logsTail(params, runner));
    expect(text).toContain('### Errors');
    expect(text).toContain('### Recent');
    expect(text).toContain('/aws/lambda/legacy-sports-dev-graphql');
  });

  it('renders one section per function in batch markdown mode', async () => {
    const runner: CommandRunner = jest.fn(async () => 'INFO ok');
    const text = rawText(
      await logsTail(
        {
          ...baseParams,
          format: undefined,
          functions: ['graphql', 'db'],
        },
        runner,
      ),
    );
    expect(text).toContain('## graphql');
    expect(text).toContain('## db');
    expect(text.match(/### Errors/g)?.length).toBe(2);
  });
});
