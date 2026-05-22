import {
  compareSemver,
  fetchLatestRelease,
  parseAndroidReleaseTag,
  UpdateCheckError,
} from './checkForUpdate';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn() },
}));

describe('parseAndroidReleaseTag', () => {
  it('parses a valid Android release tag', () => {
    expect(parseAndroidReleaseTag('android-v1.2.3-20260522_120000')).toEqual({
      version: '1.2.3',
      buildNumber: '20260522_120000',
    });
  });

  it('returns null for non-Android tags', () => {
    expect(parseAndroidReleaseTag('v1.2.3')).toBeNull();
    expect(parseAndroidReleaseTag('ios-v1.0.0-20260101_000000')).toBeNull();
    expect(parseAndroidReleaseTag('android-v1.2-20260522_120000')).toBeNull();
  });
});

describe('compareSemver', () => {
  it('returns 1 when a > b', () => {
    expect(compareSemver('1.2.0', '1.1.9')).toBe(1);
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1);
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1);
  });

  it('returns -1 when a < b', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
  });

  it('returns 0 when equal', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });

  it('treats missing segments as zero', () => {
    expect(compareSemver('1.0', '1.0.0')).toBe(0);
    expect(compareSemver('1', '1.0.1')).toBe(-1);
  });
});

describe('fetchLatestRelease', () => {
  const mockRelease = {
    tag_name: 'android-v1.5.0-20260522_120000',
    name: 'Android Release v1.5.0',
    body: 'Release notes here',
    published_at: '2026-05-22T12:00:00Z',
    html_url:
      'https://github.com/bkrupa/legacy-sports/releases/tag/android-v1.5.0-20260522_120000',
    assets: [
      {
        name: 'legacy-sports-latest.apk',
        browser_download_url:
          'https://github.com/bkrupa/legacy-sports/releases/download/android-v1.5.0-20260522_120000/legacy-sports-latest.apk',
        size: 50_000_000,
      },
    ],
  };

  function mockFetch(
    response: Partial<Response>,
    body?: unknown,
  ): typeof fetch {
    return jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(body ?? mockRelease),
      ...response,
    }) as unknown as typeof fetch;
  }

  it('returns updateAvailable=true when latest version is newer', async () => {
    const result = await fetchLatestRelease({
      installedVersion: '1.4.0',
      fetchFn: mockFetch({}),
    });
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('1.5.0');
    expect(result.installedVersion).toBe('1.4.0');
    expect(result.apkDownloadUrl).toContain('legacy-sports-latest.apk');
    expect(result.apkSizeBytes).toBe(50_000_000);
  });

  it('returns updateAvailable=false when versions match', async () => {
    const result = await fetchLatestRelease({
      installedVersion: '1.5.0',
      fetchFn: mockFetch({}),
    });
    expect(result.updateAvailable).toBe(false);
  });

  it('throws UpdateCheckError on network failure', async () => {
    const fetchFn = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    await expect(
      fetchLatestRelease({ installedVersion: '1.0.0', fetchFn }),
    ).rejects.toThrow(UpdateCheckError);
  });

  it('throws UpdateCheckError on non-2xx response', async () => {
    const fetchFn = mockFetch({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });
    await expect(
      fetchLatestRelease({ installedVersion: '1.0.0', fetchFn }),
    ).rejects.toThrow(/403/);
  });

  it('throws UpdateCheckError when tag is not an Android release', async () => {
    const fetchFn = mockFetch({}, { ...mockRelease, tag_name: 'v1.0.0' });
    await expect(
      fetchLatestRelease({ installedVersion: '1.0.0', fetchFn }),
    ).rejects.toThrow(/not an Android release/);
  });

  it('throws UpdateCheckError when APK asset is missing', async () => {
    const fetchFn = mockFetch({}, { ...mockRelease, assets: [] });
    await expect(
      fetchLatestRelease({ installedVersion: '1.0.0', fetchFn }),
    ).rejects.toThrow(/legacy-sports-latest\.apk/);
  });
});
