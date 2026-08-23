/**
 * Active Football Leagues List — E2E Tests (LS-5406)
 *
 * Covers the "Your Football Leagues" section on the Football Home page
 * (/football). GraphQL responses are mocked hermetically via route.fulfill()
 * so no live backend is required.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

const MOCK_LEAGUES = [
  {
    __typename: 'League',
    id: 201,
    name: 'Gridiron Generals',
    sport: 'football',
    draftStatus: 'not-started',
    currentWeekNumber: null,
    weekAdvanceStatus: null,
    maxRosterSize: 16,
    tierFrozenAt: null,
    frozenAt: null,
    inviteCode: 'AAA00201',
  },
  {
    __typename: 'League',
    id: 202,
    name: 'Blitz Brigade',
    sport: 'football',
    draftStatus: 'completed',
    currentWeekNumber: 5,
    weekAdvanceStatus: null,
    maxRosterSize: 16,
    tierFrozenAt: null,
    frozenAt: null,
    inviteCode: 'BBB00202',
  },
  {
    __typename: 'League',
    id: 203,
    name: 'Endzone Elite',
    sport: 'football',
    draftStatus: 'completed',
    currentWeekNumber: 5,
    weekAdvanceStatus: null,
    maxRosterSize: 16,
    tierFrozenAt: null,
    frozenAt: null,
    inviteCode: 'CCC00203',
  },
];

async function mockUserLeagues(
  page: import('@playwright/test').Page,
  leagues: typeof MOCK_LEAGUES | [],
) {
  await createGraphQLRouter(page, {
    getuserleagues: (route) =>
      fulfillJson(route, {
        data: { userLeagues: leagues, userLeagueCount: leagues.length },
      }),
  });
}

test.describe('Active Football Leagues List (LS-5406) @regression', () => {
  test('"Your Football Leagues" heading is visible on the football home page', async ({
    page,
  }) => {
    await mockUserLeagues(page, MOCK_LEAGUES);
    await page.goto('/football');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /your football leagues/i }),
    ).toBeVisible();
  });

  test('active leagues list renders one row per mocked league and no empty-state copy is shown', async ({
    page,
  }) => {
    await mockUserLeagues(page, MOCK_LEAGUES);
    await page.goto('/football');
    await page.waitForLoadState('load');

    const scroller = page.getByTestId('football-leagues-virtual-scroller');
    await expect(scroller.getByText('Gridiron Generals')).toBeVisible();
    await expect(scroller.getByText('Blitz Brigade')).toBeVisible();
    await expect(scroller.getByText('Endzone Elite')).toBeVisible();

    await expect(page.getByText('No football leagues yet')).toHaveCount(0);
  });

  test('search field filters the league list by name', async ({ page }) => {
    await mockUserLeagues(page, MOCK_LEAGUES);
    await page.goto('/football');
    await page.waitForLoadState('load');

    const search = page.getByPlaceholder(/search leagues/i);
    await expect(search).toBeVisible();
    // Use pressSequentially so Tamagui's onChangeText fires on each keystroke
    await search.click();
    await search.pressSequentially('Blitz');

    const scroller = page.getByTestId('football-leagues-virtual-scroller');
    await expect(scroller.getByText('Blitz Brigade')).toBeVisible();
    await expect(scroller.getByText('Gridiron Generals')).not.toBeVisible();
    await expect(scroller.getByText('Endzone Elite')).not.toBeVisible();
  });

  test('archived leagues section is collapsed by default and expands to reveal frozen leagues (LS-6262 / FBH-008)', async ({
    page,
  }) => {
    const frozenLeague = {
      __typename: 'League',
      id: 204,
      name: 'Retired Renegades',
      sport: 'football',
      draftStatus: 'completed',
      currentWeekNumber: 10,
      weekAdvanceStatus: null,
      maxRosterSize: 16,
      tierFrozenAt: '2024-03-01T00:00:00.000Z',
      frozenAt: null,
      inviteCode: 'DDD00204',
    };
    await mockUserLeagues(page, [...MOCK_LEAGUES, frozenLeague]);
    await page.goto('/football');
    await page.waitForLoadState('load');

    await expect(page.getByText('Retired Renegades')).not.toBeVisible();
    const toggle = page.getByText(/Archived leagues \(1\)/);
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(page.getByText('Retired Renegades')).toBeVisible();
  });
});

// /football is not in PUBLIC_PATHS/PUBLIC_EXACT_PATHS (apps/web/src/main.tsx)
// — unlike /baseball, which is explicitly public — so EnhancedAuthGuard
// intercepts unauthenticated visitors before FootballHubPage ever renders.
// Mirrors the equivalent protected-route assertion in football-hub.spec.ts
// (LS-4153) for /football/league/create.
unauthTest.describe(
  '/football — protected route shows login page (LS-5406)',
  () => {
    unauthTest(
      'unauthenticated user visiting /football sees the login page',
      async ({ page }) => {
        await page.goto('/football');
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );
  },
);
