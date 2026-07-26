import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cloud sessions (Claude Code on the web) pre-install Playwright's browsers
 * at /opt/pw-browsers, but that image is provisioned independently of the
 * repo's pinned @playwright/test version (LS-8319) and can drift to an older
 * chrome-headless-shell build. Scanning for whatever chromium_headless_shell-*
 * directory is actually present (instead of hardcoding the pinned revision)
 * lets the chromium project launch against it regardless of the build number,
 * mirroring the pattern in apps/video/remotion.config.ts:9-34.
 */
const PW_BROWSERS = '/opt/pw-browsers';

/** Known on-disk layouts for chrome-headless-shell, newest first. */
const HEADLESS_SHELL_LAYOUTS = [
  ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
  ['chrome-linux', 'headless_shell'],
];

/**
 * Resolves a usable chrome-headless-shell executable path from the
 * pre-installed pw-browsers directory, or undefined if none is present
 * (e.g. the GH Actions runner AMI, which provisions a separate, already
 * version-locked /opt/playwright-browsers and never hits this path).
 *
 * @param pwBrowsersDir Defaults to /opt/pw-browsers; overridable for tests.
 */
export function resolvePwBrowserExecutable(
  pwBrowsersDir: string = PW_BROWSERS,
): string | undefined {
  try {
    const stats = statSync(pwBrowsersDir, { throwIfNoEntry: false });
    if (!stats?.isDirectory()) return undefined;

    const shellDir = readdirSync(pwBrowsersDir).find((d) =>
      d.startsWith('chromium_headless_shell-'),
    );
    if (!shellDir) return undefined;

    for (const [dir, executable] of HEADLESS_SHELL_LAYOUTS) {
      const shellPath = join(pwBrowsersDir, shellDir, dir, executable);
      if (existsSync(shellPath)) return shellPath;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
