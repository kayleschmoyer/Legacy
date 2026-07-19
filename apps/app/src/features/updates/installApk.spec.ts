import { Platform } from 'react-native';
import { File as ExpoFile } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import {
  ApkInstallError,
  ApkInstallPermissionError,
  downloadApk,
  launchApkInstaller,
  openInstallPackagesSettings,
  verifyApkIntegrity,
} from './installApk';

// Factories use only jest.fn() — no outer-variable references that would be
// undefined when Babel-hoisted jest.mock calls execute before variable init.
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  Paths: { cache: { uri: 'file:///cache/' } },
}));

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(),
}));

// Platform.Version is a getter-only property on the real react-native module,
// so the launchApkInstaller tests cannot reassign it via Object.assign. Mock
// the module to expose a writable Platform object.
jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
}));

const MockFile = ExpoFile as jest.Mock;
const mockStartActivityAsync = IntentLauncher.startActivityAsync as jest.Mock;

const FILE_URI = 'file:///cache/legacy-sports-latest.apk';
const CONTENT_URI =
  'content://com.legacysports.provider/cache/legacy-sports-latest.apk';

describe('downloadApk', () => {
  const mockDownloadAsync = jest.fn();
  const mockDelete = jest.fn();

  function setupFileMock(overrides: Partial<{ exists: boolean }> = {}) {
    MockFile.mockReturnValue({
      exists: overrides.exists ?? false,
      delete: mockDelete,
      uri: FILE_URI,
      contentUri: CONTENT_URI,
    });
    (MockFile as { createDownloadTask: jest.Mock }).createDownloadTask = jest
      .fn()
      .mockReturnValue({ downloadAsync: mockDownloadAsync });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    setupFileMock();
  });

  it('creates a File in the cache directory and starts a download task', async () => {
    mockDownloadAsync.mockResolvedValue({ uri: FILE_URI });

    const result = await downloadApk('https://example.com/app.apk');

    expect(MockFile).toHaveBeenCalledWith(
      { uri: 'file:///cache/' },
      'legacy-sports-latest.apk',
    );
    expect(
      (MockFile as { createDownloadTask: jest.Mock }).createDownloadTask,
    ).toHaveBeenCalledWith(
      'https://example.com/app.apk',
      expect.objectContaining({ uri: FILE_URI }),
      undefined,
    );
    expect(result).toBe(FILE_URI);
  });

  it('deletes a pre-existing file before downloading', async () => {
    setupFileMock({ exists: true });
    mockDownloadAsync.mockResolvedValue({ uri: FILE_URI });

    await downloadApk('https://example.com/app.apk');

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('skips deletion when no prior file exists', async () => {
    mockDownloadAsync.mockResolvedValue({ uri: FILE_URI });

    await downloadApk('https://example.com/app.apk');

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('maps new API progress fields to the legacy-named callback interface', async () => {
    type ProgressFn = (p: { bytesWritten: number; totalBytes: number }) => void;
    let capturedOnProgress: ProgressFn | undefined;

    (MockFile as { createDownloadTask: jest.Mock }).createDownloadTask = jest
      .fn()
      .mockImplementation(
        (_url: string, _file: unknown, opts?: { onProgress?: ProgressFn }) => {
          capturedOnProgress = opts?.onProgress;
          return { downloadAsync: mockDownloadAsync };
        },
      );

    mockDownloadAsync.mockResolvedValue({ uri: FILE_URI });
    const onProgress = jest.fn();
    await downloadApk('https://example.com/app.apk', onProgress);

    capturedOnProgress?.({ bytesWritten: 1024, totalBytes: 4096 });

    expect(onProgress).toHaveBeenCalledWith({
      totalBytesWritten: 1024,
      totalBytesExpectedToWrite: 4096,
    });
  });

  it('throws ApkInstallError when download produces no file', async () => {
    mockDownloadAsync.mockResolvedValue(null);

    await expect(downloadApk('https://example.com/app.apk')).rejects.toThrow(
      ApkInstallError,
    );
  });

  it('wraps unexpected download errors in ApkInstallError', async () => {
    mockDownloadAsync.mockRejectedValue(new Error('network timeout'));

    await expect(downloadApk('https://example.com/app.apk')).rejects.toThrow(
      /APK download failed/,
    );
  });

  it('ignores errors thrown during stale-file cleanup', async () => {
    setupFileMock({ exists: true });
    mockDelete.mockImplementation(() => {
      throw new Error('permission denied');
    });
    mockDownloadAsync.mockResolvedValue({ uri: FILE_URI });

    await expect(downloadApk('https://example.com/app.apk')).resolves.toBe(
      FILE_URI,
    );
  });
});

describe('launchApkInstaller', () => {
  let originalPlatformOS: typeof Platform.OS;
  let originalPlatformVersion: typeof Platform.Version;

  beforeEach(() => {
    jest.clearAllMocks();
    originalPlatformOS = Platform.OS;
    originalPlatformVersion = Platform.Version;
    MockFile.mockReturnValue({
      exists: false,
      uri: FILE_URI,
      contentUri: CONTENT_URI,
    });
    Object.assign(Platform, { OS: 'android', Version: 34 });
    mockStartActivityAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.assign(Platform, {
      OS: originalPlatformOS,
      Version: originalPlatformVersion,
    });
  });

  it('reads contentUri from the File instance and starts the install intent', async () => {
    await launchApkInstaller(FILE_URI);

    expect(MockFile).toHaveBeenCalledWith(FILE_URI);
    expect(mockStartActivityAsync).toHaveBeenCalledWith(
      'android.intent.action.VIEW',
      expect.objectContaining({
        data: CONTENT_URI,
        type: 'application/vnd.android.package-archive',
      }),
    );
  });

  it('includes FLAG_GRANT_READ_URI_PERMISSION and FLAG_ACTIVITY_NEW_TASK', async () => {
    await launchApkInstaller(FILE_URI);
    expect(mockStartActivityAsync).toHaveBeenCalledWith(
      'android.intent.action.VIEW',
      expect.objectContaining({
        // FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (268435456)
        flags: 1 | 268_435_456,
      }),
    );
  });

  it('throws ApkInstallError on non-android platforms', async () => {
    Object.assign(Platform, { OS: 'ios' });

    await expect(launchApkInstaller(FILE_URI)).rejects.toThrow(
      /only supported on Android/,
    );
  });

  it('wraps contentUri access errors in ApkInstallError', async () => {
    MockFile.mockImplementationOnce(() => {
      throw new Error('file not found');
    });

    await expect(launchApkInstaller(FILE_URI)).rejects.toThrow(/content URI/);
  });

  describe('Android 14+ package install permission handling', () => {
    it('throws ApkInstallPermissionError on SecurityException (permission denied)', async () => {
      mockStartActivityAsync.mockRejectedValue(
        new Error(
          'Permission Denial: installing com.legacySports requires android.permission.REQUEST_INSTALL_PACKAGES',
        ),
      );
      await expect(launchApkInstaller(FILE_URI)).rejects.toThrow(
        ApkInstallPermissionError,
      );
    });

    it('throws ApkInstallPermissionError on error containing "security"', async () => {
      mockStartActivityAsync.mockRejectedValue(
        new Error('security: install blocked'),
      );
      await expect(launchApkInstaller(FILE_URI)).rejects.toThrow(
        ApkInstallPermissionError,
      );
    });

    it('throws ApkInstallPermissionError when activity not found (package visibility blocked)', async () => {
      mockStartActivityAsync.mockRejectedValue(
        new Error('No activity found to handle intent'),
      );
      await expect(launchApkInstaller(FILE_URI)).rejects.toThrow(
        ApkInstallPermissionError,
      );
    });

    it('does not throw ApkInstallPermissionError on Android < 8 (API 26)', async () => {
      Object.assign(Platform, { Version: 25 });
      mockStartActivityAsync.mockRejectedValue(
        new Error('security: something'),
      );
      const error = await launchApkInstaller(FILE_URI).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApkInstallError);
      expect(error).not.toBeInstanceOf(ApkInstallPermissionError);
    });

    it('throws generic ApkInstallError for non-permission failures on Android 8+', async () => {
      mockStartActivityAsync.mockRejectedValue(new Error('disk I/O error'));
      const error = await launchApkInstaller(FILE_URI).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApkInstallError);
      expect(error).not.toBeInstanceOf(ApkInstallPermissionError);
    });
  });
});

describe('openInstallPackagesSettings', () => {
  let originalPlatformOS: typeof Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    originalPlatformOS = Platform.OS;
    Object.assign(Platform, { OS: 'android' });
    mockStartActivityAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.assign(Platform, { OS: originalPlatformOS });
  });

  it('opens MANAGE_UNKNOWN_APP_SOURCES for this app package', async () => {
    await openInstallPackagesSettings();
    expect(mockStartActivityAsync).toHaveBeenCalledWith(
      'android.settings.MANAGE_UNKNOWN_APP_SOURCES',
      expect.objectContaining({ data: 'package:com.legacySports' }),
    );
  });

  it('does nothing on non-Android platforms', async () => {
    Object.assign(Platform, { OS: 'ios' });
    await openInstallPackagesSettings();
    expect(mockStartActivityAsync).not.toHaveBeenCalled();
  });

  it('does not throw when the settings activity is unavailable', async () => {
    mockStartActivityAsync.mockRejectedValue(new Error('Activity not found'));
    await expect(openInstallPackagesSettings()).resolves.toBeUndefined();
  });
});

