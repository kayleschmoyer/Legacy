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

    // LS-9793: this deep link deliberately uses a NON-DEFAULT sort.
    // `sortBy=homeRuns&sortDir=desc` is exactly DEFAULT_BATTING_SORT_BY /
    // DEFAULT_BATTING_SORT_DIR, and `battingSortFilter()` strips the sort pair
    // from the canonical URL when it equals the default so a default view stays
    // clean. Asserting those params survive therefore asserts the opposite of
    // the intended behavior. `rbi`/`asc` is a real, non-default batting sort
    // field, so it genuinely has to round-trip — which is what this test is
    // actually for.
    await page.goto(
      '/players/stats?view=hitters&minHomeRuns=20&sortBy=rbi&sortDir=asc',
    );

    // Assert each param independently. PlayerStatsPage re-serializes the query
    // string in deterministic ALPHABETICAL order (PST-104) and adds its own
    // canonical params (`v`, `pageSize`, `sport`), so a single ordered regex
    // over the whole URL encodes an ordering the app never promised — the
    // previous `view=hitters.*minHomeRuns=20.*sortBy=...` form could not match
    // the canonical output regardless of the sort value.
    await expect(page).toHaveURL(/\/players\?/);
    await expect(page).toHaveURL(/[?&]view=hitters(&|$)/);
    await expect(page).toHaveURL(/[?&]minHomeRuns=20(&|$)/);
    await expect(page).toHaveURL(/[?&]sortBy=rbi(&|$)/);
    await expect(page).toHaveURL(/[?&]sortDir=asc(&|$)/);
    await playersPage.stats.expectLoaded();
  });

  test('redirects a bare /players/stats (no query string) to /players', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page);

    await page.goto('/players/stats');

    // LS-9793: assert the PATH, not the absence of a query string.
    // PlayerStatsPage canonicalizes the URL on mount and appends its own
    // params (`v`, `view`, `pageSize`, `sport`), so `/\/players$/` only holds
    // in the brief window before that write. An auto-retrying assertion that
    // requires a TRANSIENT state is a race by construction — it can catch the
    // window, and once the params land it can never match again. Measured 5/5
    // failures in one run and a pass in another on the same commit.
    // The contract under test is the redirect itself: we end up on /players
    // and not on /players/stats.
    await expect(page).toHaveURL(/\/players(\?|$)/);
    await expect(page).not.toHaveURL(/\/players\/stats/);
    await playersPage.stats.expectLoaded();
  });
});
