/**
 * /players/stats → /players redirect (LS-9076)
 *
 * `/players/stats` is now a permanent client-side redirect to the canonical
 * `/players` route. These tests lock in that the full query string survives
 * the redirect — a dropped param would silently break every indexed page,
 * bookmark, and Share-button link minted under the old URL.
 *
 * All GraphQL responses are mocked with route.fulfill() per hermetic-test policy.
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const MOCK_PAGE_INFO = {
  __typename: 'PageInfo',
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

async function mockPlayerStatsGraphQL(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route) => {
    const opName = extractOperationName(route).toLowerCase();

    if (opName === 'getcareerbattingstats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            careerBattingStats: {
              __typename: 'CareerBattingConnection',
              totalCount: 0,
              edges: [],
              pageInfo: MOCK_PAGE_INFO,
            },
          },
        }),
      });
    } else if (opName === 'getcareerpitchingstatscount') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { careerPitchingStatsCount: 0 } }),
      });
    } else if (opName === 'getcareerpitchingstats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { careerPitchingStats: [] } }),
      });
    } else if (opName === 'getusers' || opName === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('/players/stats redirect @regression', () => {
  test('redirects to /players, preserving every query param', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page);

    await page.goto(
      '/players/stats?view=hitters&minHomeRuns=20&sortBy=homeRuns&sortDir=desc',
    );

    await expect(page).toHaveURL(
      /\/players\?.*view=hitters.*minHomeRuns=20.*sortBy=homeRuns.*sortDir=desc/,
    );
    await playersPage.stats.expectLoaded();
  });

  test('redirects a bare /players/stats (no query string) to /players', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page);

    await page.goto('/players/stats');

    await expect(page).toHaveURL(/\/players$/);
    await playersPage.stats.expectLoaded();
  });
});
