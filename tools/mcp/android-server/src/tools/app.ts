import { existsSync } from 'node:fs';
import { jsonResult } from '../format.js';
import { getRepoRoot, runCommand } from '../run-command.js';
import { resolveAndroidSdk } from '../android-env.js';
import type { ToolResult } from '../types.js';

export interface AppParams {
  action: 'install' | 'launch';
  apkPath?: string;
  reinstall?: boolean;
  allowDowngrade?: boolean;
  package?: string;
  activity?: string;
  forceStop?: boolean;
  serial?: string;
}

const DEFAULT_PACKAGE = 'com.legacysports.app';
const DEFAULT_ACTIVITY = '.MainActivity';

// `adb shell am force-stop <pkg>` / `am start -n <pkg>/<activity>` hand these
// strings to the *device's* shell, not the host's — execFile's shell-free
// spawn only protects the host side. A package/activity name is restricted
// to this charset by the Android toolchain itself, so rejecting anything
// outside it (no `;`, `|`, `&`, `$`, backticks, spaces, ...) closes the
// device-shell injection vector without needing a full component-name
// grammar (LS-8815 review finding).
const ANDROID_COMPONENT_SEGMENT = /^[A-Za-z0-9_.]+$/;

export async function androidApp(params: AppParams): Promise<ToolResult> {
  const pkg = params.package ?? DEFAULT_PACKAGE;
  const activity = params.activity ?? DEFAULT_ACTIVITY;
  if (params.action === 'launch') {
    if (!ANDROID_COMPONENT_SEGMENT.test(pkg)) {
      return jsonResult(
        {
          error: `Invalid package "${pkg}": must match ${ANDROID_COMPONENT_SEGMENT} (letters, digits, '.', '_' only).`,
        },
        true,
      );
    }
    if (!ANDROID_COMPONENT_SEGMENT.test(activity)) {
      return jsonResult(
        {
          error: `Invalid activity "${activity}": must match ${ANDROID_COMPONENT_SEGMENT} (letters, digits, '.', '_' only).`,
        },
        true,
      );
    }
  }

  let adb: string;
  try {
    ({ adb } = resolveAndroidSdk());
  } catch (err) {
    return jsonResult(
      { error: err instanceof Error ? err.message : String(err) },
      true,
    );
  }
  const serialArgs = params.serial ? ['-s', params.serial] : [];

  try {
    if (params.action === 'install') {
      if (!params.apkPath) {
        return jsonResult(
          { error: 'apkPath is required for action="install".' },
          true,
        );
      }
      if (!existsSync(params.apkPath)) {
        return jsonResult({ error: `APK not found: ${params.apkPath}` }, true);
      }
      const installArgs = ['install'];
      if (params.reinstall ?? true) installArgs.push('-r');
      if (params.allowDowngrade) installArgs.push('-d');
      installArgs.push(params.apkPath);
      const output = await runCommand(
        adb,
        [...serialArgs, ...installArgs],
        getRepoRoot(),
      );
      return jsonResult({ ok: true, apkPath: params.apkPath, output });
    }

    // action === 'launch'
    if (params.forceStop ?? true) {
      await runCommand(
        adb,
        [...serialArgs, 'shell', 'am', 'force-stop', pkg],
        getRepoRoot(),
      );
    }
    const component = `${pkg}/${activity}`;
    await runCommand(
      adb,
      [...serialArgs, 'shell', 'am', 'start', '-n', component],
      getRepoRoot(),
    );
    return jsonResult({ ok: true, package: pkg, activity, component });
  } catch (err) {
    return jsonResult(
      { error: err instanceof Error ? err.message : String(err) },
      true,
    );
  }
}
