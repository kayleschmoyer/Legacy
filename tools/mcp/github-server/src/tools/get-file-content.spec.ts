jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

import { getFileContent } from './get-file-content';

const { githubRest: mockGithubRest } = jest.requireMock('../github-api') as {
  githubRest: jest.Mock;
};
const { getRepoOwnerName: mockGetRepoOwnerName } = jest.requireMock(
  '../auth',
) as { getRepoOwnerName: jest.Mock };

function parse(text: string) {
  return JSON.parse(text) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRepoOwnerName.mockResolvedValue({
    owner: 'bkrupa',
    name: 'legacy-sports',
  });
});

describe('getFileContent', () => {
  it('returns a clear directory error when the path resolves to a directory', async () => {
    mockGithubRest.mockResolvedValueOnce([
      { path: '.github/workflows/ci.yml', type: 'file' },
      { path: '.github/workflows/deploy.yml', type: 'file' },
    ]);

    const result = await getFileContent({ path: '.github/workflows' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toBe(
      "Path '.github/workflows' is a directory. Use Glob to list files or specify an exact file path.",
    );
    expect(text).not.toContain('Unsupported encoding');
  });

  it('returns file content for a normal base64-encoded file', async () => {
    mockGithubRest.mockResolvedValueOnce({
      path: 'README.md',
      sha: 'abc123',
      size: 12,
      content: Buffer.from('hello world').toString('base64'),
      encoding: 'base64',
    });

    const result = await getFileContent({ path: 'README.md' });
    expect(result.isError).toBeFalsy();
    const body = parse((result.content[0] as { text: string }).text);
    expect(body).toEqual({
      path: 'README.md',
      ref: 'main',
      sha: 'abc123',
      content: 'hello world',
    });
  });

  it('preserves the existing unsupported-encoding error for a non-base64 single-file response', async () => {
    mockGithubRest.mockResolvedValueOnce({
      path: 'link',
      sha: 'def456',
      size: 0,
      content: '',
      encoding: 'none',
    });

    const result = await getFileContent({ path: 'link' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toBe('Unsupported encoding "none" for link');
  });

  it('preserves the existing outer error handling when the REST call throws', async () => {
    mockGithubRest.mockRejectedValueOnce(new Error('boom'));

    const result = await getFileContent({ path: 'missing.ts' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('boom');
    expect(text).toContain('missing.ts');
  });
});
