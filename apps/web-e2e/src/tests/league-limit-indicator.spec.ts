/**
 * Baseball Home — League Limit / Slots Indicator (LS-5339, LS-5870)
 *
 * The shared `MLBHome` component renders a `leagueCap` indicator ("Your leagues: X/Y")
 * for free-tier users (LS-5869), and an "Unlimited leagues" badge (LS-5870) for premium
 * users via the `isPremium` prop. The web wrapper (`BaseballScreen`) passes `leagueCap`
 * for authenticated free-tier users — with `atLimit` computed from the actual league count
 * (LS-5817) so the Create button is disabled when the cap is reached — and `isPremium`
 * for premium users.
 *
 * These tests cover the web surface for the league-slots context:
 *   - The baseball hub renders all mocked leagues for both free and premium users
 *   - Premium users see the "Unlimited leagues" badge
 *   - The "Create" button is disabled on web when a free-tier user is at the cap (LS-5817)
 *     (web gates creation at the free-tier limit via atLimit)
 *   - The "Your leagues" section heading is always visible
 *   - The league-cap indicator and upgrade CTA are visible for free-tier users
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
    tierFrozenAt: null,
    frozenAt: null,
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
    tierFrozenAt: null,
    frozenAt: null,
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
    tierFrozenAt: null,
    frozenAt: null,
    inviteCode: 'CCC00003',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockThreeLeagues(page: import('@playwright/test').Page) {
  await createGraphQLRouter(page, {
    getuserleagues: (route) =>
      fulfillJson(route, {
        data: {
          userLeagues: THREE_LEAGUES,
          // Authoritative total (LS-9101) — BaseballScreen's cap gate reads
          // this instead of userLeagues.length.
          userLeagueCount: THREE_LEAGUES.length,
        },
      }),
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

    // getByText('Alpha League') is ambiguous — the same name also appears in
    // the header's "Current league" switcher (hidden behind the collapsed
    // mobile nav menu at this viewport), and .first() picks whichever DOM
    // node happens to exist first, which is a race unrelated to this test's
    // intent. Scope to the heading role — only the league card renders an
    // <h3>, so this reliably targets the visible card (LS-6284 review).
    await expect(
      page.getByRole('heading', { name: 'Alpha League' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Beta League' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Gamma League' }),
    ).toBeVisible();
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

  test('Create button is replaced by Upgrade CTA on web for free-tier user at the cap limit (LS-5817)', async ({
    page,
  }) => {
    // LS-5817: BaseballScreen computes atLimit from the real league count.
    // MLBHome swaps the Create button for an "Upgrade" CTA when atCap is true —
    // the Create button is not disabled, it is simply not rendered.
    await useTier(page, 'free');
    await mockThreeLeagues(page);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('button', { name: /create a new baseball league/i }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: /upgrade/i }).first(),
    ).toBeVisible();
  });

  test('baseball hub renders all three mocked leagues for a premium user', async ({
    page,
  }) => {
    await mockThreeLeagues(page);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    // See the free-tier variant of this test above for why the heading role
    // (not getByText().first()) is required here.
    await expect(
      page.getByRole('heading', { name: 'Alpha League' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Beta League' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Gamma League' }),
    ).toBeVisible();
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

  test('league-cap indicator text is visible on web for free-tier users (LS-5869)', async ({
    page,
  }) => {
    // BaseballScreen now passes leagueCap to MLBHome (LS-5869) so that free-tier
    // users see the upgrade affordance. The "Your leagues: X/Y" counter and the
    // "— Upgrade to Premium" link should be present on the web platform.
    await useTier(page, 'free');
    await mockThreeLeagues(page);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    await expect(page.getByText(/Your leagues:/)).toBeVisible();
    await expect(page.getByText(/Upgrade to/i)).toBeVisible();
  });
});
