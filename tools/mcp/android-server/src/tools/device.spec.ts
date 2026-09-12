import { mkdtempSync, rmSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import {
  androidDevice,
  findEmulatorSerial,
  spawnEmulatorDetached,
} from './device.js';

describe('findEmulatorSerial', () => {
  it('finds an emulator serial regardless of boot state', () => {
    const output = ['List of devices attached', 'emulator-5554\toffline'].join(
      '\n',
    );
    expect(findEmulatorSerial(output)).toBe('emulator-5554');
  });

  it('finds a fully-booted emulator serial', () => {
    const output = ['List of devices attached', 'emulator-5554\tdevice'].join(
      '\n',
    );
    expect(findEmulatorSerial(output)).toBe('emulator-5554');
  });

  it('returns undefined when no emulator line is present', () => {
    const output = ['List of devices attached', 'R58N30ABCDE\tdevice'].join(
      '\n',
    );
    expect(findEmulatorSerial(output)).toBeUndefined();
  });

  it('returns undefined for an empty device list', () => {
    expect(findEmulatorSerial('List of devices attached\n')).toBeUndefined();
  });
});

describe('androidDevice', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // No SDK is installed in this sandbox/CI runner — force every candidate
    // path to miss so resolveAndroidSdk() deterministically fails, exercising
    // the real (non-mocked) error path every android_* tool shares.
    // The OS default install path hangs off os.homedir(), so point it at a
    // directory that doesn't exist (a dev machine may have a real SDK there).
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
    const result = await androidDevice({ action: 'list' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Android SDK not found');
  });

  it('surfaces the same SDK error for every action, not just the default', async () => {
    const result = await androidDevice({ action: 'reverse' });
    expect(result.isError).toBe(true);
  });
});

describe('spawnEmulatorDetached', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'android-server-spawn-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // Fake emulators are `node -e` scripts rather than #!/bin/sh files, which
  // Windows can't spawn (EFTYPE). The trailing '--' keeps node from parsing
  // the appended `-avd <name>` as its own options.
  it('reports stderr when the process fails immediately, ignoring argv', async () => {
    const err = await spawnEmulatorDetached(process.execPath, 'some-avd', [
      '-e',
      'console.error("boom"); process.exit(1)',
      '--',
    ]);
    expect(err).toContain('boom');
  });

  it('reports a spawn error for a nonexistent binary', async () => {
    const err = await spawnEmulatorDetached(
      join(tmpDir, 'definitely-not-a-binary'),
      'some-avd',
    );
    expect(err).toBeDefined();
  });

  it('resolves undefined once the process survives the grace window', async () => {
    const err = await spawnEmulatorDetached(process.execPath, 'some-avd', [
      '-e',
      'setTimeout(() => {}, 10000)',
      '--',
    ]);
    expect(err).toBeUndefined();
  }, 10_000);
});
