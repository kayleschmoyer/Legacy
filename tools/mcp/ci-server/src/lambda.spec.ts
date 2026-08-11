import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type SecretIdCommand = { SecretId: string };

const mockSend =
  jest.fn<(cmd: SecretIdCommand) => Promise<{ SecretString: string }>>();
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  GetSecretValueCommand: jest.fn((input: { SecretId: string }) => input),
}));

// github-api.ts (pulled in transitively via ./index.js -> playwright-report.js)
// no longer uses import.meta.url directly (LS-8322 extracted it into
// ./repo-root.ts), but repo-root.ts itself still does and cannot compile
// under the CommonJS spec tsconfig — mock it the same way the sibling
// github-server specs do (LS-5982 pattern).
jest.mock('./repo-root', () => ({
  getRepoRoot: jest.fn(() => '/tmp/repo-root-that-does-not-exist'),
}));

const ENV_KEYS = [
  'GITHUB_TOKEN_SECRET_NAME',
  'PREVIEW_APP_TOKEN_SECRET_NAME',
  'AGENT_AUTHOR_APP_PRIVATE_KEY',
  'GITHUB_APP_ID',
  'GITHUB_INSTALLATION_ID',
  'PREVIEW_APP_PRIVATE_KEY',
  'PREVIEW_APP_ID',
] as const;

/**
 * Regression coverage for LS-8322: the hosted mcp-ci Lambda's ensureCredentials()
 * must fetch a second secret (PREVIEW_APP_TOKEN_SECRET_NAME) and set
 * PREVIEW_APP_PRIVATE_KEY / PREVIEW_APP_ID so getDeploysToken() (github-api.ts)
 * takes the scoped-token path instead of silently falling back to a token that
 * 404s on every private bkrupa/legacy-sports-deploys read.
 */
describe('lambda ensureCredentials (LS-8322)', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
    mockSend.mockReset();
    jest.resetModules();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('sets only the Agent Author credentials when PREVIEW_APP_TOKEN_SECRET_NAME is unset (unchanged existing behavior)', async () => {
    process.env['GITHUB_TOKEN_SECRET_NAME'] = 'dev/mcp-github-token';
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({
        app_id: '3158619',
        installation_id: '118260223',
        private_key: 'AGENT_AUTHOR_PEM',
      }),
    });

    const { ensureCredentials } = await import('./lambda.js');
    await ensureCredentials();

    expect(process.env['AGENT_AUTHOR_APP_PRIVATE_KEY']).toBe(
      'AGENT_AUTHOR_PEM',
    );
    expect(process.env['GITHUB_APP_ID']).toBe('3158619');
    expect(process.env['GITHUB_INSTALLATION_ID']).toBe('118260223');
    expect(process.env['PREVIEW_APP_PRIVATE_KEY']).toBeUndefined();
    expect(process.env['PREVIEW_APP_ID']).toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('sets both credential sets when PREVIEW_APP_TOKEN_SECRET_NAME is configured', async () => {
    process.env['GITHUB_TOKEN_SECRET_NAME'] = 'dev/mcp-github-token';
    process.env['PREVIEW_APP_TOKEN_SECRET_NAME'] = 'dev/mcp-preview-app-token';
    mockSend.mockImplementation((cmd: SecretIdCommand) => {
      if (cmd.SecretId === 'dev/mcp-github-token') {
        return Promise.resolve({
          SecretString: JSON.stringify({
            app_id: '3158619',
            installation_id: '118260223',
            private_key: 'AGENT_AUTHOR_PEM',
          }),
        });
      }
      if (cmd.SecretId === 'dev/mcp-preview-app-token') {
        return Promise.resolve({
          SecretString: JSON.stringify({
            app_id: 'PREVIEW_APP_ID_VALUE',
            private_key: 'PREVIEW_APP_PEM',
          }),
        });
      }
      throw new Error(`Unexpected SecretId: ${cmd.SecretId}`);
    });

    const { ensureCredentials } = await import('./lambda.js');
    await ensureCredentials();

    expect(process.env['AGENT_AUTHOR_APP_PRIVATE_KEY']).toBe(
      'AGENT_AUTHOR_PEM',
    );
    expect(process.env['PREVIEW_APP_PRIVATE_KEY']).toBe('PREVIEW_APP_PEM');
    expect(process.env['PREVIEW_APP_ID']).toBe('PREVIEW_APP_ID_VALUE');
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('does not throw and leaves PREVIEW_APP_* unset when the preview secret fetch fails (non-fatal)', async () => {
    process.env['GITHUB_TOKEN_SECRET_NAME'] = 'dev/mcp-github-token';
    process.env['PREVIEW_APP_TOKEN_SECRET_NAME'] = 'dev/mcp-preview-app-token';
    mockSend.mockImplementation((cmd: SecretIdCommand) => {
      if (cmd.SecretId === 'dev/mcp-github-token') {
        return Promise.resolve({
          SecretString: JSON.stringify({ private_key: 'AGENT_AUTHOR_PEM' }),
        });
      }
      throw new Error('AccessDeniedException');
    });

    const { ensureCredentials } = await import('./lambda.js');
    await expect(ensureCredentials()).resolves.toBeUndefined();

    expect(process.env['AGENT_AUTHOR_APP_PRIVATE_KEY']).toBe(
      'AGENT_AUTHOR_PEM',
    );
    expect(process.env['PREVIEW_APP_PRIVATE_KEY']).toBeUndefined();
    expect(process.env['PREVIEW_APP_ID']).toBeUndefined();
  });

  it('does not throw and leaves PREVIEW_APP_* unset when the preview secret is missing required fields', async () => {
    process.env['GITHUB_TOKEN_SECRET_NAME'] = 'dev/mcp-github-token';
    process.env['PREVIEW_APP_TOKEN_SECRET_NAME'] = 'dev/mcp-preview-app-token';
    mockSend.mockImplementation((cmd: SecretIdCommand) => {
      if (cmd.SecretId === 'dev/mcp-github-token') {
        return Promise.resolve({
          SecretString: JSON.stringify({ private_key: 'AGENT_AUTHOR_PEM' }),
        });
      }
      // Missing private_key
      return Promise.resolve({
        SecretString: JSON.stringify({ app_id: 'incomplete' }),
      });
    });

    const { ensureCredentials } = await import('./lambda.js');
    await expect(ensureCredentials()).resolves.toBeUndefined();

    expect(process.env['PREVIEW_APP_PRIVATE_KEY']).toBeUndefined();
    expect(process.env['PREVIEW_APP_ID']).toBeUndefined();
  });

  it('does not re-fetch secrets once credentials are initialized (cold-start caching)', async () => {
    process.env['GITHUB_TOKEN_SECRET_NAME'] = 'dev/mcp-github-token';
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({ private_key: 'AGENT_AUTHOR_PEM' }),
    });

    const { ensureCredentials } = await import('./lambda.js');
    await ensureCredentials();
    await ensureCredentials();

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('still throws when the required GITHUB_TOKEN_SECRET_NAME secret is unset (unchanged existing behavior)', async () => {
    delete process.env['GITHUB_TOKEN_SECRET_NAME'];

    const { ensureCredentials } = await import('./lambda.js');

    await expect(ensureCredentials()).rejects.toThrow(
      'GITHUB_TOKEN_SECRET_NAME not configured',
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});
