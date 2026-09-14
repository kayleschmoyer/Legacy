/**
 * E2E Tests: global overflow-guard boundary ↔ design-token breakpoint (LS-10114)
 *
 * `apps/web/src/styles.css` carries a raw `@media` block (not routed through
 * Tamagui) that force-scrolls tables, caps image width, and makes
 * `[role="tablist"]` scrollable on narrow screens. It previously fired at a
 * bare `800px` literal that matched no `@legacy-sports/design-tokens` band
 * edge. LS-10114 re-keys it to `799px` — one pixel below `--bp-sm` (800px),
 * the lower bound of the `$sm` compact-tablet band — so the guard is scoped
 * to the `$xs` phone band exactly, the same way `breakpoint-alignment.spec.ts`
 * pins Tamagui's own bands at real viewport widths.
 *
 * This is jest-blind: jsdom doesn't run a real CSS cascade/media evaluation,
 * so only a real browser at the two boundary widths proves the guard flips
 * where the token scale says it should.
 *
 * Probes: plain `<table>`, `<img>`, and `[role="tablist"]` elements injected
 * into a loaded page (so the global stylesheet is in effect) rather than
 * elements from a specific Tamagui component — Tamagui components can set
 * their own inline styles that would confound an assertion about the raw
 * CSS guard itself, which is what this ticket's boundary change is about.
 */

import { expect, leagueTest as test } from '../fixtures/pages';

/** One pixel below `--bp-sm` (800px) — the top of the `$xs` phone band this guard now targets. */
const GUARD_BOUNDARY = 799;
const VIEWPORT_HEIGHT = 900;

interface ProbeStyles {
  tableMinWidth: string;
  imgMaxWidth: string;
  tablistOverflowX: string;
}

async function readProbeStyles(
  page: import('@playwright/test').Page,
): Promise<ProbeStyles> {
  return page.evaluate(() => {
    const table = document.createElement('table');
    const img = document.createElement('img');
    const tablist = document.createElement('div');
    tablist.setAttribute('role', 'tablist');
    document.body.append(table, img, tablist);

    const styles = {
      tableMinWidth: getComputedStyle(table).minWidth,
      imgMaxWidth: getComputedStyle(img).maxWidth,
      tablistOverflowX: getComputedStyle(tablist).overflowX,
    };

    table.remove();
    img.remove();
    tablist.remove();
    return styles;
  });
}

test.describe('Overflow guard — fires on the design-token $xs boundary @regression', () => {
  test(`table, image, and tablist get the guard's scroll/clamp treatment at the boundary (${GUARD_BOUNDARY}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: GUARD_BOUNDARY,
      height: VIEWPORT_HEIGHT,
    });
    await page.goto('/');

    const { tableMinWidth, imgMaxWidth, tablistOverflowX } =
      await readProbeStyles(page);

    expect(tableMinWidth).toBe('max-content');
    expect(imgMaxWidth).toBe('100%');
    expect(tablistOverflowX).toBe('auto');
  });

  test(`table, image, and tablist lose the guard's treatment one pixel above the boundary (${GUARD_BOUNDARY + 1}px)`, async ({
    page,
  }) => {
    // The discriminating case: before this change the guard fired through
    // 800px, so these assertions fail against the old literal.
    await page.setViewportSize({
      width: GUARD_BOUNDARY + 1,
      height: VIEWPORT_HEIGHT,
    });
    await page.goto('/');

    const { tableMinWidth, imgMaxWidth, tablistOverflowX } =
      await readProbeStyles(page);

    expect(tableMinWidth).not.toBe('max-content');
    expect(imgMaxWidth).not.toBe('100%');
    expect(tablistOverflowX).not.toBe('auto');
  });
});
