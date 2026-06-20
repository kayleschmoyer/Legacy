import { existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { state } from '../state.js';
import { jsonResult, minifiedJson } from '../format.js';
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
    return jsonResult(
      { ok: false, error: 'No active page. Call browser_navigate first.' },
      true,
    );
  }

  // Determine output directory: worktree .screenshots or a temp dir
  const worktreePath = params.worktreePath ?? findWorktreePath();
  const screenshotDir = worktreePath
    ? join(worktreePath, '.screenshots')
    : join(process.cwd(), '.screenshots');

  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true });
  }

  // Sanitize `name` into a bare filename before joining it onto screenshotDir.
  // `basename` strips any directory components and the charset filter neutralizes
  // anything left (e.g. a Windows `\` on a POSIX host), so a value like
  // `../../../etc/passwd` can't escape the screenshots directory (path traversal).
  const safeName = basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safeName || safeName === '.' || safeName === '..') {
    return jsonResult(
      { ok: false, error: `Invalid screenshot name: ${name}` },
      true,
    );
  }

  const filePath = join(screenshotDir, `${safeName}.png`);

  try {
    if (selector) {
      // Element screenshot
      const element = await state.page.waitForSelector(selector, {
        timeout: 10_000,
      });
      if (!element) {
        return jsonResult(
          { ok: false, error: `Selector not found: ${selector}` },
          true,
        );
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

    // `name` is dropped: it is `basename(path)` and the agent already has the
    // full `path` (which it passes to browser_screenshot_upload). `fullPage` and
    // `selector` confirm which capture mode ran, so they are kept.
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            ok: true,
            path: filePath,
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
    return jsonResult(
      { ok: false, error: `Screenshot failed: ${message}` },
      true,
    );
  }
}

/** Try to find a worktree path from tracked dev servers. */
function findWorktreePath(): string | undefined {
  const servers = Array.from(state.devServers.values());
  return servers.length > 0 ? servers[0].worktreePath : undefined;
}
