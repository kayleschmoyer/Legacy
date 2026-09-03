// SDK/device resolution shared by every android_* tool. Reuses the pure,
// already-unit-tested helpers from scripts/run-android-dev.mjs (`make
// app-dev`'s cold-start wrapper) rather than reimplementing SDK-path probing
// and adb/AVD-list parsing — see scripts/__tests__/run-android-dev.test.mjs
// for their existing coverage (LS-8815).
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { getRepoRoot } from './run-command.js';
import {
  parseAvdList,
  parseOnlineDevices,
  sdkCandidates,
} from '../../../../scripts/run-android-dev.mjs';

export { parseAvdList, parseOnlineDevices };

export class AndroidEnvError extends Error {}

export interface AndroidSdk {
  sdkRoot: string;
  adb: string;
  emulator: string;
}

const EXE = process.platform === 'win32' ? '.exe' : '';
const BAT = process.platform === 'win32' ? '.bat' : '';

/** Resolve the Android SDK root, adb, and emulator binary paths. Throws AndroidEnvError with a remedy if any are missing. */
export function resolveAndroidSdk(): AndroidSdk {
  const sdkRoot = sdkCandidates(
    process.env,
    process.platform,
    os.homedir(),
  ).find((dir: string) => existsSync(dir));
  if (!sdkRoot) {
    throw new AndroidEnvError(
      'Android SDK not found (checked ANDROID_HOME, ANDROID_SDK_ROOT, and the default install path for this OS). ' +
        'Install Android Studio or the command-line SDK — see docs/mobile/android-version-matrix.md.',
    );
  }

  const adb = path.join(sdkRoot, 'platform-tools', `adb${EXE}`);
  if (!existsSync(adb)) {
    throw new AndroidEnvError(
      `adb not found at ${adb}. Install the "platform-tools" SDK package.`,
    );
  }

  const emulator = path.join(sdkRoot, 'emulator', `emulator${EXE}`);
  return { sdkRoot, adb, emulator };
}

/** Path to apps/app/android/gradlew(.bat), and whether it needs shell:true to launch (Windows .bat shim). */
export function resolveGradlew(): { gradlew: string; needsShell: boolean } {
  const gradlew = path.join(
    getRepoRoot(),
    'apps',
    'app',
    'android',
    `gradlew${BAT}`,
  );
  return { gradlew, needsShell: process.platform === 'win32' };
}
