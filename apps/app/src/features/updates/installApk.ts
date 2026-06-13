import { File as ExpoFile, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { Platform } from 'react-native';

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 268_435_456;
const APK_MIME_TYPE = 'application/vnd.android.package-archive';
// Android 8.0 (API 26) introduced per-source "Install unknown apps" permission.
const ANDROID_O_API_LEVEL = 26;
const APP_PACKAGE_NAME = 'com.legacySports';

export interface DownloadProgress {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

const APK_CACHE_FILENAME = 'legacy-sports-latest.apk';

export class ApkInstallError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApkInstallError';
  }
}

/**
 * Thrown when the Android "Install unknown apps" per-source permission has not
 * been granted for this app. The caller should offer to open the system
 * settings page via {@link openInstallPackagesSettings}.
 */
export class ApkInstallPermissionError extends ApkInstallError {
  constructor() {
    super('Install unknown apps permission is not granted for this app');
    this.name = 'ApkInstallPermissionError';
  }
}

export async function downloadApk(
  url: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  const file = new ExpoFile(Paths.cache, APK_CACHE_FILENAME);

  try {
    // Best-effort cleanup of any prior download.
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Ignore — stale file is not fatal.
  }

  const task = ExpoFile.createDownloadTask(
    url,
    file,
    onProgress
      ? {
          onProgress: (p) =>
            onProgress({
              totalBytesWritten: p.bytesWritten,
              totalBytesExpectedToWrite: p.totalBytes,
            }),
        }
      : undefined,
  );

  try {
    const result = await task.downloadAsync();
    if (!result?.uri) {
      throw new ApkInstallError('Download produced no file');
    }
    return result.uri;
  } catch (error) {
    if (error instanceof ApkInstallError) throw error;
    throw new ApkInstallError('APK download failed', error);
  }
}

export async function verifyApkIntegrity(
  fileUri: string,
  sha256Url: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  let checksumText: string;
  try {
    const response = await fetchFn(sha256Url);
    if (!response.ok) {
      throw new ApkInstallError(
        `Could not fetch APK checksum: HTTP ${response.status}`,
      );
    }
    checksumText = await response.text();
  } catch (error) {
    if (error instanceof ApkInstallError) throw error;
    throw new ApkInstallError(
      `Could not fetch APK checksum from ${sha256Url}`,
      error,
    );
  }

  const expectedHash = checksumText.split(/\s/)[0]?.trim().toLowerCase();
  if (!expectedHash || !/^[0-9a-f]{64}$/.test(expectedHash)) {
    throw new ApkInstallError('APK checksum file has unrecognised format');
  }

  let bytes: Uint8Array;
  try {
    bytes = await new ExpoFile(fileUri).bytes();
  } catch (error) {
    throw new ApkInstallError(
      'Could not read downloaded APK for verification',
      error,
    );
  }

  let computedHash: string;
  try {
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new Uint8Array(bytes),
    );
    const hashBytes = new Uint8Array(hashBuffer);
    computedHash = Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    throw new ApkInstallError('APK integrity computation failed', error);
  }

  if (computedHash !== expectedHash) {
    throw new ApkInstallError(
      'APK integrity check failed: the downloaded file may be corrupt or tampered',
    );
  }
}

/**
 * Opens the system "Install unknown apps" settings page for this app so the
 * user can grant the per-source sideload permission (Android 8+, API 26+).
 * No-ops on non-Android platforms or when the settings activity is unavailable.
 */
export async function openInstallPackagesSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
      data: `package:${APP_PACKAGE_NAME}`,
      flags: FLAG_ACTIVITY_NEW_TASK,
    });
  } catch {
    // Settings activity unavailable on this device — ignore.
  }
}

export async function launchApkInstaller(fileUri: string): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new ApkInstallError('APK install is only supported on Android');
  }

  let contentUri: string;
  try {
    // ExpoFile.contentUri provides a content:// URI backed by Expo's FileProvider,
    // satisfying Android 10+ (API 29+) scoped storage requirements.
    contentUri = new ExpoFile(fileUri).contentUri;
  } catch (error) {
    throw new ApkInstallError(
      'Could not generate content URI for downloaded APK',
      error,
    );
  }

  try {
    await startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
      type: APK_MIME_TYPE,
    });
  } catch (error) {
    // On Android 8+ (API 26+) apps must be individually authorised to install
    // packages from unknown sources via the per-source system setting. When the
    // intent is rejected for this reason, surface a typed error so the caller
    // can redirect the user to the system settings page.
    if (
      typeof Platform.Version === 'number' &&
      Platform.Version >= ANDROID_O_API_LEVEL &&
      isInstallPermissionError(error)
    ) {
      throw new ApkInstallPermissionError();
    }
    throw new ApkInstallError('Could not launch APK installer', error);
  }
}

function isInstallPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  // SecurityException when REQUEST_INSTALL_PACKAGES is absent or the per-source
  // "Install unknown apps" setting is disabled.
  if (msg.includes('permission') || msg.includes('security')) return true;
  // ActivityNotFoundException on Android 11+ when package visibility prevents
  // the system installer from resolving the VIEW intent.
  if (msg.includes('no activity') || msg.includes('not found')) return true;
  return false;
}
