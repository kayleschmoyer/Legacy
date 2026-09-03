#!/usr/bin/env node
/**
 * Single-command Android dev startup (`make app-dev`).
 *
 * Boots an Android emulator when no device is connected, then hands off to
 * `expo run:android` (Gradle debug build + install + Metro with Fast Refresh).
 * `expo run:android` requires a device to already be online or it drops into
 * an interactive picker — this wrapper closes that gap so cold-start is one
 * command.
 *
 * Usage:
 *   node scripts/run-android-dev.mjs [--check] [expo args...]
 *
 *   --check   Preflight only: run every detection step (SDK, adb, devices,
 *             emulator, AVDs) and report what a real run would do, without
 *             launching anything. Non-zero exit if a real run would fail.
 *
 *   Any other args are forwarded to `expo run:android`.
 *
 * Env:
 *   ANDROID_HOME / ANDROID_SDK_ROOT   SDK location (falls back to the default
 *                                     install path for the current OS)
 *   ANDROID_AVD                       AVD name to boot (default: first listed)
 *
 * Security: no child process is ever spawned through a shell. Expo is invoked
 * as `node <resolved expo/bin/cli>` (never `npx` via cmd.exe), so forwarded
 * args and env-derived values are always passed as argv data, not shell text.
 * The AVD name is additionally validated against `emulator -list-avds`.
 *
 * Tests: scripts/__tests__/run-android-dev.test.mjs (pnpm run test:scripts).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const BOOT_TIMEOUT_MS = 5 * 60 * 1000; // cold boot without snapshot is slow
const SETUP_DOC = 'docs/mobile/android-version-matrix.md';

// --- pure helpers (exported for scripts/__tests__/run-android-dev.test.mjs) --

/** Split our own argv: `--check` is ours, everything else forwards to expo. */
export function splitArgs(argv) {
  return {
    checkMode: argv.includes('--check'),
    expoArgs: argv.filter((a) => a !== '--check'),
  };
}

/** Ordered SDK locations to probe: env vars first, then the OS default. */
export function sdkCandidates(env, platform, homedir) {
  return [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    platform === 'win32'
      ? path.join(homedir, 'AppData', 'Local', 'Android', 'Sdk')
      : platform === 'darwin'
        ? path.join(homedir, 'Library', 'Android', 'sdk')
        : path.join(homedir, 'Android', 'Sdk'),
  ].filter(Boolean);
}

/** Serials in the fully-connected state from `adb devices` output. */
export function parseOnlineDevices(adbDevicesOutput) {
  return adbDevicesOutput
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice'))
    .map((line) => line.split('\t')[0]);
}

/** AVD names from `emulator -list-avds` output (drops INFO noise lines). */
export function parseAvdList(listAvdsOutput) {
  return listAvdsOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('INFO'));
}

/**
 * Parse `reg query HKLM\...\FileSystem /v LongPathsEnabled` output.
 * Returns the DWORD value (0 or 1), or null if the value/key doesn't exist
 * (reg query exits non-zero and its stdout is unusable — treat as "0").
 */
export function parseLongPathsEnabled(regQueryOutput) {
  const match = regQueryOutput.match(
    /LongPathsEnabled\s+REG_DWORD\s+0x([0-9a-fA-F]+)/,
  );
  return match ? parseInt(match[1], 16) : null;
}

/**
 * Build the argv for launching expo without a shell: `node <expo/bin/cli>
 * run:android ...`. Resolving the CLI entry from apps/app and executing it
 * with the current node binary avoids `npx`/`shell: true`, so `extraArgs`
 * can never be interpreted as shell syntax (command-injection hardening).
 */
export function buildExpoCommand(appDir, extraArgs) {
  const requireFromApp = createRequire(path.join(appDir, 'package.json'));
  const expoCli = requireFromApp.resolve('expo/bin/cli');
  return {
    file: process.execPath,
    args: [expoCli, 'run:android', ...extraArgs],
  };
}

// --- imperative flow ---------------------------------------------------------

