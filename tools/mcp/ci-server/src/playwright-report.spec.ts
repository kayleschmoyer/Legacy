import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';

// github-api.ts's token-minting logic (network calls, JWT signing) is out of
// scope here — mock it so these tests control exactly what fetchFileContent
// sees, matching the pattern already used by tools/get-playwright-report.spec.ts.
jest.mock('./github-api.js', () => ({
  buildHeaders: jest.fn(),
  getDeploysToken: jest.fn(),
  deploysTokenWasFallback: jest.fn(),
  githubGet: jest.fn(),
}));

import * as githubApi from './github-api.js';
import {
  fetchFileContent,
  fetchPlaywrightReport,
  DEPLOYS_REPO,
  DEPLOYS_BRANCH,
} from './playwright-report.js';

const mockBuildHeaders = githubApi.buildHeaders as jest.MockedFunction<
  typeof githubApi.buildHeaders
>;
const mockGetDeploysToken = githubApi.getDeploysToken as jest.MockedFunction<
  typeof githubApi.getDeploysToken
>;
const mockDeploysTokenWasFallback =
  githubApi.deploysTokenWasFallback as jest.MockedFunction<
    typeof githubApi.deploysTokenWasFallback
  >;

/** Build a minimal single-entry ZIP (STORED, no compression) that
 * extractZipEntries() can parse — matches the deflate/stored subset it
 * supports without needing zlib deflate for a fixture this small. */
function buildStoredZipEntry(name: string, data: Buffer): Buffer {
  const nameBuf = Buffer.from(name, 'utf-8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // local file header signature
  header.writeUInt16LE(20, 4); // version needed to extract
  header.writeUInt16LE(0, 6); // general purpose bit flag (no data descriptor)
  header.writeUInt16LE(0, 8); // compression method: stored
  header.writeUInt16LE(0, 10); // last mod file time
  header.writeUInt16LE(0, 12); // last mod file date
  header.writeUInt32LE(0, 14); // crc-32 (unchecked by extractZipEntries)
  header.writeUInt32LE(data.length, 18); // compressed size
  header.writeUInt32LE(data.length, 22); // uncompressed size
  header.writeUInt16LE(nameBuf.length, 26); // file name length
  header.writeUInt16LE(0, 28); // extra field length
  return Buffer.concat([header, nameBuf, data]);
}

function make404Response(bodyText: string): Response {
  return {
    ok: false,
    status: 404,
    text: jest.fn<() => Promise<string>>().mockResolvedValue(bodyText),
  } as unknown as Response;
}

function makeContentsApiResponse(bodyText: string): Response {
  return {
    ok: true,
    json: jest
      .fn<() => Promise<{ content: string; encoding: string }>>()
      .mockResolvedValue({
        content: Buffer.from(bodyText).toString('base64'),
        encoding: 'base64',
      }),
  } as unknown as Response;
}

describe('fetchFileContent (LS-8322)', () => {
  const savedFetch = global.fetch;
  const mockFetch = jest.fn<typeof fetch>();

  beforeEach(() => {
    mockBuildHeaders.mockReturnValue({ Authorization: 'Bearer test-token' });
    mockGetDeploysToken.mockResolvedValue('test-token');
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = savedFetch;
    jest.clearAllMocks();
  });

  it('appends the credentials-gap hint on a 404 for the deploys repo when the token was a fallback', async () => {
    mockDeploysTokenWasFallback.mockReturnValue(true);
    mockFetch.mockResolvedValue(make404Response('Not Found'));

    await expect(
      fetchFileContent(
        DEPLOYS_REPO,
        'playwright-report/pr-5949/index.html',
        DEPLOYS_BRANCH,
      ),
    ).rejects.toThrow(
      /PREVIEW_APP_PRIVATE_KEY\/PREVIEW_APP_ID are not configured/,
    );
  });

  it('does not append the credentials-gap hint on a genuine 404 with a scoped (non-fallback) token', async () => {
    mockDeploysTokenWasFallback.mockReturnValue(false);
    mockFetch.mockResolvedValue(make404Response('Not Found'));

    await expect(
      fetchFileContent(
        DEPLOYS_REPO,
        'playwright-report/pr-5949/index.html',
        DEPLOYS_BRANCH,
      ),
    ).rejects.toThrow(
      'GitHub API 404 fetching playwright-report/pr-5949/index.html: Not Found',
    );
  });

  it('does not append the credentials-gap hint on a 404 for a non-deploys repo, even with a fallback token', async () => {
    mockDeploysTokenWasFallback.mockReturnValue(true);
    mockFetch.mockResolvedValue(make404Response('Not Found'));

    await expect(
      fetchFileContent('bkrupa/legacy-sports', 'some/path.html', 'main'),
    ).rejects.toThrow('GitHub API 404 fetching some/path.html: Not Found');
  });
});

describe('fetchPlaywrightReport — happy path against a mocked embedded ZIP (LS-8004 guard)', () => {
  const savedFetch = global.fetch;
  const mockFetch = jest.fn<typeof fetch>();

  beforeEach(() => {
    mockBuildHeaders.mockReturnValue({ Authorization: 'Bearer test-token' });
    mockGetDeploysToken.mockResolvedValue('test-token');
    mockDeploysTokenWasFallback.mockReturnValue(false);
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = savedFetch;
    jest.clearAllMocks();
  });

  it('fetches playwright-report/{reportName}/index.html and parses the embedded report.json', async () => {
    const reportJson = {
      stats: {
        total: 1,
        expected: 1,
        unexpected: 0,
        flaky: 0,
        skipped: 0,
        ok: true,
      },
      files: [],
    };
    const zipBuffer = buildStoredZipEntry(
      'report.json',
      Buffer.from(JSON.stringify(reportJson)),
    );
    const html =
      '<html><body>' +
      `<div id="playwrightReportBase64" style="display:none">data:application/zip;base64,${zipBuffer.toString('base64')}</div>` +
      '</body></html>';

    mockFetch.mockResolvedValue(makeContentsApiResponse(html));

    const result = await fetchPlaywrightReport('pr-5949');

    expect(result).toEqual(reportJson);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const requestedUrl = mockFetch.mock.calls[0][0] as string;
    expect(requestedUrl).toContain(
      `/repos/${DEPLOYS_REPO}/contents/playwright-report/pr-5949/index.html`,
    );
    expect(requestedUrl).toContain(`ref=${DEPLOYS_BRANCH}`);
  });

  it('surfaces the fetchFileContent error when the report cannot be fetched', async () => {
    mockDeploysTokenWasFallback.mockReturnValue(true);
    mockFetch.mockResolvedValue(make404Response('Not Found'));

    const result = await fetchPlaywrightReport('pr-9999');

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain(
      'Failed to fetch report "pr-9999"',
    );
    expect((result as { error: string }).error).toContain('credentials gap');
  });
});
