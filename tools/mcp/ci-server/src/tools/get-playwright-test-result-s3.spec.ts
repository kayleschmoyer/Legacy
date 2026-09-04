import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Stub github-api (import.meta not compatible with ts-jest CommonJS target).
jest.mock('../github-api.js', () => ({
  buildHeaders: jest.fn(),
  getToken: jest.fn(),
  githubGet: jest.fn(),
  deploysTokenWasFallback: jest.fn(() => false),
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
import * as githubApi from '../github-api.js';

const mockResolveRunSha = s3Artifacts.resolveRunSha as jest.MockedFunction<
  typeof s3Artifacts.resolveRunSha
>;
const mockListArtifacts =
  s3Artifacts.listPlaywrightS3Artifacts as jest.MockedFunction<
    typeof s3Artifacts.listPlaywrightS3Artifacts
  >;
const mockDeploysTokenWasFallback =
  githubApi.deploysTokenWasFallback as jest.MockedFunction<
    typeof githubApi.deploysTokenWasFallback
  >;
const mockGithubGet = githubApi.githubGet as jest.MockedFunction<
  typeof githubApi.githubGet
>;

/** Parsed shape of the `source=s3` JSON response, for typed assertions. */
interface ParsedS3Payload {
  source: string;
  sha: string;
  runId: number;
  artifactCount: number;
  empty: boolean;
  emptyNote?: string;
  artifacts: Array<{ presignedUrl: string }>;
  ghPagesReportName: string;
  testTitleFilter?: string;
  fileNameFilter?: string;
}

function parseS3Payload(text: string): ParsedS3Payload {
  return JSON.parse(text) as ParsedS3Payload;
}

/** Parsed shape of the gh-pages `TestResultResponse` JSON, for typed assertions. */
interface ParsedTestResultPayload {
  matched: boolean;
  test?: { title: string; outcome: string };
  candidates?: Array<{ title: string }>;
  message?: string;
}

function parseTestResultPayload(text: string): ParsedTestResultPayload {
  return JSON.parse(text) as ParsedTestResultPayload;
}

const SHA = 'abc123def456';
const RUN_ID = '28115361551';
const PREFIX = `s3://legacy-sports-dev-ci-artifacts/ci-artifacts/${SHA}/playwright-blobs/`;

beforeEach(() => {
  jest.clearAllMocks();
  mockDeploysTokenWasFallback.mockReturnValue(false);
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
    const payload = parseS3Payload(result.content[0].text);
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
    expect(mockListArtifacts).toHaveBeenCalledWith(SHA, 'blobs');
  });

  it('defaults to artifactType "blobs" and includes it in the response', async () => {
    mockResolveRunSha.mockResolvedValue(SHA);
    mockListArtifacts.mockResolvedValue({
      sha: SHA,
      s3Prefix: PREFIX,
      artifacts: [],
      empty: true,
    });

    const result = await getPlaywrightTestResult({
      reportName: RUN_ID,
      testTitle: 'some test',
      source: 's3',
    });

    expect(mockListArtifacts).toHaveBeenCalledWith(SHA, 'blobs');
    const payload = parseS3Payload(result.content[0].text) as ParsedS3Payload &
      Record<string, unknown>;
    expect(payload['artifactType']).toBe('blobs');
  });

  it.each(['coverage', 'output'] as const)(
    'passes artifactType=%s through to listPlaywrightS3Artifacts',
    async (artifactType) => {
      mockResolveRunSha.mockResolvedValue(SHA);
      mockListArtifacts.mockResolvedValue({
        sha: SHA,
        s3Prefix: `s3://legacy-sports-dev-ci-artifacts/ci-artifacts/${SHA}/playwright-${artifactType}/`,
        artifacts: [
          {
            key: `ci-artifacts/${SHA}/playwright-${artifactType}/fragment-1.json`,
            presignedUrl: 'https://s3.example.com/signed-url-1',
            sizeBytes: 512,
            lastModified: '2026-06-28T00:00:00.000Z',
          },
        ],
        empty: false,
      });

      const result = await getPlaywrightTestResult({
        reportName: RUN_ID,
        testTitle: 'some test',
        source: 's3',
        artifactType,
      });

      expect(result.isError).toBeFalsy();
      expect(mockListArtifacts).toHaveBeenCalledWith(SHA, artifactType);
      const payload = parseS3Payload(
        result.content[0].text,
      ) as ParsedS3Payload & Record<string, unknown>;
      expect(payload['artifactType']).toBe(artifactType);
      expect(payload.artifacts).toHaveLength(1);
    },
  );

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
    const payload = parseS3Payload(result.content[0].text);
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

    const payload = parseS3Payload(result.content[0].text);
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

describe('getPlaywrightTestResult — automatic S3 fallback on credentials gap (LS-9592)', () => {
  it('falls back to S3 artifacts for a numeric reportName when GH Pages 404s due to a credentials gap', async () => {
    const { fetchPlaywrightReport } = await import('../playwright-report.js');
    const mockFetch = fetchPlaywrightReport as jest.MockedFunction<
      typeof import('../playwright-report.js').fetchPlaywrightReport
    >;
    mockFetch.mockResolvedValue({ error: 'GitHub API 404: credentials gap' });
    mockDeploysTokenWasFallback.mockReturnValue(true);
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
      ],
      empty: false,
    });

    const result = await getPlaywrightTestResult({
      reportName: RUN_ID,
      testTitle: 'shows Career Pitching card',
    });

    expect(result.isError).toBeUndefined();
    expect(mockResolveRunSha).toHaveBeenCalledWith(Number(RUN_ID));
    expect(mockListArtifacts).toHaveBeenCalledWith(SHA, 'blobs');
    const payload = parseS3Payload(result.content[0].text) as ParsedS3Payload &
      Record<string, unknown>;
    expect(payload.source).toBe('s3');
    expect(payload.sha).toBe(SHA);
    expect(payload.runId).toBe(Number(RUN_ID));
    expect(payload.artifactCount).toBe(1);
    expect(payload['reason']).toContain('credentials gap');
  });

  it('falls back to S3 artifacts for a "pr-N" reportName by resolving the PR head SHA', async () => {
    const { fetchPlaywrightReport } = await import('../playwright-report.js');
    const mockFetch = fetchPlaywrightReport as jest.MockedFunction<
      typeof import('../playwright-report.js').fetchPlaywrightReport
    >;
    mockFetch.mockResolvedValue({ error: 'GitHub API 404: credentials gap' });
    mockDeploysTokenWasFallback.mockReturnValue(true);
    mockGithubGet.mockResolvedValue({ head: { sha: 'pr-head-sha' } });
    mockListArtifacts.mockResolvedValue({
      sha: 'pr-head-sha',
      s3Prefix: `s3://legacy-sports-dev-ci-artifacts/ci-artifacts/pr-head-sha/playwright-blobs/`,
      artifacts: [
        {
          key: 'ci-artifacts/pr-head-sha/playwright-blobs/2/report-xyz.zip',
          presignedUrl: 'https://s3.example.com/signed-url-3',
          sizeBytes: 4096,
          lastModified: '2026-08-22T00:00:00.000Z',
        },
      ],
      empty: false,
    });

    const result = await getPlaywrightTestResult({
      reportName: 'pr-7243',
      testTitle: 'shows Career Pitching card and pitching tab for a pitcher',
      fileName: 'player-detail-modal.spec.ts',
    });

    expect(result.isError).toBeUndefined();
    expect(mockGithubGet).toHaveBeenCalledWith('/pulls/7243');
    expect(mockResolveRunSha).not.toHaveBeenCalled();
    const payload = parseS3Payload(result.content[0].text) as ParsedS3Payload &
      Record<string, unknown>;
    expect(payload.source).toBe('s3');
    expect(payload.sha).toBe('pr-head-sha');
    expect(payload.runId).toBeNull();
    expect(payload.fileNameFilter).toBe('player-detail-modal.spec.ts');
  });

  it('does not attempt the S3 fallback when there is no credentials gap', async () => {
    const { fetchPlaywrightReport } = await import('../playwright-report.js');
    const mockFetch = fetchPlaywrightReport as jest.MockedFunction<
      typeof import('../playwright-report.js').fetchPlaywrightReport
    >;
    mockFetch.mockResolvedValue({ error: 'GitHub API 404: Not Found' });
    mockDeploysTokenWasFallback.mockReturnValue(false);

    const result = await getPlaywrightTestResult({
      reportName: 'pr-7243',
      testTitle: 'any test',
    });

    expect(result.isError).toBe(true);
    expect(mockListArtifacts).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('GitHub API 404: Not Found');
  });

  it('falls through to the credentials-gap error, unchanged, when the S3 listing comes up empty', async () => {
    const { fetchPlaywrightReport } = await import('../playwright-report.js');
    const mockFetch = fetchPlaywrightReport as jest.MockedFunction<
      typeof import('../playwright-report.js').fetchPlaywrightReport
    >;
    mockFetch.mockResolvedValue({
      error: 'GitHub API 404 fetching index.html: credentials gap',
    });
    mockDeploysTokenWasFallback.mockReturnValue(true);
    mockGithubGet.mockResolvedValue({ head: { sha: 'pr-head-sha' } });
    mockListArtifacts.mockResolvedValue({
      sha: 'pr-head-sha',
      s3Prefix: `s3://legacy-sports-dev-ci-artifacts/ci-artifacts/pr-head-sha/playwright-blobs/`,
      artifacts: [],
      empty: true,
    });

    const result = await getPlaywrightTestResult({
      reportName: 'pr-7243',
      testTitle: 'any test',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('credentials gap');
    expect(result.content[0].text).toContain('Tried report names: pr-7243');
  });
});

describe('getPlaywrightTestResult — runId/testFile lookup (LS-8888)', () => {
  it('requires one of reportName or runId', async () => {
    const result = await getPlaywrightTestResult({
      testTitle: 'any test',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'One of reportName or runId is required.',
    );
  });

  it('requires one of testTitle or fileName/testFile', async () => {
    const result = await getPlaywrightTestResult({
      runId: RUN_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'One of testTitle or fileName/testFile is required',
    );
  });

  it('accepts runId as an alternative to reportName in s3 mode', async () => {
    mockResolveRunSha.mockResolvedValue(SHA);
    mockListArtifacts.mockResolvedValue({
      sha: SHA,
      s3Prefix: PREFIX,
      artifacts: [],
      empty: true,
    });

    const result = await getPlaywrightTestResult({
      runId: Number(RUN_ID),
      testFile: 'live-draft-ui.integration.spec.ts',
      source: 's3',
    });

    expect(result.isError).toBeFalsy();
    const payload = parseS3Payload(result.content[0].text);
    expect(payload.runId).toBe(Number(RUN_ID));
    expect(payload.fileNameFilter).toBe('live-draft-ui.integration.spec.ts');
    expect(mockResolveRunSha).toHaveBeenCalledWith(Number(RUN_ID));
  });

  it('resolves the single non-passing test in a file when testTitle is omitted', async () => {
    const { fetchPlaywrightReport, fullTitle } =
      await import('../playwright-report.js');
    const mockFetch = fetchPlaywrightReport as jest.MockedFunction<
      typeof import('../playwright-report.js').fetchPlaywrightReport
    >;
    const mockFullTitle = fullTitle as jest.MockedFunction<
      typeof import('../playwright-report.js').fullTitle
    >;
    mockFullTitle.mockImplementation((t: { title: string }) => t.title);
    mockFetch.mockResolvedValue({
      stats: {
        total: 2,
        expected: 1,
        unexpected: 1,
        flaky: 0,
        skipped: 0,
        ok: false,
      },
      files: [
        {
          fileName: 'live-draft-ui.integration.spec.ts',
          tests: [
            { title: 'passes', outcome: 'expected', results: [] },
            { title: 'fails', outcome: 'unexpected', results: [] },
          ],
        },
      ],
    });

    const result = await getPlaywrightTestResult({
      runId: RUN_ID,
      testFile: 'live-draft-ui.integration.spec.ts',
      source: 'gh-pages',
    });

    expect(result.isError).toBeFalsy();
    const payload = parseTestResultPayload(result.content[0].text);
    expect(payload.matched).toBe(true);
    expect(payload.test?.title).toBe('fails');
    expect(payload.test?.outcome).toBe('unexpected');
  });

  it('returns candidates when multiple non-passing tests match a file-only lookup', async () => {
    const { fetchPlaywrightReport, fullTitle } =
      await import('../playwright-report.js');
    const mockFetch = fetchPlaywrightReport as jest.MockedFunction<
      typeof import('../playwright-report.js').fetchPlaywrightReport
    >;
    const mockFullTitle = fullTitle as jest.MockedFunction<
      typeof import('../playwright-report.js').fullTitle
    >;
    mockFullTitle.mockImplementation((t: { title: string }) => t.title);
    mockFetch.mockResolvedValue({
      stats: {
        total: 2,
        expected: 0,
        unexpected: 2,
        flaky: 0,
        skipped: 0,
        ok: false,
      },
      files: [
        {
          fileName: 'live-draft-ui.integration.spec.ts',
          tests: [
            { title: 'fails one', outcome: 'unexpected', results: [] },
            { title: 'fails two', outcome: 'unexpected', results: [] },
          ],
        },
      ],
    });

    const result = await getPlaywrightTestResult({
      runId: RUN_ID,
      testFile: 'live-draft-ui.integration.spec.ts',
      source: 'gh-pages',
    });

    expect(result.isError).toBeFalsy();
    const payload = parseTestResultPayload(result.content[0].text);
    expect(payload.matched).toBe(false);
    expect(payload.candidates).toHaveLength(2);
    expect(payload.message).toContain('Pass testTitle to disambiguate.');
  });
});
