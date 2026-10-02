jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import {
  BATCH_CONCURRENCY,
  type CommandRunner,
  isSecretName,
  lambdaStatus,
  MAX_BATCH_FUNCTIONS,
  MAX_NAME_MATCHES,
  REDACTED,
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
    const call = jest.mocked(runner).mock.calls[0];
    const args = call[1];
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
    const runner: CommandRunner = jest.fn((_cmd, args) => {
      const nameIdx = args.indexOf('--function-name');
      const full = args[nameIdx + 1];
      return Promise.resolve(configJson({ FunctionName: full }));
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
    const runner: CommandRunner = jest.fn((_cmd, args) => {
      const nameIdx = args.indexOf('--function-name');
      const full = args[nameIdx + 1];
      if (full.endsWith('db')) {
        throw new Error('ResourceNotFoundException: Function not found: db');
      }
      return Promise.resolve(configJson({ FunctionName: full }));
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
    const runner: CommandRunner = jest.fn((_cmd, args) => {
      const nameIdx = args.indexOf('--function-name');
      const full = args[nameIdx + 1];
      if (full.endsWith('graphql')) {
        throw new Error('boom for graphql');
      }
      return Promise.resolve(configJson({ FunctionName: full }));
    });

    const { body, isError } = unwrap(
      await lambdaStatus(
        { ...baseParams, functions: ['graphql', 'db'] },
        runner,
      ),
    );

    expect(isError).toBe(true);
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
    const overCap = Array.from(
      { length: MAX_BATCH_FUNCTIONS + 1 },
      (_, i) => `fn${i}`,
    );
    const { body, isError } = unwrap(
      await lambdaStatus({ ...baseParams, functions: overCap }, runner),
    );
    expect(isError).toBe(true);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(new RegExp(`at most ${MAX_BATCH_FUNCTIONS}`));
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
      const nameIdx = args.indexOf('--function-name');
      const full = args[nameIdx + 1];
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

const envConfigJson = (variables: Record<string, string>) =>
  configJson({ Environment: { Variables: variables } });

const SAMPLE_ENV = {
  JIRA_ASSIGNEE_EMAIL: 'someone@example.com',
  LOG_LEVEL: 'debug',
  JIRA_CLIENT_SECRET: 'super-secret-value',
  ROLLBAR_ACCESS_TOKEN: 'tok-live-value',
  DB_PASSWORD: 'hunter2',
  STRIPE_SECRET_KEY: 'sk_live_value',
};

type EnvReport = {
  variableNames: string[];
  variables?: Record<string, string>;
  redactedNames?: string[];
};

describe('isSecretName', () => {
  it.each([
    'JIRA_CLIENT_SECRET',
    'ROLLBAR_ACCESS_TOKEN',
    'DB_PASSWORD',
    'STRIPE_SECRET_KEY',
    'JWT_SECRET_KEY',
    'jira_client_secret',
  ])('treats %s as a secret name', (name) => {
    expect(isSecretName(name)).toBe(true);
  });

  it.each(['JIRA_ASSIGNEE_EMAIL', 'LOG_LEVEL', 'NODE_ENV', 'KEYSTONE_URL'])(
    'treats %s as a non-secret name',
    (name) => {
      expect(isSecretName(name)).toBe(false);
    },
  );
});

describe('lambdaStatus environment reporting', () => {
  it('omits the environment block entirely by default', async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockResolvedValue(envConfigJson(SAMPLE_ENV));
    const { body } = unwrap(
      await lambdaStatus({ ...baseParams, function: 'mcp-jira' }, runner),
    );
    expect(body.environment).toBeUndefined();
  });

  it('returns sorted variable names only under includeEnv', async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockResolvedValue(envConfigJson(SAMPLE_ENV));
    const { body } = unwrap(
      await lambdaStatus(
        { ...baseParams, function: 'mcp-jira', includeEnv: true },
        runner,
      ),
    );
    const env = body.environment as EnvReport;
    expect(env.variableNames).toEqual(Object.keys(SAMPLE_ENV).sort());
    expect(env.variables).toBeUndefined();
    expect(env.redactedNames).toBeUndefined();
    // The whole point of the ticket: names alone answer "did this var land?"
    expect(env.variableNames).toContain('JIRA_ASSIGNEE_EMAIL');
  });

  it('reports an empty name list for a function with no env vars', async () => {
    const runner: CommandRunner = jest.fn().mockResolvedValue(configJson());
    const { body } = unwrap(
      await lambdaStatus(
        { ...baseParams, function: 'graphql', includeEnv: true },
        runner,
      ),
    );
    expect((body.environment as EnvReport).variableNames).toEqual([]);
  });

  it('returns non-secret values verbatim and redacts secret-named ones under includeEnvValues', async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockResolvedValue(envConfigJson(SAMPLE_ENV));
    const { body } = unwrap(
      await lambdaStatus(
        { ...baseParams, function: 'mcp-jira', includeEnvValues: true },
        runner,
      ),
    );
    const env = body.environment as EnvReport;
    expect(env.variables).toEqual({
      DB_PASSWORD: REDACTED,
      JIRA_ASSIGNEE_EMAIL: 'someone@example.com',
      JIRA_CLIENT_SECRET: REDACTED,
      LOG_LEVEL: 'debug',
      ROLLBAR_ACCESS_TOKEN: REDACTED,
      STRIPE_SECRET_KEY: REDACTED,
    });
    expect(env.redactedNames).toEqual([
      'DB_PASSWORD',
      'JIRA_CLIENT_SECRET',
      'ROLLBAR_ACCESS_TOKEN',
      'STRIPE_SECRET_KEY',
    ]);
  });

  it('never leaks a secret value into the serialized payload', async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockResolvedValue(envConfigJson(SAMPLE_ENV));
    const result = await lambdaStatus(
      { ...baseParams, function: 'mcp-jira', includeEnvValues: true },
      runner,
    );
    const block = result.content[0];
    if (!block || block.type !== 'text') throw new Error('expected text block');
    for (const secret of [
      'super-secret-value',
      'tok-live-value',
      'hunter2',
      'sk_live_value',
    ]) {
      expect(block.text).not.toContain(secret);
    }
  });

  it('treats includeEnvValues as implying includeEnv', async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockResolvedValue(envConfigJson(SAMPLE_ENV));
    const { body } = unwrap(
      await lambdaStatus(
        {
          ...baseParams,
          function: 'mcp-jira',
          includeEnv: false,
          includeEnvValues: true,
        },
        runner,
      ),
    );
    expect((body.environment as EnvReport).variables).toBeDefined();
  });

  it('applies the flags per function in batch mode', async () => {
    const runner: CommandRunner = jest.fn((_cmd, args) => {
      const nameIdx = args.indexOf('--function-name');
      const full = args[nameIdx + 1];
      return Promise.resolve(
        JSON.stringify({
          ...JSON.parse(envConfigJson(SAMPLE_ENV)),
          FunctionName: full,
        }),
      );
    });

    const { body } = unwrap(
      await lambdaStatus(
        { ...baseParams, functions: ['mcp-jira', 'graphql'], includeEnv: true },
        runner,
      ),
    );

    const statuses = body.statuses as Record<
      string,
      { environment: EnvReport }
    >;
    for (const fn of ['mcp-jira', 'graphql']) {
      expect(statuses[fn].environment.variableNames).toEqual(
        Object.keys(SAMPLE_ENV).sort(),
      );
      expect(statuses[fn].environment.variables).toBeUndefined();
    }
  });
});

