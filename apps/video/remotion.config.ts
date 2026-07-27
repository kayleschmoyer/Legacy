import { Config } from '@remotion/cli/config';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');

// Cloud sessions (Claude Code on the web) block remotion.media:443 via the CCR
// egress proxy (LS-7911). Use the pre-installed Playwright headless shell when
// present so the render step never attempts the download. The directory scan
// avoids hardcoding the Playwright revision number so version bumps stay transparent.
const PW_BROWSERS = '/opt/pw-browsers';
try {
  const stats = statSync(PW_BROWSERS, { throwIfNoEntry: false });
  if (stats?.isDirectory()) {
    const shellDir = readdirSync(PW_BROWSERS).find((d) =>
      d.startsWith('chromium_headless_shell-'),
    );
    if (shellDir) {
      const shellPath = join(
        PW_BROWSERS,
        shellDir,
        'chrome-linux',
        'headless_shell',
      );
      if (existsSync(shellPath)) {
        Config.setBrowserExecutable(shellPath);
      }
    }
  }
} catch {
  // Intentionally ignore; falls back to Remotion's default browser behaviour.
}
