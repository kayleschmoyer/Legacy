import { state } from '../state.js';
import { jsonResult } from '../format.js';
import { launchChromium } from '../launch-chromium.js';
import type { ToolResult } from '../types.js';

export interface NavigateParams {
  url: string;
  port?: number;
  viewport?: { width: number; height: number };
}

/** CSS injected to stabilize screenshots — hides dynamic content and disables animations. */
const SNAPSHOT_PREP_CSS = `
  /* Hide dynamic elements that change between runs */
  [data-testid="timestamp"],
  .timestamp,
  .time,
  [class*="time"],
  [id*="time"],
  [data-testid="current-time"],
  .loading-spinner,
  .spinner,
  .animate-spin,
  [class*="animate"],
  [data-testid="loading"] {
    visibility: hidden !important;
  }

  /* Disable animations for consistent snapshots.
     Do NOT reset transform here: static rotations/translations are real layout
     (e.g. rotated labels) and suppressing them makes screenshots lie (LS-9051). */
  *,
  *::before,
  *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }

  /* Hide scrollbars */
  ::-webkit-scrollbar {
    display: none !important;
  }

  /* Ensure consistent focus states */
  *:focus {
    outline: 2px solid #0066cc !important;
    outline-offset: 2px !important;
  }
`;

export async function navigate(params: NavigateParams): Promise<ToolResult> {
  const { port, viewport } = params;
  let { url } = params;

  // If a relative URL is given and a port is specified, build a full URL
  if (port && !url.startsWith('http')) {
    url = `http://localhost:${port}${url.startsWith('/') ? url : `/${url}`}`;
  }

  try {
    // Lazy-initialize browser
    if (!state.browser) {
      state.browser = await launchChromium();
    }

    // Create or reuse context
    if (!state.context) {
      state.context = await state.browser.newContext({
        viewport: viewport ?? { width: 1280, height: 720 },
      });
    } else if (viewport) {
      // Close old context and create new one with requested viewport
      if (state.page) {
        await state.page.close();
        state.page = null;
      }
      await state.context.close();
      state.context = await state.browser.newContext({ viewport });
    }

    // Create or reuse page
    if (!state.page || state.page.isClosed()) {
      state.page = await state.context.newPage();
    }

    // Navigate
    const response = await state.page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });

    // Inject snapshot prep CSS — skipped for non-HTML documents (e.g. a bare
    // .svg/.xml file rendered natively), which have no <head> to append to.
    const hasHead = await state.page.evaluate(() => document.head !== null);
    if (hasHead) {
      await state.page.addStyleTag({ content: SNAPSHOT_PREP_CSS });
    }

    const status = response?.status() ?? null;
    const title = await state.page.title();

    return jsonResult({
      ok: true,
      url: state.page.url(),
      status,
      title,
      viewport: viewport ?? { width: 1280, height: 720 },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFileUrl = url.startsWith('file://');
    return jsonResult(
      {
        ok: false,
        error: `Navigation failed: ${message}`,
        remedy: isFileUrl
          ? 'Verify the file:// path exists and is readable.'
          : 'Ensure the dev server is running (browser_dev_start) and the URL is correct.',
      },
      true,
    );
  }
}
