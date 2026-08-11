import { Config } from '@remotion/cli/config';
import { getCcrHeadlessShellPath } from './scripts/ccr-sandbox.mjs';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');

// Cloud sessions (Claude Code on the web) block remotion.media:443 via the CCR
// egress proxy (LS-7911). Use the pre-installed Playwright headless shell when
// present so the render step never attempts the download.
const shellPath = getCcrHeadlessShellPath();
if (shellPath) {
  Config.setBrowserExecutable(shellPath);
}
