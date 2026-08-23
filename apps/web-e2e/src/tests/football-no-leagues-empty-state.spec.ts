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
import { useTier } from '../fixtures/shared-mocks';

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
    // Free tier: the baseline mock user is premium (LS-5030), and premium +
    // zero leagues now renders the "Welcome, premium subscriber!" state
    // instead (LS-6275/FBH-021) — this spec asserts the generic free-user
    // empty-state copy, so it must pin to free explicitly.
    await useTier(page, 'free');
    await mockUserLeagues(page, []);
    await page.goto('/football');
    await page.waitForLoadState('load');
  });

  test('"No football leagues yet" empty-state copy is shown', async ({
    page,
  }) => {
    await expect(page.getByText('No football leagues yet')).toBeVisible();
    await expect(
      page.getByText(
        'Create your first football league, or join one with an invite code.',
      ),
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

test.describe('Football Premium-Welcome Empty State (LS-6275/FBH-021) @critical', () => {
  test.beforeEach(async ({ page }) => {
    // Premium is the baseline mock tier (LS-5030) — no useTier() opt-in needed.
    await mockUserLeagues(page, []);
    await page.goto('/football');
    await page.waitForLoadState('load');
  });

  test('"Welcome, premium subscriber!" empty-state copy is shown instead of the generic copy', async ({
    page,
  }) => {
    await expect(page.getByText('Welcome, premium subscriber!')).toBeVisible();
    await expect(page.getByText('No football leagues yet')).toHaveCount(0);
  });

  test('"Create your first football league" CTA is still visible and enabled', async ({
    page,
  }) => {
    const cta = page.getByTestId('create-first-league-button');
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();
    await expect(cta).toHaveText('Create your first football league');
  });
});
