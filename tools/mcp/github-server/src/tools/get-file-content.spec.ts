jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
  getRepoRoot: jest.fn(),
  isLambda: jest.fn(),
}));

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getFileContent } from './get-file-content';

const { githubRest: mockGithubRest } = jest.requireMock<{
  githubRest: jest.Mock;
}>('../github-api');
const {
  getRepoOwnerName: mockGetRepoOwnerName,
  getRepoRoot: mockGetRepoRoot,
  isLambda: mockIsLambda,
} = jest.requireMock<{
  getRepoOwnerName: jest.Mock;
  getRepoRoot: jest.Mock;
  isLambda: jest.Mock;
}>('../auth');

function parse(text: string) {
  return JSON.parse(text) as Record<string, unknown>;
}

let scratchDir: string;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRepoOwnerName.mockResolvedValue({
    owner: 'bkrupa',
    name: 'legacy-sports',
  });
  mockGetRepoRoot.mockReturnValue('/repo');
  mockIsLambda.mockReturnValue(false);
  scratchDir = mkdtempSync(join(tmpdir(), 'get-file-content-spec-'));
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
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

  describe('outputPath', () => {
    it('writes the decoded content to disk and returns metadata only, no content', async () => {
      mockGithubRest.mockResolvedValueOnce({
        path: 'terraform/main/x.tf',
        sha: 'blob123',
        size: 11,
        content: Buffer.from('hello world').toString('base64'),
        encoding: 'base64',
      });

      const outputPath = join(scratchDir, 'x.tf');
      const result = await getFileContent({
        path: 'terraform/main/x.tf',
        ref: 'origin/some-branch',
        outputPath,
      });

      expect(result.isError).toBeFalsy();
      const body = parse((result.content[0] as { text: string }).text);
      expect(body).toEqual({
        path: 'terraform/main/x.tf',
        ref: 'origin/some-branch',
        sha: 'blob123',
        outputPath,
        bytesWritten: 11,
      });
      expect(body['content']).toBeUndefined();
      expect(readFileSync(outputPath, 'utf-8')).toBe('hello world');
    });

    it('creates parent directories that do not yet exist', async () => {
      mockGithubRest.mockResolvedValueOnce({
        path: 'a/b.txt',
        sha: 'sha1',
        size: 1,
        content: Buffer.from('x').toString('base64'),
        encoding: 'base64',
      });

      const outputPath = join(scratchDir, 'nested', 'deep', 'b.txt');
      const result = await getFileContent({ path: 'a/b.txt', outputPath });

      expect(result.isError).toBeFalsy();
      expect(existsSync(outputPath)).toBe(true);
    });

    it('rejects a relative outputPath', async () => {
      const result = await getFileContent({
        path: 'a.txt',
        outputPath: 'relative/path.txt',
      });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('must be an absolute path');
      expect(mockGithubRest).not.toHaveBeenCalled();
    });

    it('rejects an outputPath outside the repo root and the OS temp dir', async () => {
      mockGetRepoRoot.mockReturnValue('/repo');
      const result = await getFileContent({
        path: 'a.txt',
        outputPath: '/etc/passwd',
      });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('outside the allowed write targets');
      expect(mockGithubRest).not.toHaveBeenCalled();
    });

    it('allows an outputPath under the repo root', async () => {
      mockGithubRest.mockResolvedValueOnce({
        path: 'a.txt',
        sha: 'sha2',
        size: 1,
        content: Buffer.from('y').toString('base64'),
        encoding: 'base64',
      });
      mockGetRepoRoot.mockReturnValue(scratchDir);

      const outputPath = join(scratchDir, 'a.txt');
      const result = await getFileContent({ path: 'a.txt', outputPath });
      expect(result.isError).toBeFalsy();
    });

    it('in Lambda mode, rejects an outputPath under the repo root (no local checkout)', async () => {
      mockIsLambda.mockReturnValue(true);
      mockGetRepoRoot.mockReturnValue('/repo');

      const result = await getFileContent({
        path: 'a.txt',
        outputPath: '/repo/a.txt',
      });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('outside the allowed write targets');
      expect(mockGithubRest).not.toHaveBeenCalled();
    });

    it('in Lambda mode, allows an outputPath under the OS temp dir', async () => {
      mockIsLambda.mockReturnValue(true);
      mockGithubRest.mockResolvedValueOnce({
        path: 'a.txt',
        sha: 'sha3',
        size: 1,
        content: Buffer.from('z').toString('base64'),
        encoding: 'base64',
      });

      const outputPath = join(scratchDir, 'a.txt');
      const result = await getFileContent({ path: 'a.txt', outputPath });
      expect(result.isError).toBeFalsy();
    });

    it('returns a descriptive error instead of throwing when the write fails', async () => {
      mockGithubRest.mockResolvedValueOnce({
        path: 'a.txt',
        sha: 'sha4',
        size: 1,
        content: Buffer.from('x').toString('base64'),
        encoding: 'base64',
      });

      // A regular file blocking the parent directory path forces mkdirSync
      // to fail with ENOTDIR, exercising the write's error branch.
      const blockingFile = join(scratchDir, 'blocked');
      writeFileSync(blockingFile, '');
      const outputPath = join(blockingFile, 'nested', 'a.txt');

      const result = await getFileContent({ path: 'a.txt', outputPath });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Failed to write file to');
      expect(text).toContain(outputPath);
    });
  });
});
