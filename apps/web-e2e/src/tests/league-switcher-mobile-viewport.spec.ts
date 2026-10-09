/**
 * League switcher dropdown fits phone viewports — E2E Tests (LS-10754)
 *
 * On phones the header `LeagueSwitcherChip` dropdown was a fixed 340px-wide
 * panel anchored to the chip's left edge (~64px in, after the hamburger), so
 * at 375px it ran past the right edge and clipped the Football count,
 * chevrons and "Open lobby". In landscape (667x375) it ran under the fixed
 * MobileBottomBar with no way to scroll — the page behind scrolled instead.
 *
 * The chip is mounted twice in `apps/web/src/app/app.tsx` (desktop nav and
 * mobile header); at these viewports only the mobile instance is visible.
 *
 * Gated to Chromium-based projects: the page-behind-does-not-scroll check
 * drives `mouse.wheel`, which WebKit's mobile emulation does not dispatch.
 *
 * Kept hermetic (GraphQL mocked via `route.fulfill`/`route.fallback`).
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth-enhanced';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { extractOperationName } from '../fixtures/shared-mocks';
import { mockLeague } from '../mocks/graphql/league.mocks';

const BASEBALL_LEAGUE_NAMES = [
  'Iron Horse Dynasty',
  'Deadball Diamonds',
  'Bronx Bombers Legacy',
  'Murderers Row Society',
  'Big Red Machine',
  'Gashouse Gang League',
];

const LEAGUES = [
  ...BASEBALL_LEAGUE_NAMES.map((name, i) =>
    mockLeague({ id: i + 1, name, playerPool: 'baseball' }),
  ),
  mockLeague({
    id: 7,
    name: 'Gridiron Generals',
    sport: 'football',
    playerPool: 'football',
  }),
];

async function mockUserLeagues(page: Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    if (extractOperationName(route).toLowerCase() === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { userLeagues: LEAGUES, userLeagueCount: LEAGUES.length },
        }),
      });
      return;
    }
    await route.fallback();
  });
}

async function openSwitcher(page: Page) {
  await page.goto('/help');
  await page.waitForLoadState('load');
  await page
    .getByTestId('league-switcher-chip')
    .filter({ visible: true })
    .click();
  const panel = page.getByRole('listbox', { name: 'League selector' });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('League switcher fits phone viewports (LS-10754) @regression', () => {
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(
      browserName !== 'chromium',
      'mouse.wheel scrolling is only dispatched reliably in Chromium emulation.',
    );
    await mockUserLeagues(page);
  });

  test.describe('portrait 375x667', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('panel is fully inside the viewport with the Football count and "Open lobby" visible', async ({
      page,
    }) => {
      const panel = await openSwitcher(page);

      const box = await panel.boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
      expect(box.y + box.height).toBeLessThanOrEqual(667);

      const footballTab = panel.getByRole('button', { name: /Football/ });
      await expect(footballTab).toBeInViewport({ ratio: 1 });
      await expect(footballTab).toContainText('1');

      const openLobby = panel.getByText('Open lobby');
      await openLobby.scrollIntoViewIfNeeded();
      await expect(openLobby).toBeInViewport({ ratio: 1 });
    });
  });

  test.describe('landscape 667x375', () => {
    test.use({ viewport: { width: 667, height: 375 } });

    test('every league is reachable by scrolling inside the panel and the page behind does not scroll', async ({
      page,
    }) => {
      const panel = await openSwitcher(page);
      // Guarantee the page itself is scrollable so a chained scroll would show.
      await page.addStyleTag({ content: 'body { min-height: 3000px; }' });

      const bottomBar = page.getByRole('navigation', {
        name: 'Bottom navigation',
      });
      const barBox = await bottomBar.boundingBox();
      const panelBox = await panel.boundingBox();
      expect(barBox).not.toBeNull();
      expect(panelBox).not.toBeNull();
      if (!barBox || !panelBox) return;
      // Panel ends above the fixed bottom bar instead of running under it.
      expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(barBox.y);

      const scrollYBefore = await page.evaluate(() => window.scrollY);
      await page.mouse.move(
        panelBox.x + panelBox.width / 2,
        panelBox.y + panelBox.height / 2,
      );
      // Overscroll well past the panel's end; contain must stop the chain.
      for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 400);

      // Scrolled to the panel's end: its last item is fully visible, and the
      // overscroll did not chain to the page.
      await expect(
        panel.getByRole('button', { name: /Create a new league/ }),
      ).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollYBefore);

      // Every league is reachable by scrolling inside the panel.
      for (const name of BASEBALL_LEAGUE_NAMES) {
        const option = panel.getByRole('option', { name: new RegExp(name) });
        await option.scrollIntoViewIfNeeded();
        await expect(option).toBeInViewport({ ratio: 1 });
      }
    });
  });
});