const KNOWN_BYTES = new Uint8Array([1, 2, 3]);

async function hashOf(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function mockFetch(status: number, body: string): typeof fetch {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  });
}

describe('verifyApkIntegrity', () => {
  const mockBytes = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    MockFile.mockReturnValue({ bytes: mockBytes });
  });

  it('passes when computed hash matches expected hash', async () => {
    const expected = await hashOf(KNOWN_BYTES);
    mockBytes.mockResolvedValue(KNOWN_BYTES);

    await expect(
      verifyApkIntegrity(
        'file:///cache/test.apk',
        'https://example.com/test.sha256',
        mockFetch(200, expected),
      ),
    ).resolves.toBeUndefined();
  });

  it('throws ApkInstallError when hash does not match', async () => {
    mockBytes.mockResolvedValue(KNOWN_BYTES);
    const wrongHash = 'b'.repeat(64);

    await expect(
      verifyApkIntegrity(
        'file:///cache/test.apk',
        'https://example.com/test.sha256',
        mockFetch(200, wrongHash),
      ),
    ).rejects.toThrow(ApkInstallError);
  });

  it('throws ApkInstallError when checksum fetch fails', async () => {
    await expect(
      verifyApkIntegrity(
        'file:///cache/test.apk',
        'https://example.com/test.sha256',
        mockFetch(404, 'Not Found'),
      ),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('throws ApkInstallError when checksum format is invalid', async () => {
    await expect(
      verifyApkIntegrity(
        'file:///cache/test.apk',
        'https://example.com/test.sha256',
        mockFetch(200, 'not-a-valid-hash'),
      ),
    ).rejects.toThrow(/unrecognised format/);
  });

  it('throws ApkInstallError when reading the APK file fails', async () => {
    const expected = await hashOf(KNOWN_BYTES);
    mockBytes.mockRejectedValue(new Error('disk read error'));

    await expect(
      verifyApkIntegrity(
        'file:///cache/test.apk',
        'https://example.com/test.sha256',
        mockFetch(200, expected),
      ),
    ).rejects.toThrow(/read downloaded APK/);
  });

  it('accepts checksum file with trailing whitespace and filename suffix', async () => {
    const expected = await hashOf(KNOWN_BYTES);
    mockBytes.mockResolvedValue(KNOWN_BYTES);

    // sha256sum output format: "<hash>  <filename>\n"
    await expect(
      verifyApkIntegrity(
        'file:///cache/test.apk',
        'https://example.com/test.sha256',
        mockFetch(200, `${expected}  legacy-sports-latest.apk\n`),
      ),
    ).resolves.toBeUndefined();
  });
});
