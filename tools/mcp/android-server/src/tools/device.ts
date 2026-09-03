import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import process from 'node:process';
import { jsonResult } from '../format.js';
import { getRepoRoot, runCommand } from '../run-command.js';
import {
  parseAvdList,
  parseOnlineDevices,
  resolveAndroidSdk,
} from '../android-env.js';
import type { ToolResult } from '../types.js';

export interface DeviceParams {
  action?: 'list' | 'start_emulator' | 'reverse';
  avd?: string;
  waitForBoot?: boolean;
  timeoutMs?: number;
  devicePort?: number;
  hostPort?: number;
  serial?: string;
}

const BOOT_POLL_INTERVAL_MS = 3000;
// Bounded like other android-server/browser-server sync waits so a call always
// returns before the ~60s MCP transport limit; re-invoking start_emulator
// while the same AVD is still booting is safe (it never spawns a second one).
const DEFAULT_WAIT_BUDGET_MS = 45_000;

// How long to watch a freshly-spawned emulator process for an immediate
// failure (bad binary, missing AVD system image, etc.) before detaching and
// letting it boot in the background. `stdio: 'ignore'` alone silently
// discards a launch failure and the caller is left polling `adb devices`
// forever for a process that already died (LS-8815 review finding).
const EMULATOR_LAUNCH_GRACE_MS = 1500;

/**
 * Spawn the emulator detached, watching briefly for an immediate failure.
 * Resolves with an error message if the process errored or exited within
 * the grace window; resolves with `undefined` (and detaches it) once it's
 * still running past that window, which is the normal cold-boot case.
 */
export function spawnEmulatorDetached(
  emulator: string,
  avd: string,
): Promise<string | undefined> {
  const child = spawn(emulator, ['-avd', avd], {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString('utf8')).slice(-2000);
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: string | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners();
      // Drop our read end of the pipe so it can't hold the caller's event
      // loop open — the detached child keeps running independently and
      // doesn't need a listener on the other end once we stop watching it.
      child.stderr?.destroy();
      child.unref();
      resolve(result);
    };
    child.once('error', (err) => finish(err.message));
    child.once('exit', (code) => {
      if (code !== null && code !== 0) {
        finish(
          stderr.trim() || `emulator exited immediately with code ${code}`,
        );
      } else {
        finish(undefined);
      }
    });
    const timer = setTimeout(() => finish(undefined), EMULATOR_LAUNCH_GRACE_MS);
  });
}

/** Serial of any emulator device already known to adb, booted or not. */
export function findEmulatorSerial(
  adbDevicesOutput: string,
): string | undefined {
  return adbDevicesOutput
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .find((line) => line.split('\t')[0]?.startsWith('emulator-'))
    ?.split('\t')[0];
}

export async function androidDevice(params: DeviceParams): Promise<ToolResult> {
  const action = params.action ?? 'list';
  let adb: string;
  let emulator: string;
  try {
    ({ adb, emulator } = resolveAndroidSdk());
  } catch (err) {
    return jsonResult(
      { error: err instanceof Error ? err.message : String(err) },
      true,
    );
  }

  try {
    if (action === 'list') {
      const output = await runCommand(adb, ['devices'], getRepoRoot());
      return jsonResult({ devices: parseOnlineDevices(output) });
    }

    if (action === 'reverse') {
      if (!params.devicePort || !params.hostPort) {
        return jsonResult(
          {
            error: 'devicePort and hostPort are required for action="reverse".',
          },
          true,
        );
      }
      const args = [
        ...(params.serial ? ['-s', params.serial] : []),
        'reverse',
        `tcp:${params.devicePort}`,
        `tcp:${params.hostPort}`,
      ];
      await runCommand(adb, args, getRepoRoot());
      return jsonResult({
        ok: true,
        devicePort: params.devicePort,
        hostPort: params.hostPort,
      });
    }

    // action === 'start_emulator'
    const devicesOutput = await runCommand(adb, ['devices'], getRepoRoot());
    const online = parseOnlineDevices(devicesOutput);
    if (online.length > 0) {
      return jsonResult({ alreadyConnected: true, devices: online });
    }

    let serial = findEmulatorSerial(devicesOutput);
    if (!serial) {
      if (!existsSync(emulator)) {
        return jsonResult(
          {
            error: `No device connected and the emulator package is not installed. Expected it at ${emulator}. Install it via Android Studio (SDK Manager → "Android Emulator").`,
          },
          true,
        );
      }
      const avds = parseAvdList(
        await runCommand(emulator, ['-list-avds'], getRepoRoot()),
      );
      if (avds.length === 0) {
        return jsonResult(
          {
            error:
              'No device connected and no AVDs exist to boot. Create one in Android Studio (Device Manager) or with avdmanager.',
          },
          true,
        );
      }
      const avd = params.avd ?? process.env.ANDROID_AVD ?? avds[0];
      // Whitelist check: the AVD name must be one `emulator -list-avds`
      // reported. Combined with the shell-free spawn below, this keeps a
      // caller-supplied `avd` strictly data (mirrors run-android-dev.mjs).
      if (!avds.includes(avd)) {
        return jsonResult(
          {
            error: `AVD "${avd}" does not match any AVD. Available: ${avds.join(', ')}`,
          },
          true,
        );
      }
      const launchError = await spawnEmulatorDetached(emulator, avd);
      if (launchError) {
        return jsonResult(
          { error: `Failed to launch emulator: ${launchError}` },
          true,
        );
      }
    }

    if (params.waitForBoot === false) {
      return jsonResult({ booting: true, serial: serial ?? null });
    }

    const budget = params.timeoutMs ?? DEFAULT_WAIT_BUDGET_MS;
    const deadline = Date.now() + budget;
    while (Date.now() < deadline) {
      try {
        const current = parseOnlineDevices(
          await runCommand(adb, ['devices'], getRepoRoot()),
        ).find((s: string) => s.startsWith('emulator-'));
        if (current) {
          const booted = (
            await runCommand(
              adb,
              ['-s', current, 'shell', 'getprop', 'sys.boot_completed'],
              getRepoRoot(),
            )
          ).trim();
          if (booted === '1') {
            return jsonResult({ booted: true, serial: current });
          }
          serial = current;
        }
      } catch {
        // adb hiccups while the emulator is starting — keep polling
      }
      await sleep(BOOT_POLL_INTERVAL_MS);
    }

    return jsonResult({
      booted: false,
      serial: serial ?? null,
      message:
        'Still booting after the wait budget — call android_device({ action: "start_emulator" }) again to keep waiting; the same AVD keeps booting, this never spawns a second one.',
    });
  } catch (err) {
    return jsonResult(
      { error: err instanceof Error ? err.message : String(err) },
      true,
    );
  }
}
