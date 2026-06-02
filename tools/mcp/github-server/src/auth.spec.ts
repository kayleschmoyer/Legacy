import { generateKeyPairSync } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

// getRepoRoot lives in ./repo-root and uses import.meta.url, which cannot be
// compiled under the CommonJS spec tsconfig. Mock it so the real module is
// never loaded (mirrors how create-pr.spec mocks ../auth).
jest.mock('./repo-root', () => ({
  getRepoRoot: jest.fn(() => '/tmp/repo-root-that-does-not-exist'),
}));

// auth.ts logs cache-write failures via LOGGER. Mock the server logging module
// so the spec doesn't pull in real logging transports and can assert the warning.
jest.mock('@legacy-sports/logging/server', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// The token cache writes go through node:fs/promises. Mock it so we can both
// simulate an unwritable cache dir (the LS-5982 Lambda failure) and assert that
// a write failure does not break token provisioning.
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  chmod: jest.fn(),
  readFile: jest.fn(),
  unlink: jest.fn(),
}));

type MockedFsPromises = {
  mkdir: jest.Mock;
  writeFile: jest.Mock;
  chmod: jest.Mock;
  readFile: jest.Mock;
  unlink: jest.Mock;
};

// jest.resetModules() (in beforeEach) re-runs the mock factory on the next
// import, creating fresh jest.fn() instances. Acquire the mock *after* the
// reset so the handle matches the instances the imported module uses.
function freshFsPromisesMock(): MockedFsPromises {
  return jest.requireMock('node:fs/promises') as MockedFsPromises;
}

const ENV_KEYS = [
  'AWS_LAMBDA_FUNCTION_NAME',
  'AGENT_AUTHOR_APP_PRIVATE_KEY',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GITHUB_APP_ID',
  'GITHUB_INSTALLATION_ID',
] as const;

describe('github-server auth token cache (LS-5982)', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const savedFetch = global.fetch;

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    jest.clearAllMocks();
    jest.resetModules();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    global.fetch = savedFetch;
  });

  describe('getTokenCacheDir', () => {
    it('anchors the token cache under the temp dir when running in Lambda', async () => {
      process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'mcp-github';
      const { getTokenCacheDir, getTokenCachePath } = await import('./auth');

      const expectedDir = join(tmpdir(), '.config', 'legacy-sports-github');
      expect(getTokenCacheDir()).toBe(expectedDir);
      expect(getTokenCachePath()).toBe(join(expectedDir, 'token.json'));
    });

    it('anchors the token cache under the home dir outside Lambda', async () => {
      delete process.env['AWS_LAMBDA_FUNCTION_NAME'];
      const { getTokenCacheDir } = await import('./auth');

      expect(getTokenCacheDir()).toBe(
        join(homedir(), '.config', 'legacy-sports-github'),
      );
    });
  });

  describe('getToken with an unwritable cache dir', () => {
    it('returns the freshly-minted GitHub App token even when the cache write fails', async () => {
      // Reproduce the Lambda sandbox: $HOME is not writable, so mkdir throws
      // ENOENT. Before the fix this propagated out as a phantom "token exchange
      // failed" even though the installation-token exchange itself succeeded.
      process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'mcp-github';
      delete process.env['GH_TOKEN'];
      delete process.env['GITHUB_TOKEN'];

      const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'] = privateKey
        .export({ type: 'pkcs1', format: 'pem' })
        .toString();

      const fsp = freshFsPromisesMock();
      // No cached token file on disk.
      fsp.readFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      // The cache dir is unwritable — mkdir fails exactly as it does in Lambda.
      fsp.mkdir.mockRejectedValue(
        Object.assign(
          new Error(
            "ENOENT: no such file or directory, mkdir '/home/sbx_user1051'",
          ),
          { code: 'ENOENT' },
        ),
      );

      // The installation-token exchange succeeds.
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          token: 'ghs_minted_token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      })) as unknown as typeof fetch;

      const { LOGGER } = jest.requireMock('@legacy-sports/logging/server') as {
        LOGGER: { warn: jest.Mock };
      };

      const { getToken } = await import('./auth');
      const token = await getToken();

      expect(token).toBe('ghs_minted_token');
      // The write was attempted (and failed) but did not abort provisioning.
      expect(fsp.mkdir).toHaveBeenCalled();
      // The failure is surfaced as a non-fatal LOGGER.warn, not a thrown error.
      expect(LOGGER.warn).toHaveBeenCalledWith(
        expect.stringContaining("mkdir '/home/sbx_user1051'"),
      );
    });
  });
});
