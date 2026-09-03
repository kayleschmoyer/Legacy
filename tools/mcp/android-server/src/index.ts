import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { androidDevice } from './tools/device.js';
import { androidApp } from './tools/app.js';
import { androidScreenshot } from './tools/screenshot.js';
import { androidLogcat } from './tools/logcat.js';
import { androidBuild } from './tools/build.js';

// Absolute path: Windows (C:\... or C:/...) or Unix (/...)
const ABSOLUTE_PATH_REGEX = /^([A-Za-z]:[/\\]|\/)/;

const server = new McpServer({
  name: 'legacy-sports-android',
  version: '1.0.0',
});

// --- android_device ---
server.tool(
  'android_device',
  'Android device/emulator connectivity. Resolves the SDK path itself (ANDROID_HOME/ANDROID_SDK_ROOT/default install dir) — never export PATH by hand. ' +
    'action="list" wraps `adb devices`. action="start_emulator" boots an AVD and blocks on sys.boot_completed (up to ~45s per call — re-call to keep waiting, ' +
    'it never spawns a second emulator while one is already booting); no-ops if a device is already connected. action="reverse" wraps `adb reverse` to point a ' +
    'device at a local Metro dev server.',
  {
    action: z
      .enum(['list', 'start_emulator', 'reverse'])
      .default('list')
      .describe('Which device operation to perform.'),
    avd: z
      .string()
      .optional()
      .describe(
        'action="start_emulator" only. AVD name to boot. Defaults to $ANDROID_AVD, then the only installed AVD.',
      ),
    waitForBoot: z
      .boolean()
      .default(true)
      .describe(
        'action="start_emulator" only. Block until sys.boot_completed=1 (bounded per call — see description). Pass false to just kick off the boot.',
      ),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'action="start_emulator" only. Per-call boot-wait budget in ms (default 45000). Cold boot can take minutes — re-call to keep waiting.',
      ),
    devicePort: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('action="reverse" only. Port on the device to forward.'),
    hostPort: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'action="reverse" only. Port on the host that devicePort forwards to, e.g. 8081 for Metro.',
      ),
    serial: z
      .string()
      .optional()
      .describe(
        'Target a specific device (adb -s). Defaults to the sole online device.',
      ),
  },
  async (params) => androidDevice(params),
);

// --- android_app ---
server.tool(
  'android_app',
  'Install or launch the app on a connected Android device/emulator. action="install" wraps `adb install`. action="launch" force-stops (default) then wraps ' +
    '`adb shell am start`. Call android_device({ action: "list" }) first to confirm a device is online.',
  {
    action: z
      .enum(['install', 'launch'])
      .describe('Which app operation to perform.'),
    apkPath: z
      .string()
      .optional()
      .describe(
        'action="install" only (required). Path to the .apk to install.',
      ),
    reinstall: z
      .boolean()
      .default(true)
      .describe(
        'action="install" only. Pass -r to adb install (keep app data).',
      ),
    allowDowngrade: z
      .boolean()
      .default(false)
      .describe(
        'action="install" only. Pass -d to allow a versionCode downgrade (avoids INSTALL_FAILED_VERSION_DOWNGRADE).',
      ),
    package: z
      .string()
      .default('com.legacysports.app')
      .describe('action="launch" only. Android application ID.'),
    activity: z
      .string()
      .default('.MainActivity')
      .describe('action="launch" only. Activity to start.'),
    forceStop: z
      .boolean()
      .default(true)
      .describe(
        'action="launch" only. Force-stop the app before starting it, clearing prior in-memory state.',
      ),
    serial: z
      .string()
      .optional()
      .describe(
        'Target a specific device (adb -s). Defaults to the sole online device.',
      ),
  },
  async (params) => androidApp(params),
);

// --- android_screenshot ---
server.tool(
  'android_screenshot',
  'Capture a screenshot of the connected device/emulator (wraps `adb exec-out screencap -p`) and return it inline — the mobile counterpart to browser_screenshot, ' +
    'for the visual before/after evidence the debugging and work-ticket skills require on mobile UI tickets. Saves to {repoRoot}/.screenshots/ unless outputPath is given.',
  {
    outputPath: z
      .string()
      .regex(ABSOLUTE_PATH_REGEX, 'outputPath must be an absolute path')
      .optional()
      .describe(
        'Absolute path to save the PNG to (default: repo .screenshots/ dir with a timestamped name).',
      ),
    serial: z
      .string()
      .optional()
      .describe(
        'Target a specific device (adb -s). Defaults to the sole online device.',
      ),
  },
  async (params) => androidScreenshot(params),
);

// --- android_logcat ---
server.tool(
  'android_logcat',
  'Filtered `adb logcat` crash/debug triage — avoids dumping the full noisy buffer (mostly unrelated GMS/artd/ziparchive lines). Pass tags as `adb` filter specs ' +
    '(e.g. ["AndroidRuntime:E", "ReactNativeJS:*"]) — everything else is silenced (*:S appended automatically) unless a catch-all filter is already present.',
  {
    tags: z
      .array(z.string())
      .optional()
      .describe(
        'adb logcat filter specs, e.g. ["AndroidRuntime:E", "ReactNativeJS:*"]. Omit to dump the unfiltered buffer.',
      ),
    sinceClear: z
      .boolean()
      .default(false)
      .describe(
        'Clear the log buffer (adb logcat -c) before capturing, so only new lines are returned.',
      ),
    maxLines: z
      .number()
      .int()
      .positive()
      .default(200)
      .describe('Keep at most this many of the most recent lines.'),
    serial: z
      .string()
      .optional()
      .describe(
        'Target a specific device (adb -s). Defaults to the sole online device.',
      ),
  },
  async (params) => androidLogcat(params),
);

// --- android_build ---
server.tool(
  'android_build',
  'Build the Android app via Gradle (wraps `gradlew app:assembleDebug`/`app:assembleRelease`). Sets a fresh GITHUB_RUN_NUMBER-shaped versionCode automatically ' +
    '(current epoch seconds) so a local build reinstalling over a device with a newer CI build does not hit INSTALL_FAILED_VERSION_DOWNGRADE — pass versionCode ' +
    'to pin a specific value instead.',
  {
    variant: z
      .enum(['debug', 'release'])
      .default('debug')
      .describe('Gradle build variant.'),
    arch: z
      .string()
      .optional()
      .describe(
        'Restrict the native build to one ABI via -PreactNativeArchitectures, e.g. "x86_64" for a faster emulator-only build.',
      ),
    versionCode: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Pin GITHUB_RUN_NUMBER (and therefore the Gradle versionCode) to this value instead of the auto-generated epoch-seconds default.',
      ),
  },
  async (params) => androidBuild(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
