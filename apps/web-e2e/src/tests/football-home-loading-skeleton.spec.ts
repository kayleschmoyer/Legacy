/**
 * Football Home Loading Skeleton — E2E Test (LS-5410)
 *
 * Covers the "Football Home Loading Skeleton" Feature Story under the
 * Football Home QA epic (LS-5267): as any user on a slow connection, a
 * loading skeleton renders in the "Your Football Leagues" panel while the
 * leagues query is in flight, so the page does not appear broken, and the
 * skeleton is replaced by the resolved league list once data arrives.
 *
 * GraphQL responses are mocked hermetically via route.fulfill() (never
 * route.continue()).
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

const MOCK_LEAGUES = [
  {
    __typename: 'League',
    id: 201,
    name: 'Gridiron Legends',
    sport: 'football',
    draftStatus: 'completed',
    currentWeekNumber: 5,
    weekAdvanceStatus: null,
    maxRosterSize: 16,
  },
];

/**
 * Register a GetUserLeagues handler that waits for `resolve()` to be called
 * before fulfilling — lets a test hold the query open to observe the
 * skeleton, then let it resolve on demand.
 */
async function mockDelayedUserLeagues(
  page: import('@playwright/test').Page,
): Promise<{ resolveQuery: () => void }> {
  let resolveQuery!: () => void;
  const gate = new Promise<void>((resolve) => {
    resolveQuery = resolve;
  });

  await createGraphQLRouter(page, {
    getuserleagues: async (route) => {
      await gate;
      await fulfillJson(route, {
        data: {
          userLeagues: MOCK_LEAGUES,
          userLeagueCount: MOCK_LEAGUES.length,
        },
      });
    },
  });

  return { resolveQuery };
}

test.describe('Football Home Loading Skeleton (LS-5410) @regression', () => {
  test('skeleton renders while leagues load, then is replaced by the resolved league list', async ({
    page,
  }) => {
    const { resolveQuery } = await mockDelayedUserLeagues(page);

    await page.goto('/football');
    await page.waitForLoadState('domcontentloaded');

    // While GetUserLeagues is in flight, the skeleton is visible and no
    // league row or empty-state copy has rendered yet.
    await expect(page.getByTestId('football-leagues-skeleton')).toBeVisible();
    await expect(page.getByTestId('football-league-row-201')).not.toBeVisible();

    // Let the query resolve.
    resolveQuery();

    // The skeleton is replaced by the resolved league list.
    await expect(page.getByTestId('football-league-row-201')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByTestId('football-leagues-skeleton'),
    ).not.toBeVisible();
    await expect(
      page.getByTestId('football-league-row-201').getByText('Gridiron Legends'),
    ).toBeVisible();
  });
});
