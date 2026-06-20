jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import {
  BATCH_CONCURRENCY,
  MAX_BATCH_FUNCTIONS,
  lambdaStatus,
  type CommandRunner,
} from './lambda-status.js';

function unwrap(result: Awaited<ReturnType<typeof lambdaStatus>>): {
  body: Record<string, unknown>;
  isError: boolean;
} {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Expected a text content block');
  }
  return {
    body: JSON.parse(block.text) as Record<string, unknown>,
    isError: Boolean(result.isError),
  };
}

const configJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    FunctionName: 'legacy-sports-dev-graphql',
    Runtime: 'nodejs20.x',
    State: 'Active',
    LastModified: '2026-01-01T00:00:00.000+0000',
    MemorySize: 512,
    Timeout: 30,
    Handler: 'index.handler',
    CodeSize: 1234,
    Description: '',
    ...overrides,
  });

const baseParams = { environment: 'dev' };

describe('lambdaStatus (singular)', () => {
  it('returns config for an existing function', async () => {
    const runner: CommandRunner = jest.fn().mockResolvedValue(configJson());
    const { body, isError } = unwrap(
      await lambdaStatus({ ...baseParams, function: 'graphql' }, runner),
    );
    expect(isError).toBe(false);
    expect(body.exists).toBe(true);
    expect(body.functionName).toBe('legacy-sports-dev-graphql');
    expect(body.runtime).toBe('nodejs20.x');
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('strips the -lambda suffix when expanding the deployed name', async () => {
    const runner: CommandRunner = jest.fn().mockResolvedValue(configJson());
    await lambdaStatus({ ...baseParams, function: 'stats-lambda' }, runner);
    const call = (runner as jest.Mock).mock.calls[0];
    const args = call[1] as string[];
    const nameIdx = args.indexOf('--function-name');
    expect(args[nameIdx + 1]).toBe('legacy-sports-dev-stats');
  });

  it('returns exists:false (no error block) when the function is not found', async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockRejectedValue(
        new Error('ResourceNotFoundException: Function not found'),
      );
    const { body, isError } = unwrap(
      await lambdaStatus({ ...baseParams, function: 'graphql' }, runner),
    );
    expect(isError).toBe(false);
    expect(body.exists).toBe(false);
    expect(body.functionName).toBe('legacy-sports-dev-graphql');
  });

  it('returns an error block with an SSO remedy when credentials are expired', async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockRejectedValue(new Error('sso session has expired'));
    const { body, isError } = unwrap(
      await lambdaStatus({ ...baseParams, function: 'graphql' }, runner),
    );
    expect(isError).toBe(true);
    expect(body.ok).toBe(false);
    expect(body.remedy).toMatch(/aws sso login/);
  });
});

