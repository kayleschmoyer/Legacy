import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { state } from '../state.js';
import type { ToolResult } from '../types.js';

export interface ScreenshotParams {
  name: string;
  fullPage?: boolean;
  selector?: string;
  worktreePath?: string;
}

export async function screenshot(
  params: ScreenshotParams,
): Promise<ToolResult> {
  const { name, fullPage, selector } = params;

  if (!state.page || state.page.isClosed()) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'No active page. Call browser_navigate first.',
          }),
        },
      ],
      isError: true,
    };
  }

  // Determine output directory: worktree .screenshots or a temp dir
  const worktreePath = params.worktreePath ?? findWorktreePath();
  const screenshotDir = worktreePath
    ? join(worktreePath, '.screenshots')
    : join(process.cwd(), '.screenshots');

  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true });
  }

  const filePath = join(screenshotDir, `${name}.png`);

  try {
    if (selector) {
      // Element screenshot
      const element = await state.page.waitForSelector(selector, {
        timeout: 10_000,
      });
      if (!element) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: `Selector not found: ${selector}`,
              }),
            },
          ],
          isError: true,
        };
      }
      await element.screenshot({ path: filePath });
    } else {
      // Full page or viewport screenshot
      await state.page.screenshot({
        path: filePath,
        fullPage: fullPage ?? false,
      });
    }

    // Read the file and return as base64 image for inline preview
    const imageBuffer = await readFile(filePath);
    const base64 = imageBuffer.toString('base64');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            path: filePath,
            name,
            fullPage: fullPage ?? false,
            selector: selector ?? null,
            url: state.page.url(),
          }),
        },
        {
          type: 'image',
          data: base64,
          mimeType: 'image/png',
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Screenshot failed: ${message}`,
          }),
        },
      ],
      isError: true,
    };
  }
}

/** Try to find a worktree path from tracked dev servers. */
function findWorktreePath(): string | undefined {
  const servers = Array.from(state.devServers.values());
  return servers.length > 0 ? servers[0].worktreePath : undefined;
}
