import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// Stub github-api (import.meta not compatible with ts-jest CommonJS target).
jest.mock('../github-api.js', () => ({
  buildHeaders: jest.fn(),
  getToken: jest.fn(),
  githubGet: jest.fn(),
}));

// Stub playwright-report so GH Pages fetches never fire in S3-mode tests.
jest.mock('../playwright-report.js', () => ({
  fetchPlaywrightReport: jest.fn(),
  fetchPlaywrightSummary: jest.fn(),
  renderReportAsMarkdown: jest.fn(),
  reportUrlFor: jest.fn((name: string) => `https://example.com/${name}/`),
  fullTitle: jest.fn(),
}));

// Stub s3-artifacts so we control S3 behaviour without real AWS calls.
jest.mock('../s3-artifacts.js', () => ({
  resolveRunSha: jest.fn(),
  listPlaywrightS3Artifacts: jest.fn(),
}));

import { getPlaywrightTestResult } from './get-playwright-test-result.js';
import * as s3Artifacts from '../s3-artifacts.js';

const mockResolveRunSha = s3Artifacts.resolveRunSha as jest.MockedFunction<
  typeof s3Artifacts.resolveRunSha
>;
const mockListArtifacts =
  s3Artifacts.listPlaywrightS3Artifacts as jest.MockedFunction<
    typeof s3Artifacts.listPlaywrightS3Artifacts
  >;

const SHA = 'abc123def456';
const RUN_ID = '28115361551';
const PREFIX = `s3://legacy-sports-dev-ci-artifacts/ci-artifacts/${SHA}/playwright-blobs/`;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getPlaywrightTestResult — source=s3', () => {
  it('returns presigned URLs for found blob artifacts', async () => {
    mockResolveRunSha.mockResolvedValue(SHA);
    mockListArtifacts.mockResolvedValue({
      sha: SHA,
      s3Prefix: PREFIX,
      artifacts: [
        {
          key: `ci-artifacts/${SHA}/playwright-blobs/0/report-abc.zip`,
          presignedUrl: 'https://s3.example.com/signed-url-1',
          sizeBytes: 1024,
          lastModified: '2026-06-28T00:00:00.000Z',
        },
        {
          key: `ci-artifacts/${SHA}/playwright-blobs/1/report-def.zip`,
          presignedUrl: 'https://s3.example.com/signed-url-2',
          sizeBytes: 2048,
          lastModified: '2026-06-28T00:01:00.000Z',
        },
      ],
      empty: false,
    });

    const result = await getPlaywrightTestResult({
      reportName: RUN_ID,
      testTitle: 'some test',
      source: 's3',
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.source).toBe('s3');
    expect(payload.sha).toBe(SHA);
    expect(payload.runId).toBe(parseInt(RUN_ID, 10));
    expect(payload.artifactCount).toBe(2);
    expect(payload.empty).toBe(false);
    expect(payload.artifacts).toHaveLength(2);
    expect(payload.artifacts[0].presignedUrl).toBe(
      'https://s3.example.com/signed-url-1',
    );
    expect(payload.ghPagesReportName).toBe(`nightly-${RUN_ID}`);
    expect(mockResolveRunSha).toHaveBeenCalledWith(parseInt(RUN_ID, 10));
    expect(mockListArtifacts).toHaveBeenCalledWith(SHA);
  });

  it('returns empty=true with a hint when no artifacts found', async () => {
    mockResolveRunSha.mockResolvedValue(SHA);
    mockListArtifacts.mockResolvedValue({
      sha: SHA,
      s3Prefix: PREFIX,
      artifacts: [],
      empty: true,
    });

    const result = await getPlaywrightTestResult({
      reportName: RUN_ID,
      testTitle: 'any test',
      source: 's3',
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.empty).toBe(true);
    expect(payload.emptyNote).toMatch(/expire after 3 days/);
  });

  it('returns an error when reportName is not a numeric run ID', async () => {
    const result = await getPlaywrightTestResult({
      reportName: 'pr-1234',
      testTitle: 'any test',
      source: 's3',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('numeric GitHub run ID');
    expect(mockResolveRunSha).not.toHaveBeenCalled();
  });

  it('returns an error when SHA resolution fails', async () => {
    mockResolveRunSha.mockRejectedValue(new Error('GitHub API 404'));

    const result = await getPlaywrightTestResult({
      reportName: RUN_ID,
      testTitle: 'any test',
      source: 's3',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('GitHub API 404');
    expect(mockListArtifacts).not.toHaveBeenCalled();
  });

  it('returns an error when S3 listing fails', async () => {
    mockResolveRunSha.mockResolvedValue(SHA);
    mockListArtifacts.mockRejectedValue(
      new Error('AccessDenied: s3:ListBucket'),
    );

    const result = await getPlaywrightTestResult({
      reportName: RUN_ID,
      testTitle: 'any test',
      source: 's3',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('AccessDenied');
    expect(result.content[0].text).toContain('s3:ListBucket');
  });

  it('includes testTitleFilter and fileNameFilter in the response', async () => {
    mockResolveRunSha.mockResolvedValue(SHA);
    mockListArtifacts.mockResolvedValue({
      sha: SHA,
      s3Prefix: PREFIX,
      artifacts: [],
      empty: true,
    });

    const result = await getPlaywrightTestResult({
      reportName: RUN_ID,
      testTitle: 'login flow',
      fileName: 'auth.spec.ts',
      source: 's3',
    });

    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.testTitleFilter).toBe('login flow');
    expect(payload.fileNameFilter).toBe('auth.spec.ts');
  });
});

describe('getPlaywrightTestResult — numeric run ID auto-fallback (gh-pages mode)', () => {
  it('surfaces a helpful error with s3 hint when all GH Pages variants 404', async () => {
    const { fetchPlaywrightReport } = await import('../playwright-report.js');
    const mockFetch = fetchPlaywrightReport as jest.MockedFunction<
      typeof import('../playwright-report.js').fetchPlaywrightReport
    >;
    mockFetch.mockResolvedValue({ error: 'GitHub API 404: Not Found' });
    const { fetchPlaywrightSummary } = await import('../playwright-report.js');
    const mockSummary = fetchPlaywrightSummary as jest.MockedFunction<
      typeof import('../playwright-report.js').fetchPlaywrightSummary
    >;
    mockSummary.mockResolvedValue(null);

    const result = await getPlaywrightTestResult({
      reportName: RUN_ID,
      testTitle: 'any test',
      source: 'gh-pages',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(`nightly-${RUN_ID}`);
    expect(result.content[0].text).toContain('source="s3"');
  });
});
