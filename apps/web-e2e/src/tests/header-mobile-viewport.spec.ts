/**
 * Mobile global header fits phone viewports — E2E Tests (LS-10705)
 *
 * The mobile header row in `apps/web/src/app/app.tsx` is hamburger + league
 * chip + Help + Notifications. The `LeagueSwitcherChip` used `flexShrink: 0`,
 * so a long league name pushed the row past 375px and the Notifications bell
 * rendered at x=364–398 — mostly off-screen and untappable. The chip now
 * shrinks and ellipsizes the name instead.
 *
 * Kept hermetic (GraphQL mocked via `route.fulfill`/`route.fallback`).
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth-enhanced';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { extractOperationName } from '../fixtures/shared-mocks';
import { mockLeague } from '../mocks/graphql/league.mocks';

const LONG_LEAGUE_NAME =
  'The Extraordinarily Long Legacy Sports Dynasty Championship League';

const LEAGUES = [
  mockLeague({ id: 1, name: LONG_LEAGUE_NAME, playerPool: 'baseball' }),
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

for (const width of [320, 375]) {
  test.describe(`mobile header at ${width}px (LS-10705) @regression`, () => {
    test.use({ viewport: { width, height: 667 } });

    test('Notifications bell stays inside the viewport and the league name ellipsizes', async ({
      page,
    }) => {
      await mockUserLeagues(page);
      await page.goto('/help');
      await page.waitForLoadState('load');

      const chip = page
        .getByTestId('league-switcher-chip')
        .filter({ visible: true });
      await expect(chip).toContainText('The Extraordinarily');

      const bell = page
        .getByRole('button', { name: /^Notifications/ })
        .filter({ visible: true });
      await expect(bell).toBeInViewport({ ratio: 1 });
      const right = await bell.evaluate(
        (el) => el.getBoundingClientRect().right,
      );
      expect(right).toBeLessThanOrEqual(
        await page.evaluate(() => window.innerWidth),
      );

      await expect(
        page.getByRole('button', { name: 'Help & support' }).filter({
          visible: true,
        }),
      ).toBeInViewport({ ratio: 1 });

      // The name is truncated rather than pushing controls off-screen.
      const nameTruncated = await chip
        .getByText(LONG_LEAGUE_NAME, { exact: true })
        .evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(nameTruncated).toBe(true);
    });
  });
}