describe('lambdaStatus (batch)', () => {
  it('returns a per-function entry under `statuses` for each requested function', async () => {
    const runner: CommandRunner = jest.fn(async (_cmd, args) => {
      const nameIdx = (args as string[]).indexOf('--function-name');
      const full = (args as string[])[nameIdx + 1];
      return configJson({ FunctionName: full });
    });

    const { body, isError } = unwrap(
      await lambdaStatus(
        { ...baseParams, functions: ['graphql', 'db', 'stats'] },
        runner,
      ),
    );

    expect(isError).toBe(false);
    const statuses = body.statuses as Record<
      string,
      { exists: boolean; functionName: string }
    >;
    expect(Object.keys(statuses)).toEqual(['graphql', 'db', 'stats']);
    expect(statuses.graphql.exists).toBe(true);
    expect(statuses.graphql.functionName).toBe('legacy-sports-dev-graphql');
    expect(statuses.db.functionName).toBe('legacy-sports-dev-db');
    expect(body.missing).toEqual([]);
  });

  it('records ResourceNotFound as exists:false in `statuses` (not in `missing`)', async () => {
    const runner: CommandRunner = jest.fn(async (_cmd, args) => {
      const nameIdx = (args as string[]).indexOf('--function-name');
      const full = (args as string[])[nameIdx + 1];
      if (full.endsWith('db')) {
        throw new Error('ResourceNotFoundException: Function not found: db');
      }
      return configJson({ FunctionName: full });
    });

    const { body } = unwrap(
      await lambdaStatus(
        { ...baseParams, functions: ['graphql', 'db'] },
        runner,
      ),
    );

    const statuses = body.statuses as Record<
      string,
      { exists: boolean; functionName: string }
    >;
    expect(statuses.graphql.exists).toBe(true);
    expect(statuses.db.exists).toBe(false);
    expect(body.missing).toEqual([]);
  });

  it('isolates real failures to `missing[]` without failing the rest of the batch', async () => {
    const runner: CommandRunner = jest.fn(async (_cmd, args) => {
      const nameIdx = (args as string[]).indexOf('--function-name');
      const full = (args as string[])[nameIdx + 1];
      if (full.endsWith('graphql')) {
        throw new Error('boom for graphql');
      }
      return configJson({ FunctionName: full });
    });

    const { body, isError } = unwrap(
      await lambdaStatus(
        { ...baseParams, functions: ['graphql', 'db'] },
        runner,
      ),
    );

    expect(isError).toBe(false);
    const statuses = body.statuses as Record<string, unknown>;
    const missing = body.missing as Array<{
      function: string;
      functionName: string;
      error: string;
    }>;
    expect(Object.keys(statuses)).toEqual(['db']);
    expect(missing).toHaveLength(1);
    expect(missing[0].function).toBe('graphql');
    expect(missing[0].functionName).toBe('legacy-sports-dev-graphql');
    expect(missing[0].error).toBe('boom for graphql');
  });

  it('attaches an SSO remedy to `missing[]` entries when credentials are expired', async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockRejectedValue(new Error('sso session has expired'));
    const { body } = unwrap(
      await lambdaStatus({ ...baseParams, functions: ['graphql'] }, runner),
    );
    const missing = body.missing as Array<{ remedy?: string }>;
    expect(missing[0].remedy).toMatch(/aws sso login/);
  });

  it(`rejects more than ${MAX_BATCH_FUNCTIONS} functions`, async () => {
    const runner: CommandRunner = jest.fn();
    const eleven = Array.from({ length: 11 }, (_, i) => `fn${i}`);
    const { body, isError } = unwrap(
      await lambdaStatus({ ...baseParams, functions: eleven }, runner),
    );
    expect(isError).toBe(true);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/at most 10/);
    expect(runner).not.toHaveBeenCalled();
  });

  it('rejects when both `function` and `functions` are provided', async () => {
    const runner: CommandRunner = jest.fn();
    const { body, isError } = unwrap(
      await lambdaStatus(
        { ...baseParams, function: 'graphql', functions: ['db'] },
        runner,
      ),
    );
    expect(isError).toBe(true);
    expect(body.error).toMatch(/either `function`.*or `functions`/);
    expect(runner).not.toHaveBeenCalled();
  });

  it('rejects when neither `function` nor `functions` is provided', async () => {
    const runner: CommandRunner = jest.fn();
    const { body, isError } = unwrap(
      await lambdaStatus({ ...baseParams }, runner),
    );
    expect(isError).toBe(true);
    expect(body.error).toMatch(/must be provided/);
  });

  it(`caps concurrency at ${BATCH_CONCURRENCY}`, async () => {
    let inFlight = 0;
    let peak = 0;
    const runner: CommandRunner = jest.fn(async (_cmd, args) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const nameIdx = (args as string[]).indexOf('--function-name');
      const full = (args as string[])[nameIdx + 1];
      return configJson({ FunctionName: full });
    });

    const ten = Array.from({ length: 10 }, (_, i) => `fn${i}`);
    const { isError } = unwrap(
      await lambdaStatus({ ...baseParams, functions: ten }, runner),
    );

    expect(isError).toBe(false);
    expect(runner).toHaveBeenCalledTimes(10);
    expect(peak).toBeLessThanOrEqual(BATCH_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });
});
