/**
 * Skip Link Coverage — Major Pages (LS-2223)
 *
 * Extends skip-to-main-content link testing beyond /about to all major pages,
 * including authenticated league, players, and standings pages.
 *
 * Complements accessibility.spec.ts which covers skip link behaviour on /about.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

/** URL predicate for the GraphQL API endpoint */
function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

async function assertSkipLinkWorks(page: import('@playwright/test').Page) {
  const skipLink = page.getByTestId('skip-link');
  await expect(skipLink).toBeAttached({ timeout: 10000 });
  await expect(skipLink).toHaveAttribute('href', '#main-content');

  const mainContent = page.getByTestId('main-content');
  await expect(mainContent).toBeAttached();

  // Verify the skip link is keyboard-focusable
  await skipLink.focus();
  await expect(skipLink).toBeFocused({ timeout: 5000 });

  // Verify activating the skip link moves focus to #main-content
  await skipLink.press('Enter');
  await expect(mainContent).toBeFocused({ timeout: 5000 });
}

// ---------------------------------------------------------------------------
// Skip Link Coverage Across Major Pages
// ---------------------------------------------------------------------------

test.describe('Skip link coverage across major pages @regression', () => {
  const LEAGUE_ID = 1;

  // Static pages that don't require waiting for data
  const staticPages = [
    { path: '/about', name: 'About' },
    { path: '/help', name: 'Help' },
    { path: '/pricing', name: 'Pricing' },
    { path: '/', name: 'Home' },
  ];

  for (const { path, name } of staticPages) {
    test(`skip link exists on ${name} page`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('load');
      await assertSkipLinkWorks(page);
    });

    test(`main content landmark has tabindex=-1 on ${name} page`, async ({
      page,
    }) => {
      await page.goto(path);
      await page.waitForLoadState('load');
      const main = page.getByTestId('main-content');
      await expect(main).toBeAttached();
      const tabIndex = await main.getAttribute('tabindex');
      expect(tabIndex).toBe('-1');
    });
  }

  // Authenticated data-driven pages
  test('skip link exists on baseball league overview page', async ({
    page,
  }) => {
    await page.goto(`/baseball/league/${LEAGUE_ID}/overview`);
    await page.waitForLoadState('load');
    await assertSkipLinkWorks(page);
  });

  test('skip link exists on players directory page', async ({ page }) => {
    await page.goto('/players');
    await page.waitForLoadState('load');
    await assertSkipLinkWorks(page);
  });

  test('skip link exists on standings page', async ({ page }) => {
    await page.goto(`/baseball/league/${LEAGUE_ID}/standings`);
    await page.waitForLoadState('load');
    await assertSkipLinkWorks(page);
  });

  test('skip link exists on scoreboard page', async ({ page }) => {
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');
    await assertSkipLinkWorks(page);
  });

  test('skip link exists on notifications page', async ({ page }) => {
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        const postData = route.request().postData()?.toLowerCase() ?? '';
        if (postData.includes('getnotificationhistory')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { getNotificationHistory: [] },
            }),
          });
        } else if (postData.includes('markallnotificationsasread')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { markAllNotificationsAsRead: true },
            }),
          });
        } else if (postData.includes('marknotificationasread')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { markNotificationAsRead: true },
            }),
          });
        } else {
          await route.fallback();
        }
      },
    );
    await page.goto('/notifications');
    await page.waitForLoadState('load');
    await assertSkipLinkWorks(page);
  });

  test('skip link exists on preferences page', async ({ page }) => {
    await page.goto('/preferences');
    await page.waitForLoadState('load');
    await assertSkipLinkWorks(page);
  });

  test('skip link exists on league discovery page', async ({ page }) => {
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        const postData = route.request().postData()?.toLowerCase() ?? '';
        if (postData.includes('getpublicleagues')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { publicLeagues: [] },
            }),
          });
        } else {
          await route.fallback();
        }
      },
    );
    await page.goto('/baseball/leagues');
    await page.waitForLoadState('load');
    await assertSkipLinkWorks(page);
  });

  test('activating skip link on help page moves focus to main content', async ({
    page,
  }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');

    const skipLink = page.getByTestId('skip-link');
    await skipLink.focus();
    await expect(skipLink).toBeFocused({ timeout: 5000 });
    await skipLink.press('Enter');

    const main = page.getByTestId('main-content');
    await expect(main).toBeFocused({ timeout: 5000 });
  });
});
