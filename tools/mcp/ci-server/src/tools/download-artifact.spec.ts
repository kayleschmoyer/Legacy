import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
  githubGetArrayBuffer: jest.fn(),
}));

import { downloadArtifact } from './download-artifact.js';
import * as githubApi from '../github-api.js';

const mockGithubGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string, params?: Record<string, string>) => Promise<unknown>
>;
const mockGithubGetArrayBuffer =
  githubApi.githubGetArrayBuffer as jest.MockedFunction<
    typeof githubApi.githubGetArrayBuffer
  >;

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

/** Build a STORED (uncompressed) ZIP local file entry with real header sizes. */
function buildStoredZipEntry(name: string, content: Buffer): Buffer {
  const nameBuf = Buffer.from(name, 'utf-8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // local file header signature
  header.writeUInt16LE(20, 4); // version needed to extract
  header.writeUInt16LE(0, 6); // general purpose bit flag (no data descriptor)
  header.writeUInt16LE(0, 8); // compression method: stored
  header.writeUInt32LE(0, 14); // crc-32 (unchecked)
  header.writeUInt32LE(content.length, 18); // compressed size
  header.writeUInt32LE(content.length, 22); // uncompressed size
  header.writeUInt16LE(nameBuf.length, 26); // file name length
  header.writeUInt16LE(0, 28); // extra field length
  return Buffer.concat([header, nameBuf, content]);
}

function buildZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  return Buffer.concat(
    entries.map((e) => buildStoredZipEntry(e.name, e.content)),
  );
}

