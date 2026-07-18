import { LOGGER } from '@legacy-sports/logging';

const RELEASES_API_URL =
  'https://api.github.com/repos/bkrupa/legacy-sports/releases/latest';

const TAG_PATTERN = /^android-v(\d+\.\d+\.\d+)-(\d{8}_\d{6})$/;

const APK_ASSET_NAME = 'legacy-sports-latest.apk';
const APK_SHA256_ASSET_NAME = 'legacy-sports-latest.apk.sha256';

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets: GitHubReleaseAsset[];
}

export interface ParsedTag {
  version: string;
  buildNumber: string;
}

export interface LatestReleaseInfo {
  installedVersion: string;
  latestVersion: string;
  latestBuildNumber: string;
  publishedAt: string;
  releaseNotes: string;
  releaseUrl: string;
  apkDownloadUrl: string;
  apkSizeBytes: number;
  apkSha256Url: string | null;
  updateAvailable: boolean;
}

export function parseAndroidReleaseTag(tag: string): ParsedTag | null {
  const match = TAG_PATTERN.exec(tag);
  if (!match) return null;
  return { version: match[1], buildNumber: match[2] };
}

export function compareSemver(a: string, b: string): number {
  const partsA = a.split('.').map((n) => parseInt(n, 10));
  const partsB = b.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const x = partsA[i] ?? 0;
    const y = partsB[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export class UpdateCheckError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'UpdateCheckError';
  }
}

// GitHub returns 404 for /releases/latest whenever the repo has no
// non-draft, non-prerelease release yet (e.g. only debug builds have been
// published so far) — this is an expected state, not a failure.
export class NoReleaseAvailableError extends UpdateCheckError {
  constructor() {
    super('No published Android release was found yet');
    this.name = 'NoReleaseAvailableError';
  }
}

interface FetchLatestReleaseDeps {
  installedVersion: string;
  fetchFn?: typeof fetch;
}

export async function fetchLatestRelease({
  installedVersion,
  fetchFn = fetch,
}: FetchLatestReleaseDeps): Promise<LatestReleaseInfo> {
  let response: Response;
  try {
    response = await fetchFn(RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
  } catch (error) {
    throw new UpdateCheckError('Could not reach GitHub Releases', error);
  }

  if (response.status === 404) {
    throw new NoReleaseAvailableError();
  }

  if (!response.ok) {
    throw new UpdateCheckError(
      `GitHub Releases returned ${response.status} ${response.statusText}`,
    );
  }

  let release: GitHubRelease;
  try {
    release = (await response.json()) as GitHubRelease;
  } catch (error) {
    throw new UpdateCheckError(
      'Could not parse GitHub Releases response',
      error,
    );
  }

  const parsed = parseAndroidReleaseTag(release.tag_name);
  if (!parsed) {
    throw new UpdateCheckError(
      `Latest release tag "${release.tag_name}" is not an Android release`,
    );
  }

  const apkAsset = release.assets.find((a) => a.name === APK_ASSET_NAME);
  if (!apkAsset) {
    throw new UpdateCheckError(
      `Latest release has no "${APK_ASSET_NAME}" asset`,
    );
  }

  const sha256Asset = release.assets.find(
    (a) => a.name === APK_SHA256_ASSET_NAME,
  );

  const cmp = compareSemver(parsed.version, installedVersion);
  return {
    installedVersion,
    latestVersion: parsed.version,
    latestBuildNumber: parsed.buildNumber,
    publishedAt: release.published_at,
    releaseNotes: release.body,
    releaseUrl: release.html_url,
    apkDownloadUrl: apkAsset.browser_download_url,
    apkSizeBytes: apkAsset.size,
    apkSha256Url: sha256Asset?.browser_download_url ?? null,
    updateAvailable: cmp > 0,
  };
}

export function logUpdateCheckError(context: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  // A missing release is an expected state (see NoReleaseAvailableError), not
  // a bug — log it at warn so it isn't forwarded to Rollbar as an error.
  if (err instanceof NoReleaseAvailableError) {
    LOGGER.warn(`update-check: ${context}`, err);
    return;
  }
  LOGGER.error(`update-check: ${context}`, err);
}