describe('lambdaStatus (nameContains)', () => {
  const listJson = (names: string[]) =>
    JSON.stringify(
      names.map((FunctionName) => ({
        FunctionName,
        Runtime: 'nodejs20.x',
        LastModified: '2026-01-01T00:00:00.000+0000',
        MemorySize: 512,
        Timeout: 30,
      })),
    );

  it('lists functions whose full name contains the substring, case-insensitively', async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockResolvedValue(
        listJson([
          'legacy-sports-dev-runner-android-scale-up',
          'legacy-sports-dev-graphql',
          'legacy-sports-dev-Runner-scale-down',
        ]),
      );
    const { body, isError } = unwrap(
      await lambdaStatus({ ...baseParams, nameContains: 'runner' }, runner),
    );
    expect(isError).toBe(false);
    expect(body.count).toBe(2);
    expect(body.truncated).toBe(false);
    const functions = body.functions as Array<{ functionName: string }>;
    expect(functions.map((f) => f.functionName)).toEqual([
      'legacy-sports-dev-runner-android-scale-up',
      'legacy-sports-dev-Runner-scale-down',
    ]);

    expect(runner).toHaveBeenCalledTimes(1);
    const args = jest.mocked(runner).mock.calls[0][1];
    expect(args).toContain('list-functions');
    expect(args).not.toContain('get-function-configuration');
  });

  it('returns an empty list when nothing matches', async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockResolvedValue(listJson(['legacy-sports-dev-graphql']));
    const { body } = unwrap(
      await lambdaStatus({ ...baseParams, nameContains: 'runner' }, runner),
    );
    expect(body.count).toBe(0);
    expect(body.functions).toEqual([]);
  });

  it(`caps matches at ${MAX_NAME_MATCHES} and reports truncated`, async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockResolvedValue(
        listJson(
          Array.from(
            { length: MAX_NAME_MATCHES + 3 },
            (_, i) => `legacy-sports-dev-fn-${String(i).padStart(3, '0')}`,
          ),
        ),
      );
    const { body } = unwrap(
      await lambdaStatus({ ...baseParams, nameContains: 'fn-' }, runner),
    );
    expect(body.count).toBe(MAX_NAME_MATCHES);
    expect(body.truncated).toBe(true);
  });

  it('rejects nameContains combined with function', async () => {
    const runner: CommandRunner = jest.fn();
    const { isError } = unwrap(
      await lambdaStatus(
        { ...baseParams, nameContains: 'runner', function: 'graphql' },
        runner,
      ),
    );
    expect(isError).toBe(true);
    expect(runner).not.toHaveBeenCalled();
  });

  it('returns isError with a remedy on SSO expiry', async () => {
    const runner: CommandRunner = jest
      .fn()
      .mockRejectedValue(new Error('sso session has expired'));
    const { body, isError } = unwrap(
      await lambdaStatus({ ...baseParams, nameContains: 'runner' }, runner),
    );
    expect(isError).toBe(true);
    expect(body.remedy).toMatch(/aws sso login/);
  });
});
