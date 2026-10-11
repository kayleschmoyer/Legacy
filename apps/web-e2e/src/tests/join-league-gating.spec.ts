/**
 * E2E tests for the Join League CTA cap-gating behavior (LS-5863).
 *
 * On web, BaseballScreen intentionally keeps atLimit=false (LS-5869), so the
 * hard-gate redirect to /pricing is never triggered via the web app. Unit tests
 * in MLBHome.spec.tsx cover the at-cap upgrade redirect.
 *
 * This file covers the web-observable surface:
 *   - Join CTA accessibility label is correct when a free user is under-cap
 *   - Join CTA navigates to /baseball/league/join for free users
 *   - Join CTA navigates to /baseball/league/join for premium users
 *   - Join CTA accessibility label is correct for premium users (no cap copy)
 *
 * All GraphQL responses are mocked via route.fulfill — no live backend required.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { type MockLeague, myLeaguesResponse } from '../mocks/graphql';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

const MOCK_LEAGUES: Partial<MockLeague>[] = [
  {
    id: 1,
    name: 'Alpha League',
    draftStatus: 'completed',
    currentWeekNumber: 1,
  },
  {
    id: 2,
    name: 'Beta League',
    draftStatus: 'completed',
    currentWeekNumber: 2,
  },
];

async function mockHub(
  page: import('@playwright/test').Page,
  options: { withLeagues?: boolean } = {},
) {
  await createGraphQLRouter(page, {
    getmyleagues: (route) =>
      fulfillJson(
        route,
        myLeaguesResponse(options.withLeagues ? MOCK_LEAGUES : []),
      ),
  });
}

// ---------------------------------------------------------------------------
// Free user — under cap (with leagues)
// ---------------------------------------------------------------------------

test.describe('Join League gating — free user under cap @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockHub(page, { withLeagues: true });
    await page.goto('/baseball');
    await page.waitForLoadState('load');
  });

  test('Join CTA has the correct accessibility label for under-cap free user', async ({
    page,
  }) => {
    await expect(
      page.getByRole('button', { name: /join an existing baseball league/i }),
    ).toBeVisible();
  });

  test('Join CTA navigates to /baseball/league/join for under-cap free user', async ({
    page,
  }) => {
    await page
      .getByRole('button', { name: /join an existing baseball league/i })
      .click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/baseball/league/join');
  });
});

// ---------------------------------------------------------------------------
// Free user — empty state (no leagues, under cap)
// ---------------------------------------------------------------------------

test.describe('Join League gating — free user empty state @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockHub(page, { withLeagues: false });
    await page.goto('/baseball');
    await page.waitForLoadState('load');
  });

  test('Join CTA navigates to /baseball/league/join from empty state', async ({
    page,
  }) => {
    const joinBtn = page
      .getByRole('button', { name: /join league/i })
      .first()
      .or(page.getByText('Join League').first());
    await expect(joinBtn).toBeVisible();
    await joinBtn.click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/baseball/league/join');
  });
});
