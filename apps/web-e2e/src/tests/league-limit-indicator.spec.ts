/**
 * Baseball Home — League Limit / Slots Indicator (LS-5339, LS-5870)
 *
 * The shared `MLBHome` component renders a `leagueCap` indicator ("Your leagues: X/Y")
 * for free-tier users, and an "Unlimited leagues" badge (LS-5870) for premium users
 * via the `isPremium` prop. The web wrapper (`BaseballScreen`) passes `leagueCap`
 * for authenticated users and `isPremium` for premium users.
 *
 * These tests cover the web surface for the league-slots context:
 *   - The baseball hub renders all mocked leagues for both free and premium users
 *   - Premium users see the "Unlimited leagues" badge
 *   - The "Create" button is present and enabled regardless of league count on web
 *     (the web wrapper does not gate creation by the free-tier cap)
 *   - The "Your leagues" section heading is always visible
 *
 * GraphQL responses are mocked via route.fulfill() — no live backend required.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { useTier } from '../fixtures/shared-mocks';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Mock data: three leagues (the free-tier cap limit)
// ---------------------------------------------------------------------------

const THREE_LEAGUES = [
  {
    __typename: 'League',
    id: 1,
    name: 'Alpha League',
    sport: 'baseball',
    draftStatus: 'completed',
    currentWeekNumber: 7,
    weekAdvanceStatus: null,
    maxRosterSize: 25,
    inviteCode: 'AAA00001',
  },
  {
    __typename: 'League',
    id: 2,
    name: 'Beta League',
    sport: 'baseball',
    draftStatus: 'not-started',
    currentWeekNumber: null,
    weekAdvanceStatus: null,
    maxRosterSize: 25,
    inviteCode: 'BBB00002',
  },
  {
    __typename: 'League',
    id: 3,
    name: 'Gamma League',
    sport: 'baseball',
    draftStatus: 'in-progress',
    currentWeekNumber: null,
    weekAdvanceStatus: null,
    maxRosterSize: 25,
    inviteCode: 'CCC00003',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockThreeLeagues(page: import('@playwright/test').Page) {
  await createGraphQLRouter(page, {
    getuserleagues: (route) =>
      fulfillJson(route, { data: { userLeagues: THREE_LEAGUES } }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Baseball Home — league slots context (LS-5339) @regression', () => {
  test('baseball hub renders all three mocked leagues for a free-tier user', async ({
    page,
  }) => {
    await useTier(page, 'free');
    await mockThreeLeagues(page);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    await expect(page.getByText('Alpha League').first()).toBeVisible();
    await expect(page.getByText('Beta League').first()).toBeVisible();
    await expect(page.getByText('Gamma League').first()).toBeVisible();
  });

  test('"Your Leagues" section heading is visible for a free-tier user with three leagues', async ({
    page,
  }) => {
    await useTier(page, 'free');
    await mockThreeLeagues(page);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /your leagues/i }),
    ).toBeVisible();
  });

  test('Create button is present and enabled on web for free-tier user at the cap limit', async ({
    page,
  }) => {
    // The web BaseballScreen does not pass leagueCap to MLBHome, so the
    // Create button is never disabled by the free-tier cap on this platform.
    await useTier(page, 'free');
    await mockThreeLeagues(page);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    const createBtn = page
      .getByRole('button', { name: /create a new baseball league/i })
      .first();
    await expect(createBtn).toBeVisible();
    await expect(createBtn).toBeEnabled();
  });

  test('baseball hub renders all three mocked leagues for a premium user', async ({
    page,
  }) => {
    await mockThreeLeagues(page);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    await expect(page.getByText('Alpha League').first()).toBeVisible();
    await expect(page.getByText('Beta League').first()).toBeVisible();
    await expect(page.getByText('Gamma League').first()).toBeVisible();
  });

  test('premium user sees "Unlimited leagues" badge on the baseball home page', async ({
    page,
  }) => {
    await mockThreeLeagues(page);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    await expect(page.getByText('Unlimited leagues')).toBeVisible();
    await expect(page.getByText(/Your leagues:/)).not.toBeVisible();
  });

  test('league-cap indicator text is absent on web (cap UI is mobile-only)', async ({
    page,
  }) => {
    // The shared MLBHome cap indicator ("Your leagues: X/Y") is only rendered
    // when leagueCap is passed. BaseballScreen does not pass it, so the text
    // must never appear on the web platform regardless of league count or tier.
    await useTier(page, 'free');
    await mockThreeLeagues(page);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    await expect(page.getByText(/Your leagues:/)).not.toBeVisible();
  });
});
