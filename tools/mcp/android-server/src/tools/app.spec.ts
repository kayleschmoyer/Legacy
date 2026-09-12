import os, { tmpdir } from 'node:os';
import { join } from 'node:path';
import { androidApp } from './app.js';

describe('androidApp', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Hide the OS default SDK path too (it hangs off os.homedir()).
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
    jest
      .spyOn(os, 'homedir')
      .mockReturnValue(join(tmpdir(), 'android-server-spec-no-home'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('returns a structured error when the Android SDK cannot be found', async () => {
    const result = await androidApp({ action: 'launch' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Android SDK not found');
  });

  it('surfaces the SDK error before validating install-specific params', async () => {
    // Confirms the SDK-resolution guard runs first regardless of action —
    // apkPath is missing here too, but the SDK error is what surfaces.
    const result = await androidApp({ action: 'install' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Android SDK not found');
  });

  it('rejects a package containing shell metacharacters before touching the SDK', async () => {
    // adb shell am start/force-stop hands this string to the *device's*
    // shell — validation must run even when the SDK can't be resolved here,
    // proving it isn't gated behind the (unrelated) SDK check.
    const result = await androidApp({
      action: 'launch',
      package: 'com.foo; rm -rf /sdcard',
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Invalid package');
    expect(text).not.toContain('Android SDK not found');
  });

  it('rejects an activity containing shell metacharacters', async () => {
    const result = await androidApp({
      action: 'launch',
      activity: '.Main`whoami`',
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Invalid activity');
  });

  it('does not validate package/activity for action="install"', async () => {
    // install doesn't touch package/activity at all — the SDK error is what
    // should surface, not a spurious component-name rejection.
    const result = await androidApp({ action: 'install' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).not.toContain('Invalid package');
  });
});
