import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * CCR containers (Claude Code on the web) pre-install Playwright's browsers
 * at /opt/pw-browsers, but that image is provisioned independently of the
 * repo's pinned @playwright/test version (LS-8319, recurring as LS-10124)
 * and can drift to an older build with a different on-disk layout. Scanning
 * for whatever chromium_headless_shell-* revision is actually present
 * (instead of hardcoding the pinned revision, which is what Playwright's own
 * default resolution does) lets the browser MCP server launch against it
 * regardless of the baked build number. Mirrors
 * apps/web-e2e/src/resolve-pw-browser.ts's chromium lookup, duplicated here
 * (rather than shared) to keep this tool's dependency surface minimal — see
 * LS-10124 if the two drift and warrant unification.
 */
const PW_BROWSERS = '/opt/pw-browsers';

const DIR_PREFIX = 'chromium_headless_shell-';

/** Known on-disk executable layouts within a revision dir, newest first. */
const LAYOUTS: readonly (readonly string[])[] = [
  ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
  ['chrome-linux', 'headless_shell'], // non-CFT / older layout
];

export interface PwBrowserResolution {
  /** Absolute path to a usable chrome-headless-shell executable, if found. */
  executablePath?: string;
  /** Revision directory suffix actually found on disk, e.g. '1194'. */
  foundRevision?: string;
  /** Revision @playwright/test's installed playwright-core expects, e.g. '1217'. */
  pinnedRevision?: string;
}

/**
 * Reads playwright-core's own browsers.json (generated at install time from
 * the exact @playwright/test version in package.json) to find the chromium
 * headless-shell revision this repo is pinned to — without hardcoding a
 * version number here that would need updating on every Playwright bump.
 */
export function getPinnedChromiumHeadlessShellRevision(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    // browsers.json isn't in playwright-core's package.json "exports" map, so
    // it can't be require.resolve()'d directly — resolve the package root via
    // its (exported) package.json instead and read the file from there.
    const packageJsonPath = require.resolve('playwright-core/package.json');
    const browsersJsonPath = join(dirname(packageJsonPath), 'browsers.json');
    const browsersJson = JSON.parse(
      readFileSync(browsersJsonPath, 'utf-8'),
    ) as {
      browsers: { name: string; revision: string }[];
    };
    return browsersJson.browsers.find(
      (b) => b.name === 'chromium-headless-shell',
    )?.revision;
  } catch {
    return undefined;
  }
}

/**
 * Resolves a usable chrome-headless-shell executable from the pre-installed
 * /opt/pw-browsers directory, along with the found and pinned revisions so
 * callers can detect (and log) drift between them. `executablePath` is
 * undefined when no chromium_headless_shell-* build is present at all (e.g.
 * the GH Actions runner AMI, which provisions a separate, already
 * version-locked browser path and never hits this code).
 *
 * @param pwBrowsersDir Defaults to /opt/pw-browsers; overridable for tests.
 */
export function resolvePwBrowser(
  pwBrowsersDir: string = PW_BROWSERS,
): PwBrowserResolution {
  const pinnedRevision = getPinnedChromiumHeadlessShellRevision();

  try {
    const stats = statSync(pwBrowsersDir, { throwIfNoEntry: false });
    if (!stats?.isDirectory()) return { pinnedRevision };

    const revisionDir = readdirSync(pwBrowsersDir).find((d) =>
      d.startsWith(DIR_PREFIX),
    );
    if (!revisionDir) return { pinnedRevision };

    const foundRevision = revisionDir.slice(DIR_PREFIX.length);

    for (const layout of LAYOUTS) {
      const executablePath = join(pwBrowsersDir, revisionDir, ...layout);
      if (existsSync(executablePath)) {
        return { executablePath, foundRevision, pinnedRevision };
      }
    }
    return { foundRevision, pinnedRevision };
  } catch {
    return { pinnedRevision };
  }
}
