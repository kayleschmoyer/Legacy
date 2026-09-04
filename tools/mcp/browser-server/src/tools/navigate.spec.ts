import { afterAll, afterEach, describe, expect, it } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { navigate } from './navigate.js';
import { state } from '../state.js';

const SVG_CONTENT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
  '<rect width="100" height="100" fill="red" /></svg>';

const HTML_CONTENT = '<!doctype html><html><head></head><body>hi</body></html>';

interface NavigateResultPayload {
  ok: boolean;
  error?: string;
  remedy?: string;
  url?: string;
  status?: number | null;
  title?: string;
  viewport?: { width: number; height: number };
}

function parseResult(
  result: Awaited<ReturnType<typeof navigate>>,
): NavigateResultPayload {
  const [entry] = result.content;
  if (entry.type !== 'text') {
    throw new Error(`Expected text content, got ${entry.type}`);
  }
  return JSON.parse(entry.text) as NavigateResultPayload;
}

describe('navigate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'navigate-spec-'));
  const svgPath = join(dir, 'diagram.svg');
  const htmlPath = join(dir, 'page.html');
  writeFileSync(svgPath, SVG_CONTENT);
  writeFileSync(htmlPath, HTML_CONTENT);

  afterEach(async () => {
    // Fully isolate each test's page so a failed navigation in one test
    // (e.g. a stray chrome-error:// transition) can't collide with the next
    // test's in-flight goto.
    if (state.page) {
      await state.page.close();
      state.page = null;
    }
  });

  afterAll(async () => {
    if (state.page) await state.page.close();
    if (state.context) await state.context.close();
    if (state.browser) await state.browser.close();
    state.page = null;
    state.context = null;
    state.browser = null;
    rmSync(dir, { recursive: true, force: true });
  });

  it('navigates a bare .svg file:// URL without throwing and leaves a screenshotable page', async () => {
    const result = await navigate({ url: `file://${svgPath}` });
    const parsed = parseResult(result);
    expect(parsed.ok).toBe(true);
    expect(state.page?.isClosed()).toBe(false);
  }, 30_000);

  it('does not emit the dev-server remedy hint for a failed file:// navigation', async () => {
    const result = await navigate({
      url: 'file:///nonexistent/does-not-exist.svg',
    });
    const parsed = parseResult(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.remedy).not.toMatch(/dev server/i);
  }, 30_000);

  it('still injects the stabilization CSS for HTML navigations', async () => {
    const result = await navigate({ url: `file://${htmlPath}` });
    const parsed = parseResult(result);
    expect(parsed.ok).toBe(true);
    const { page } = state;
    if (!page) throw new Error('Expected an active page after navigation');

    const hasStabilizationStyle = await page.evaluate(() => {
      return Array.from(document.styleSheets).some((sheet) => {
        try {
          return Array.from(sheet.cssRules).some((rule) =>
            rule.cssText.includes('animation-duration'),
          );
        } catch {
          return false;
        }
      });
    });
    expect(hasStabilizationStyle).toBe(true);
  }, 30_000);
});
