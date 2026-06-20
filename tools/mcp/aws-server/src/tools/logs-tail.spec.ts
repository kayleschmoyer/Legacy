jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import {
  BATCH_CONCURRENCY,
  MAX_BATCH_FUNCTIONS,
  logsTail,
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

const baseParams = {
  since: '1h',
  environment: 'dev',
  maxLines: 500,
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