describe('downloadArtifact', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
    mockGithubGetArrayBuffer.mockReset();
  });

  it('downloads a named artifact and returns its content inline', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 2,
      artifacts: [
        {
          id: 1,
          name: 'coverage-audit-findings',
          size_in_bytes: 42,
          expired: false,
        },
        { id: 2, name: 'other-artifact', size_in_bytes: 10, expired: false },
      ],
    });
    const zip = buildZip([
      {
        name: 'coverage-audit.json',
        content: Buffer.from('{"findings":[]}', 'utf-8'),
      },
    ]);
    mockGithubGetArrayBuffer.mockResolvedValue(bufferToArrayBuffer(zip));

    const result = await downloadArtifact({
      runId: 32674916933,
      artifactName: 'coverage-audit-findings',
    });

    expect(mockGithubGet).toHaveBeenCalledWith(
      '/actions/runs/32674916933/artifacts',
      { per_page: '100', page: '1' },
    );
    expect(mockGithubGetArrayBuffer).toHaveBeenCalledWith(
      '/actions/artifacts/1/zip',
    );
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0].text) as {
      artifactId: number;
      files: Array<{ name: string; encoding: string; content: string }>;
    };
    expect(payload.artifactId).toBe(1);
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0].name).toBe('coverage-audit.json');
    expect(payload.files[0].encoding).toBe('utf-8');
    expect(payload.files[0].content).toBe('{"findings":[]}');
  });

  it('falls back to a case-insensitive name match', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 1,
      artifacts: [
        { id: 5, name: 'Coverage-Audit', size_in_bytes: 4, expired: false },
      ],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(
      bufferToArrayBuffer(
        buildZip([{ name: 'f.txt', content: Buffer.from('hi') }]),
      ),
    );

    const result = await downloadArtifact({
      runId: 1,
      artifactName: 'coverage-audit',
    });

    expect(result.isError).toBeUndefined();
    expect(mockGithubGetArrayBuffer).toHaveBeenCalledWith(
      '/actions/artifacts/5/zip',
    );
  });

  it('returns a helpful error listing available artifacts when the name is not found', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 2,
      artifacts: [
        { id: 1, name: 'foo', size_in_bytes: 1, expired: false },
        { id: 2, name: 'bar', size_in_bytes: 1, expired: false },
      ],
    });

    const result = await downloadArtifact({
      runId: 1,
      artifactName: 'missing',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('foo');
    expect(result.content[0].text).toContain('bar');
    expect(mockGithubGetArrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects an expired artifact without attempting the download', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 1,
      artifacts: [{ id: 9, name: 'stale', size_in_bytes: 1, expired: true }],
    });

    const result = await downloadArtifact({ runId: 1, artifactName: 'stale' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/expired/i);
    expect(mockGithubGetArrayBuffer).not.toHaveBeenCalled();
  });

  it('follows pagination to find an artifact past the first 100-item page', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: `artifact-${i + 1}`,
      size_in_bytes: 1,
      expired: false,
    }));
    const targetArtifact = {
      id: 101,
      name: 'page-two-artifact',
      size_in_bytes: 4,
      expired: false,
    };
    mockGithubGet.mockImplementation((_path, params) => {
      if (params?.page === '2') {
        return Promise.resolve({
          total_count: 101,
          artifacts: [targetArtifact],
        });
      }
      return Promise.resolve({ total_count: 101, artifacts: page1 });
    });
    mockGithubGetArrayBuffer.mockResolvedValue(
      bufferToArrayBuffer(
        buildZip([{ name: 'f.txt', content: Buffer.from('hi') }]),
      ),
    );

    const result = await downloadArtifact({
      runId: 1,
      artifactName: 'page-two-artifact',
    });

    expect(result.isError).toBeUndefined();
    expect(mockGithubGet).toHaveBeenCalledWith('/actions/runs/1/artifacts', {
      per_page: '100',
      page: '2',
    });
    expect(mockGithubGetArrayBuffer).toHaveBeenCalledWith(
      '/actions/artifacts/101/zip',
    );
  });

  it('surfaces a list-artifacts failure without throwing', async () => {
    mockGithubGet.mockRejectedValue(new Error('GitHub API 404: Not Found'));

    const result = await downloadArtifact({ runId: 1, artifactName: 'x' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to list artifacts');
  });

  it('extracts files to outDir when provided, instead of returning content inline', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 1,
      artifacts: [{ id: 3, name: 'report', size_in_bytes: 4, expired: false }],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(
      bufferToArrayBuffer(
        buildZip([
          { name: 'nested/summary.json', content: Buffer.from('{"ok":true}') },
        ]),
      ),
    );

    const tmpDir = await mkdtemp(path.join(tmpdir(), 'ci-artifact-test-'));
    try {
      const result = await downloadArtifact({
        runId: 1,
        artifactName: 'report',
        outDir: tmpDir,
      });

      expect(result.isError).toBeUndefined();
      const payload = JSON.parse(result.content[0].text) as {
        files: Array<{ name: string; path: string; bytes: number }>;
      };
      expect(payload.files).toHaveLength(1);
      expect(payload.files[0].name).toBe('nested/summary.json');
      const written = await readFile(payload.files[0].path, 'utf-8');
      expect(written).toBe('{"ok":true}');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips zip entries whose name would escape outDir (zip-slip guard)', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 1,
      artifacts: [{ id: 4, name: 'evil', size_in_bytes: 4, expired: false }],
    });
    mockGithubGetArrayBuffer.mockResolvedValue(
      bufferToArrayBuffer(
        buildZip([
          {
            name: '../../etc/passwd',
            content: Buffer.from('should not be written'),
          },
        ]),
      ),
    );

    const tmpDir = await mkdtemp(path.join(tmpdir(), 'ci-artifact-test-'));
    try {
      const result = await downloadArtifact({
        runId: 1,
        artifactName: 'evil',
        outDir: tmpDir,
      });

      expect(result.isError).toBeUndefined();
      const payload = JSON.parse(result.content[0].text) as {
        files: unknown[];
        skippedUnsafe?: string[];
      };
      expect(payload.files).toHaveLength(0);
      expect(payload.skippedUnsafe).toEqual(['../../etc/passwd']);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