function fail(...lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

const LONG_PATH_REMEDIATION = [
  'Windows long paths are not enabled — native Android builds (CMake/ninja) from',
  'a .claude/worktrees/ checkout can fail with MAX_PATH / CMAKE_OBJECT_PATH_MAX',
  'errors (LS-8811, LS-9443). One-time fix (elevated PowerShell, then reboot):',
  "  New-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force",
  'See .agents/skills/worktree-workflow/SKILL.md#known-limitation-native-android-builds-and-windows-max_path.',
];

/** Windows-only: warn (never fail) if LongPathsEnabled isn't set to 1. */
function checkWindowsLongPaths() {
  if (process.platform !== 'win32') return;
  let enabled = null;
  try {
    const output = run('reg', [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem',
      '/v',
      'LongPathsEnabled',
    ]);
    enabled = parseLongPathsEnabled(output);
  } catch {
    // reg query exits non-zero when the value is missing — treat as disabled.
  }
  if (enabled !== 1) {
    for (const line of LONG_PATH_REMEDIATION) console.warn(line);
  }
}

function run(file, args) {
  return execFileSync(file, args, { encoding: 'utf8' });
}

async function waitForBoot(adb) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const serial = parseOnlineDevices(run(adb, ['devices'])).find((s) =>
        s.startsWith('emulator-'),
      );
      if (serial) {
        const booted = run(adb, [
          '-s',
          serial,
          'shell',
          'getprop',
          'sys.boot_completed',
        ]).trim();
        if (booted === '1') return serial;
      }
    } catch {
      // adb hiccups while the emulator is starting — keep polling
    }
    await sleep(3000);
  }
  fail(
    `Emulator did not finish booting within ${BOOT_TIMEOUT_MS / 60000} minutes.`,
  );
}

function startExpo(checkMode, expoArgs) {
  const appDir = path.join(import.meta.dirname, '..', 'apps', 'app');
  const { file, args } = buildExpoCommand(appDir, expoArgs);
  if (checkMode) {
    console.log(
      `[check] Would run: ${file} ${args.join(' ')} (cwd: ${appDir})`,
    );
    console.log('[check] Preflight passed — a real run would proceed.');
    return;
  }
  const child = spawn(file, args, { cwd: appDir, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 1));
}

async function main() {
  const { checkMode, expoArgs } = splitArgs(process.argv.slice(2));
  const exe = process.platform === 'win32' ? '.exe' : '';

  checkWindowsLongPaths();

  const sdk = sdkCandidates(process.env, process.platform, os.homedir()).find(
    (dir) => existsSync(dir),
  );
  if (!sdk) {
    fail(
      'Android SDK not found (checked ANDROID_HOME, ANDROID_SDK_ROOT, and the default install path).',
      `Install Android Studio or the command-line SDK — see ${SETUP_DOC}.`,
    );
  }
  console.log(`Android SDK: ${sdk}`);

  const adb = path.join(sdk, 'platform-tools', `adb${exe}`);
  if (!existsSync(adb)) {
    fail(
      `adb not found at ${adb}.`,
      `Install the "platform-tools" SDK package — see ${SETUP_DOC}.`,
    );
  }

  const devices = parseOnlineDevices(run(adb, ['devices']));
  if (devices.length > 0) {
    console.log(`Device already connected: ${devices.join(', ')}`);
    startExpo(checkMode, expoArgs);
    return;
  }

  const emulator = path.join(sdk, 'emulator', `emulator${exe}`);
  if (!existsSync(emulator)) {
    fail(
      'No device connected and the emulator package is not installed.',
      `Expected it at ${emulator}.`,
      'Install it via Android Studio (SDK Manager → "Android Emulator") or:',
      `  "${path.join(sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager')}" emulator`,
      `Then create an AVD (Android Studio → Device Manager) — see ${SETUP_DOC}.`,
    );
  }

  const avds = parseAvdList(run(emulator, ['-list-avds']));
  if (avds.length === 0) {
    fail(
      'No device connected and no AVDs exist to boot.',
      'Create one in Android Studio (Device Manager → Create Virtual Device)',
      `or with avdmanager — see ${SETUP_DOC}.`,
    );
  }

  // Whitelist check: the AVD name must be one `emulator -list-avds` reported.
  // Combined with shell-free spawn this keeps ANDROID_AVD strictly data.
  const avd = process.env.ANDROID_AVD ?? avds[0];
  if (!avds.includes(avd)) {
    fail(
      `ANDROID_AVD="${avd}" does not match any AVD. Available: ${avds.join(', ')}`,
    );
  }

  if (checkMode) {
    console.log(
      `[check] No device connected — would boot AVD "${avd}" and wait for boot.`,
    );
    startExpo(checkMode, expoArgs);
    return;
  }

  console.log(`Booting AVD "${avd}"...`);
  spawn(emulator, ['-avd', avd], { detached: true, stdio: 'ignore' }).unref();
  const serial = await waitForBoot(adb);
  console.log(`Emulator ${serial} booted.`);
  startExpo(checkMode, expoArgs);
}

// Only run the flow when executed directly (not when imported by tests, or by
// tools/mcp/android-server which reuses the pure helpers above — LS-8815).
// A promise chain instead of a top-level `await main()` keeps this file
// importable by CommonJS-transpiling test runners (Jest/swc), which cannot
// parse top-level await; process.exitCode preserves the non-zero exit on
// failure that an uncaught rejection would otherwise have produced.
const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
