import { LOGGER } from '@legacy-sports/logging';
import { type Browser, chromium } from 'playwright';
import { resolvePwBrowser } from './resolve-pw-browser.js';

let driftWarned = false;

/**
 * Launches headless chromium for the browser MCP tools, resolving the
 * actual baked build under /opt/pw-browsers (LS-10124) instead of letting
 * Playwright default-resolve the pinned revision, which fails whenever the
 * CCR image's baked build has drifted from the repo's @playwright/test pin
 * (the environment forbids the `npx playwright install` fix Playwright's
 * own error suggests). Falls back to Playwright's default resolution when
 * /opt/pw-browsers isn't present at all (e.g. the GH Actions runner AMI).
 */
export async function launchChromium(): Promise<Browser> {
  const { executablePath, foundRevision, pinnedRevision } = resolvePwBrowser();

  if (
    executablePath &&
    foundRevision &&
    pinnedRevision &&
    foundRevision !== pinnedRevision &&
    !driftWarned
  ) {
    driftWarned = true;
    LOGGER.warn(
      `Baked Playwright browser build (${foundRevision}) does not match the ` +
        `pinned @playwright/test revision (${pinnedRevision}) — launching ` +
        `the baked build anyway. See LS-10124.`,
    );
  }

  try {
    return await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!executablePath && /Executable doesn't exist/.test(message)) {
      throw new Error(
        `${message}\n\nNo baked chromium_headless_shell-* build was found under ` +
          `/opt/pw-browsers${pinnedRevision ? ` (pinned @playwright/test expects revision ${pinnedRevision})` : ''}. ` +
          `This is a CCR image/pin mismatch (LS-10124), not a missing local install — ` +
          `do not run \`npx playwright install\`.`,
      );
    }
    throw err;
  }
}
