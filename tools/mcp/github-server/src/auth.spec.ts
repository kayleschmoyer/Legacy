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
  'GITHUB_REPO_OWNER',
  'GITHUB_REPO_NAME',
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

  describe('getLastTokenResolutionFailureReason (LS-5098)', () => {
    it('returns null before any tryResolveToken call', async () => {
      const { getLastTokenResolutionFailureReason } = await import('./auth');
      expect(getLastTokenResolutionFailureReason()).toBeNull();
    });

    it('returns null when tryResolveToken succeeds via GitHub App', async () => {
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
      fsp.readFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      fsp.mkdir.mockResolvedValue(undefined);
      fsp.writeFile.mockResolvedValue(undefined);
      fsp.chmod.mockResolvedValue(undefined);

      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          token: 'ghs_minted_token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      })) as unknown as typeof fetch;

      const { tryResolveToken, getLastTokenResolutionFailureReason } =
        await import('./auth');
      const result = await tryResolveToken();

      expect(result).not.toBeNull();
      expect(getLastTokenResolutionFailureReason()).toBeNull();
    });

    it('captures the exchange error when GitHub App token exchange fails', async () => {
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
      fsp.readFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      // The installation-token exchange fails with a 401.
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => '{"message":"Bad credentials"}',
      })) as unknown as typeof fetch;

      const { tryResolveToken, getLastTokenResolutionFailureReason } =
        await import('./auth');
      const result = await tryResolveToken();

      expect(result).toBeNull();
      const reason = getLastTokenResolutionFailureReason();
      expect(reason).not.toBeNull();
      expect(reason).toContain('401');
    });

    it('returns null (not the exchange error) when AGENT_AUTHOR_APP_PRIVATE_KEY is unset', async () => {
      process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'mcp-github';
      delete process.env['GH_TOKEN'];
      delete process.env['GITHUB_TOKEN'];
      delete process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'];

      const fsp = freshFsPromisesMock();
      fsp.readFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      global.fetch = jest.fn() as unknown as typeof fetch;

      const { tryResolveToken, getLastTokenResolutionFailureReason } =
        await import('./auth');
      const result = await tryResolveToken();

      expect(result).toBeNull();
      // No exchange was attempted — reason is null; github_auth_status uses the
      // "no credentials configured" Lambda fallback in this case.
      expect(getLastTokenResolutionFailureReason()).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('resets the reason on each new tryResolveToken call', async () => {
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
      fsp.readFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      fsp.mkdir.mockResolvedValue(undefined);
      fsp.writeFile.mockResolvedValue(undefined);
      fsp.chmod.mockResolvedValue(undefined);

      const { tryResolveToken, getLastTokenResolutionFailureReason } =
        await import('./auth');

      // First call — exchange fails.
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })) as unknown as typeof fetch;
      await tryResolveToken();
      expect(getLastTokenResolutionFailureReason()).not.toBeNull();

      // Second call — exchange succeeds; reason should be reset.
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          token: 'ghs_second_token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      })) as unknown as typeof fetch;
      await tryResolveToken();
      expect(getLastTokenResolutionFailureReason()).toBeNull();
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

  describe('getAuthorToken (LS-8333 — PR-authoring must never silently use a human token)', () => {
    function noCacheFile() {
      const fsp = freshFsPromisesMock();
      fsp.readFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      fsp.mkdir.mockResolvedValue(undefined);
      fsp.writeFile.mockResolvedValue(undefined);
      fsp.chmod.mockResolvedValue(undefined);
      return fsp;
    }

    it('mints the GitHub App token directly and never touches a co-configured personal token', async () => {
      // Simulates the common local/Lambda setup: AGENT_AUTHOR_APP_PRIVATE_KEY is
      // configured (as recommended), but GH_TOKEN also happens to be set to a
      // human's personal credential. Before the fix, getToken()'s generic
      // resolution order (env before github-app) would have picked the human
      // token; getAuthorToken must prefer minting the bot's own token directly
      // and never even attempt to resolve/validate GH_TOKEN.
      process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'mcp-github';
      process.env['GH_TOKEN'] = 'human_personal_pat';
      delete process.env['GITHUB_TOKEN'];

      const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'] = privateKey
        .export({ type: 'pkcs1', format: 'pem' })
        .toString();

      noCacheFile();

      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          token: 'ghs_minted_bot_token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      })) as unknown as typeof fetch;

      const { getAuthorToken } = await import('./auth');
      const token = await getAuthorToken();

      expect(token).toBe('ghs_minted_bot_token');
      // Only the installation-token exchange ran — GH_TOKEN was never
      // resolved or validated against GET /user.
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('falls back to a resolved token that verifies as a GitHub App bot identity when no private key is configured', async () => {
      // Simulates Copilot Coding Agent: AGENT_AUTHOR_APP_PRIVATE_KEY is never
      // set on the MCP server process (only consumed by the Actions step that
      // mints the token); the Agent Author app's own installation token is
      // exported as GH_TOKEN instead. getAuthorToken must accept it once its
      // identity is verified as a bot login.
      process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'mcp-github';
      process.env['GH_TOKEN'] = 'ghs_copilot_minted_token';
      delete process.env['GITHUB_TOKEN'];
      delete process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'];
      process.env['GITHUB_REPO_OWNER'] = 'bkrupa';
      process.env['GITHUB_REPO_NAME'] = 'legacy-sports';

      noCacheFile();

      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({ login: 'legacy-sports-code-bot[bot]' }),
      })) as unknown as typeof fetch;

      const { getAuthorToken } = await import('./auth');
      const token = await getAuthorToken();

      expect(token).toBe('ghs_copilot_minted_token');
    });

    it('throws instead of silently authoring as a human when only a personal token resolves (PR #5906)', async () => {
      process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'mcp-github';
      process.env['GH_TOKEN'] = 'human_personal_pat';
      delete process.env['GITHUB_TOKEN'];
      delete process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'];
      process.env['GITHUB_REPO_OWNER'] = 'bkrupa';
      process.env['GITHUB_REPO_NAME'] = 'legacy-sports';

      noCacheFile();

      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({ login: 'bkrupa' }),
      })) as unknown as typeof fetch;

      const { getAuthorToken } = await import('./auth');

      await expect(getAuthorToken()).rejects.toThrow(
        /legacy-sports-code-bot.*"bkrupa"/s,
      );
    });

    it('throws when no token can be resolved at all', async () => {
      process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'mcp-github';
      delete process.env['GH_TOKEN'];
      delete process.env['GITHUB_TOKEN'];
      delete process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'];

      noCacheFile();
      global.fetch = jest.fn() as unknown as typeof fetch;

      const { getAuthorToken } = await import('./auth');

      await expect(getAuthorToken()).rejects.toThrow(
        /Could not provision a GitHub token for PR authorship/,
      );
    });
  });
});
