import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PW_BROWSERS = '/opt/pw-browsers';

// CCR (Claude Code Remote) sandboxes pre-install a Playwright headless shell
// at this path and nowhere else in this repo's environments (CI uses
// /opt/playwright-browsers instead) — its presence is what distinguishes a
// CCR session from CI or local dev.
export function getCcrHeadlessShellPath() {
  try {
    const stats = statSync(PW_BROWSERS, { throwIfNoEntry: false });
    if (!stats?.isDirectory()) return null;
    const shellDir = readdirSync(PW_BROWSERS).find((d) =>
      d.startsWith('chromium_headless_shell-'),
    );
    if (!shellDir) return null;
    const shellPath = join(
      PW_BROWSERS,
      shellDir,
      'chrome-linux',
      'headless_shell',
    );
    return existsSync(shellPath) ? shellPath : null;
  } catch {
    return null;
  }
}
