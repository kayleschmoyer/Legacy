import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  fetchMigrationFromRepo,
  gitBlobSha,
  resetGitHubTokenCache,
  validateMigrationRef,
} from './github-source.js';

const SECRET_NAME = 'dev/mcp-github-token';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  GetSecretValueCommand: jest.fn((input: { SecretId: string }) => input),
  SecretsManagerClient: jest.fn(() => ({
    send: jest.fn(() =>
      Promise.resolve({
        SecretString: JSON.stringify({
          app_id: '42',
          installation_id: '7',
          private_key: PEM,
        }),
      }),
    ),
  })),
}));

const PATH = 'lib/db-client/migrations/20261006_180000_backfill_x.ts';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Mock fetch: first call is the token exchange, second the contents read. */
function mockGitHub(
  contents: Response,
): jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>> {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(
      jsonResponse(201, {
        token: 'ghs_test',
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    )
    .mockResolvedValueOnce(contents);
}

function contentsBody(content: Buffer, sha = gitBlobSha(content)) {
  return {
    type: 'file',
    encoding: 'base64',
    size: content.length,
    sha,
    content: content.toString('base64'),
  };
}

describe('validateMigrationRef', () => {
  it('accepts a branch or sha ref to a migration file', () => {
    expect(validateMigrationRef({ branch: 'claude/x-1', path: PATH })).toEqual({
      name: '20261006_180000_backfill_x.ts',
      gitRef: 'claude/x-1',
    });
    expect(validateMigrationRef({ sha: 'abc1234', path: PATH }).gitRef).toBe(
      'abc1234',
    );
  });

  it.each([
    'lib/db-client/src/schema.ts',
    'lib/db-client/migrations/not-a-migration.ts',
    'lib/db-client/migrations/sub/20261006_180000_x.ts',
    'lib/db-client/migrations/../../../.env',
    'lib/db-client/migrations/20261006_180000_x..ts',
    '/lib/db-client/migrations/20261006_180000_x.ts',
    'lib/db-client/migrations/20261006_180000_x.js',
    'other/lib/db-client/migrations/20261006_180000_x.ts',
  ])('rejects path %s', (path) => {
    expect(() => validateMigrationRef({ branch: 'main', path })).toThrow(
      /is not allowed/,
    );
  });

  it('requires exactly one of branch / sha', () => {
    expect(() => validateMigrationRef({ path: PATH })).toThrow(/exactly one/);
    expect(() =>
      validateMigrationRef({ branch: 'main', sha: 'abc1234', path: PATH }),
    ).toThrow(/exactly one/);
  });

  it('rejects malformed branches and shas', () => {
    expect(() => validateMigrationRef({ branch: 'a..b', path: PATH })).toThrow(
      /Invalid branch/,
    );
    expect(() => validateMigrationRef({ branch: '-x', path: PATH })).toThrow(
      /Invalid branch/,
    );
    expect(() => validateMigrationRef({ sha: 'zzz', path: PATH })).toThrow(
      /Invalid commit sha/,
    );
  });
});

describe('gitBlobSha', () => {
  it('matches git hash-object', () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(gitBlobSha(Buffer.from('hello\n'))).toBe(
      'ce013625030ba8dba906f756967f9e9ca394464a',
    );
  });
});

describe('fetchMigrationFromRepo', () => {
  const originalSecret = process.env['GITHUB_TOKEN_SECRET_NAME'];

  beforeEach(() => {
    process.env['GITHUB_TOKEN_SECRET_NAME'] = SECRET_NAME;
    resetGitHubTokenCache();
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env['GITHUB_TOKEN_SECRET_NAME'];
    } else {
      process.env['GITHUB_TOKEN_SECRET_NAME'] = originalSecret;
    }
    jest.restoreAllMocks();
  });

  it('fetches a ~100 KB migration and reports its blob SHA + sha256', async () => {
    const source = Buffer.from(
      `export const up = async () => {};\n// ${'x'.repeat(100_000)}\n`,
    );
    const fetchMock = mockGitHub(jsonResponse(200, contentsBody(source)));

    const fetched = await fetchMigrationFromRepo({
      branch: 'claude/feature',
      path: PATH,
    });

    expect(fetched.name).toBe('20261006_180000_backfill_x.ts');
    expect(fetched.tsSource).toBe(source.toString('utf-8'));
    expect(fetched.source).toEqual({
      name: '20261006_180000_backfill_x.ts',
      repo: 'bkrupa/legacy-sports',
      path: PATH,
      ref: 'claude/feature',
      blobSha: gitBlobSha(source),
      sha256: createHash('sha256').update(source).digest('hex'),
      bytes: source.length,
    });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe(
      'https://api.github.com/app/installations/7/access_tokens',
    );
    expect(
      (tokenInit?.headers as Record<string, string>)['Authorization'],
    ).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);

    const [contentsUrl, contentsInit] = fetchMock.mock.calls[1];
    expect(contentsUrl).toBe(
      `https://api.github.com/repos/bkrupa/legacy-sports/contents/${PATH}?ref=claude%2Ffeature`,
    );
    expect(
      (contentsInit?.headers as Record<string, string>)['Authorization'],
    ).toBe('Bearer ghs_test');
  });

  it('reuses the cached installation token', async () => {
    const source = Buffer.from('export const up = async () => {};');
    const fetchMock = mockGitHub(jsonResponse(200, contentsBody(source)));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, contentsBody(source)));

    await fetchMigrationFromRepo({ sha: 'abc1234', path: PATH });
    await fetchMigrationFromRepo({ sha: 'abc1234', path: PATH });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects content whose hash does not match the reported blob SHA', async () => {
    const source = Buffer.from('export const up = async () => {};');
    mockGitHub(jsonResponse(200, contentsBody(source, 'f'.repeat(40))));

    await expect(
      fetchMigrationFromRepo({ branch: 'main', path: PATH }),
    ).rejects.toThrow(/Blob SHA mismatch/);
  });

  it('reports a missing file clearly', async () => {
    mockGitHub(jsonResponse(404, { message: 'Not Found' }));

    await expect(
      fetchMigrationFromRepo({ branch: 'gone', path: PATH }),
    ).rejects.toThrow(/not found at ref 'gone'/);
  });

  it('never calls GitHub for a disallowed path', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      fetchMigrationFromRepo({ branch: 'main', path: '.env' }),
    ).rejects.toThrow(/is not allowed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails clearly when the GitHub secret is not configured', async () => {
    delete process.env['GITHUB_TOKEN_SECRET_NAME'];

    await expect(
      fetchMigrationFromRepo({ branch: 'main', path: PATH }),
    ).rejects.toThrow(/GITHUB_TOKEN_SECRET_NAME is not configured/);
  });
});
