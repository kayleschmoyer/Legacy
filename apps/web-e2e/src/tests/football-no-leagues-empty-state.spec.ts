/**
 * Football No-Leagues Empty State — E2E Tests (LS-5409)
 *
 * Covers the "Your Football Leagues" empty state on the Football Home page
 * (/football) for a user with zero football leagues: the encouraging copy
 * renders and the "Create your first football league" CTA is visible and
 * enabled. GraphQL responses are mocked hermetically via route.fulfill() so
 * no live backend is required.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

async function mockUserLeagues(
  page: import('@playwright/test').Page,
  leagues: object[],
) {
  await createGraphQLRouter(page, {
    getuserleagues: (route) =>
      fulfillJson(route, {
        data: { userLeagues: leagues, userLeagueCount: leagues.length },
      }),
  });
}

test.describe('Football No-Leagues Empty State (LS-5409) @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockUserLeagues(page, []);
    await page.goto('/football');
    await page.waitForLoadState('load');
  });

  test('"No football leagues yet" empty-state copy is shown', async ({
    page,
  }) => {
    await expect(page.getByText('No football leagues yet')).toBeVisible();
    await expect(
      page.getByText('Create your first football league to get started.'),
    ).toBeVisible();
  });

  test('"Create your first football league" CTA is visible and enabled', async ({
    page,
  }) => {
    const cta = page.getByTestId('create-first-league-button');
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();
    await expect(cta).toHaveText('Create your first football league');
  });

  test('clicking the empty-state CTA navigates to league creation', async ({
    page,
  }) => {
    await page.getByTestId('create-first-league-button').click();
    await expect(page).toHaveURL('/football/league/create');
  });
});
