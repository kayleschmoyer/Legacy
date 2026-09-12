import os, { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AndroidEnvError,
  resolveAndroidSdk,
  resolveGradlew,
} from './android-env.js';

describe('resolveAndroidSdk', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
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

  it('throws AndroidEnvError when no SDK candidate exists', () => {
    expect(() => resolveAndroidSdk()).toThrow(AndroidEnvError);
    expect(() => resolveAndroidSdk()).toThrow('Android SDK not found');
  });
});

describe('resolveGradlew', () => {
  it('points at apps/app/android/gradlew(.bat) under the repo root', () => {
    const { gradlew } = resolveGradlew();
    expect(gradlew).toContain('apps');
    expect(gradlew).toContain('app');
    expect(gradlew).toContain('android');
    expect(gradlew.endsWith('gradlew') || gradlew.endsWith('gradlew.bat')).toBe(
      true,
    );
  });
});
