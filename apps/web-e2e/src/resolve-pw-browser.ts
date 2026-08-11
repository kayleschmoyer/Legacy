import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cloud sessions (Claude Code on the web) pre-install Playwright's browsers
 * at /opt/pw-browsers, but that image is provisioned independently of the
 * repo's pinned @playwright/test version (LS-8319) and can drift to an older
 * build. Scanning for whatever revision directory is actually present
 * (instead of hardcoding the pinned revision) lets each project launch
 * against it regardless of the build number, mirroring the pattern in
 * apps/video/remotion.config.ts:9-34.
 */
const PW_BROWSERS = '/opt/pw-browsers';

interface BrowserLookup {
  /** Prefix the on-disk revision directory starts with, e.g. 'chromium_headless_shell-'. */
  dirPrefix: string;
  /** Known on-disk executable layouts within that revision dir, newest first. */
  layouts: readonly (readonly string[])[];
}

/**
 * chrome-headless-shell is what Playwright actually launches for both the
 * chromium project and Mobile Chrome (Playwright's chromium executable
 * selection is driven by `headless`, not by device/viewport emulation — see
 * playwright-core's ChromiumBrowser.getExecutableName) whenever the run is
 * headless (the CI default), so both projects share this lookup.
 */
const HEADLESS_SHELL: BrowserLookup = {
  dirPrefix: 'chromium_headless_shell-',
  layouts: [
    ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
    ['chrome-linux', 'headless_shell'], // non-CFT / older layout
  ],
};

/** Firefox has no headless-only build; the same revision dir covers both. */
const FIREFOX: BrowserLookup = {
  dirPrefix: 'firefox-',
  layouts: [['firefox', 'firefox']],
};

/**
 * WebKit ships a wrapper script rather than a bare binary; it's what both
 * the webkit project and Mobile Safari (also a WebKit-engine project) launch.
 */
const WEBKIT: BrowserLookup = {
  dirPrefix: 'webkit-',
  layouts: [['pw_run.sh']],
};

function resolveExecutable(
  lookup: BrowserLookup,
  pwBrowsersDir: string,
): string | undefined {
  try {
    const stats = statSync(pwBrowsersDir, { throwIfNoEntry: false });
    if (!stats?.isDirectory()) return undefined;

    const revisionDir = readdirSync(pwBrowsersDir).find((d) =>
      d.startsWith(lookup.dirPrefix),
    );
    if (!revisionDir) return undefined;

    for (const layout of lookup.layouts) {
      const executablePath = join(pwBrowsersDir, revisionDir, ...layout);
      if (existsSync(executablePath)) return executablePath;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves a usable chrome-headless-shell executable path from the
 * pre-installed pw-browsers directory, or undefined if none is present
 * (e.g. the GH Actions runner AMI, which provisions a separate, already
 * version-locked /opt/playwright-browsers and never hits this path).
 * Used by both the chromium project and Mobile Chrome.
 *
 * @param pwBrowsersDir Defaults to /opt/pw-browsers; overridable for tests.
 */
export function resolvePwBrowserExecutable(
  pwBrowsersDir: string = PW_BROWSERS,
): string | undefined {
  return resolveExecutable(HEADLESS_SHELL, pwBrowsersDir);
}

/**
 * Resolves a usable firefox executable path from the pre-installed
 * pw-browsers directory, or undefined if none is present. Used by the
 * firefox project.
 *
 * @param pwBrowsersDir Defaults to /opt/pw-browsers; overridable for tests.
 */
export function resolvePwFirefoxExecutable(
  pwBrowsersDir: string = PW_BROWSERS,
): string | undefined {
  return resolveExecutable(FIREFOX, pwBrowsersDir);
}

/**
 * Resolves a usable webkit executable path from the pre-installed
 * pw-browsers directory, or undefined if none is present. Used by both the
 * webkit project and Mobile Safari.
 *
 * @param pwBrowsersDir Defaults to /opt/pw-browsers; overridable for tests.
 */
export function resolvePwWebkitExecutable(
  pwBrowsersDir: string = PW_BROWSERS,
): string | undefined {
  return resolveExecutable(WEBKIT, pwBrowsersDir);
}
