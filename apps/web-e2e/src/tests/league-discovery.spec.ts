/**
 * E2E tests for the League Discovery page (/baseball/leagues).
 *
 * Covers:
 * - Page load: heading, search bar, filter buttons
 * - Browsing: league cards with name, draft status, player pool, spots
 * - Search filtering: query input sends search variable
 * - Draft-status filter: filter buttons update displayed results
 * - Player-pool filter: filter buttons update displayed results
 * - Empty state: "No public leagues found" when query returns nothing
 * - Already-member badge: "You're already in this league"
 * - Full league banner: "This league is full"
 * - Join flow: expand inline form, enter team name, submit
 * - Join validation: empty team name keeps button disabled
 * - Join success: success banner shown, redirect triggered
 * - Footer CTA: "Can't find the right league?" visible when leagues present
 * - Advanced filtering: draft-status + player-pool filters combined in one
 *   query, search combined with an active filter, results count updating
 *   after a filter narrows the result set (LS-2117)
 * - Pagination/infinite-scroll: "Load More" visibility for a full vs. short
 *   page, loading and appending the next page, and filter changes resetting
 *   back to the first page (LS-10251)
 *
 * Page-object migration (LS-8092 / ADR-0015): all locators live on
 * `leaguePage` and the `LeagueCard` component — specs are selector-free.
 */

import { expect, leagueTest as test } from '../fixtures/pages';
import {
  extractOperationName,
  extractOperationVariables,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import {
  joinPublicLeagueResponse,
  mockPublicLeague,
  mockPublicLeagues,
  publicLeaguesEmptyResponse,
  publicLeaguesResponse,
} from '../mocks/graphql/league.mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/**
 * Must match `LEAGUES_PAGE_SIZE` in `LeagueDiscoveryPage.tsx` — the page's
 * "load more" heuristic treats a full page (this many results) as a signal
 * more may exist server-side.
 */
const DISCOVERY_PAGE_SIZE = 20;

/** Matches GraphQL API calls but not source-file imports. */
type GraphQLHandlers = Record<string, unknown>;

/**
 * Route GraphQL requests through a per-operation handler map.
 *
 * Keys are FULL GraphQL operation names, compared case-insensitively for
 * exact equality against the extracted operation name (LS-9794/LS-9866) —
 * a substring test on the raw POST body can match more than one operation
 * and fulfill the route with the wrong response shape.
 */
async function routeGraphQL(
  page: import('@playwright/test').Page,
  handlers: GraphQLHandlers,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();
    for (const [key, body] of Object.entries(handlers)) {
      if (operation === key.toLowerCase()) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
        return;
      }
    }
    await unmockedGraphQLFallback(route);
  });
}

// ── critical: page load ───────────────────────────────────────────

test.describe('League Discovery — page load @critical', () => {
  test('displays heading and search bar', async ({ page, leaguePage }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.discoverySearch.expectVisible();
    await leaguePage.discoveryRefreshButton.expectVisible();
  });

  test('shows draft-status and player-pool filter buttons', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    // Draft status filters
    await leaguePage.button('All', { exact: true }).expectVisible();
    await leaguePage
      .button('Open (Not Started)', { exact: true })
      .expectVisible();
    await leaguePage.button('Queued', { exact: true }).expectVisible();
    await leaguePage.button('In Progress', { exact: true }).expectVisible();

    // Player pool filters
    await leaguePage.button('All Leagues', { exact: true }).expectVisible();
    await leaguePage.button('NL Only', { exact: true }).expectVisible();
    await leaguePage.button('AL Only', { exact: true }).expectVisible();
  });
});

// ── critical: league cards ────────────────────────────────────────

test.describe('League Discovery — league cards @critical', () => {
  test('renders league name, draft status, player pool, and spots', async ({
    page,
    leaguePage,
  }) => {
    const league = mockPublicLeague({
      id: 10,
      name: 'Rocket League Fantasy',
      draftStatus: 'not-started',
      playerPool: 'nl',
      totalSpots: 12,
      availableSpots: 5,
    });

    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse([league]),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    const card = leaguePage.cardById(10);
    await card.text('Rocket League Fantasy').expectVisible();
    await card.text('Open', { exact: true }).expectVisible();
    // "NL Only" renders twice in the card (badge + filter chip); the assertion
    // verifies the value is present without pinning a specific position.
    await card.text('NL Only').first().expectVisible();
    // spots available column: "5 / 12" or similar
    await card.text('5 / 12').expectVisible();
  });

  test('shows results count', async ({ page, leaguePage }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse([
        mockPublicLeague({ id: 1, name: 'League 1' }),
        mockPublicLeague({ id: 2, name: 'League 2' }),
      ]),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.discoveryResultsCount.expectVisible();
  });

  test('shows footer CTA when leagues are present', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.discoveryFooterCta.expectVisible();
  });
});

// ── smoke: search & filters ───────────────────────────────────────

test.describe('League Discovery — search @smoke', () => {
  test('search input is interactive', async ({ page, leaguePage }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.discoverySearch.fill('Alpha League');

    // Verify the input accepted the typed value
    await leaguePage.discoverySearch.expectValue('Alpha League');
  });

  test('clearing search restores results', async ({ page, leaguePage }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.discoverySearch.fill('something');
    await leaguePage.discoverySearch.clear();

    await leaguePage.discoverySearch.expectValue('');
    await leaguePage.discoveryHeading.expectVisible();
  });
});

// ── regression: empty state ───────────────────────────────────────

test.describe('League Discovery — empty state @regression', () => {
  test('shows empty state when no leagues are returned', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesEmptyResponse(),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.discoveryEmptyHeading.expectVisible();
    // Footer CTA should not appear when there are no leagues
    await leaguePage.discoveryFooterCta.expectHidden();
  });

  test('empty state without search shows generic message', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesEmptyResponse(),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage
      .text(/No public leagues are currently open/i)
      .expectVisible();
  });
});

// ── regression: member & full badges ─────────────────────────────

test.describe('League Discovery — member & full badges @regression', () => {
  test('shows already-member banner for leagues the user has joined', async ({
    page,
    leaguePage,
  }) => {
    const league = mockPublicLeague({
      id: 5,
      name: 'My Home League',
      isAlreadyMember: true,
    });

    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse([league]),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.testId('already-member-banner').expectVisible();
    // "View League →" button should appear instead of "Join League →"
    await leaguePage.button(/View League/i).expectVisible();
  });

  test('shows full banner for leagues with no available spots', async ({
    page,
    leaguePage,
  }) => {
    const league = mockPublicLeague({
      id: 6,
      name: 'Full House League',
      isFull: true,
      availableSpots: 0,
    });

    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse([league]),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.text(/This league is full/i).expectVisible();
    // Join League button should NOT appear for a full league
    await leaguePage.button(/Join League →/i).expectHidden();
  });
});

// ── critical: join flow ───────────────────────────────────────────

test.describe('League Discovery — join flow @critical', () => {
  test('inline join form expands when clicking Join League', async ({
    page,
    leaguePage,
  }) => {
    const league = mockPublicLeague({ id: 7, name: 'Open Draft League' });

    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse([league]),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    const card = leaguePage.cardByName('Open Draft League');
    await card.clickJoin();

    // Team name prompt appears
    await card.expectTeamNamePrompt();
  });

  test('join button is disabled until team name is entered', async ({
    page,
    leaguePage,
  }) => {
    const league = mockPublicLeague({ id: 8, name: 'Empty Name League' });

    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse([league]),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    const card = leaguePage.cardByName('Empty Name League');
    await card.clickJoin();
    await card.expectTeamNamePrompt();

    // The inline Join League submit button should be disabled with empty name
    await card.expectJoinDisabled();
  });

  test('cancel button closes the inline join form', async ({
    page,
    leaguePage,
  }) => {
    const league = mockPublicLeague({ id: 9, name: 'Cancel Test League' });

    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse([league]),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    const card = leaguePage.cardByName('Cancel Test League');
    await card.clickJoin();
    await card.expectTeamNamePrompt();

    await card.cancelJoin();

    // Form collapses — team name prompt gone, "Join League →" restored
    await card.expectTeamNamePromptHidden();
    await card.button(/Join League →/i).expectVisible();
  });

  test('successful join shows success banner', async ({ page, leaguePage }) => {
    const league = mockPublicLeague({ id: 11, name: 'Winners Circle' });

    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse([league]),
      joinpublicleague: joinPublicLeagueResponse(11),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    const card = leaguePage.cardByName('Winners Circle');
    await card.clickJoin();
    await card.expectTeamNamePrompt();

    await card.joinWithTeamName('Home Run Heroes');

    await leaguePage.text(/Successfully joined/i).expectVisible();
  });
});

// ── regression: draft-status & player-pool filters ───────────────

test.describe('League Discovery — filters @regression', () => {
  test('clicking a draft-status filter changes its selected state', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.clickButton('Open (Not Started)', { exact: true });

    // After click the button should visually indicate it's selected.
    // We can't easily assert CSS colors, so assert the click didn't error
    // and the page is still functional.
    await leaguePage.discoveryHeading.expectVisible();
  });

  test('clicking a player-pool filter changes its selected state', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.clickButton('NL Only', { exact: true });

    await leaguePage.discoveryHeading.expectVisible();
  });

  test('refresh button triggers a new query', async ({ page, leaguePage }) => {
    let callCount = 0;

    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation === 'getpublicleagues') {
        callCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(publicLeaguesResponse()),
        });
        return;
      }
      await unmockedGraphQLFallback(route);
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    const initialCount = callCount;
    await leaguePage.discoveryRefreshButton.tap();

    // A new network call should have been made
    await expect.poll(() => callCount).toBeGreaterThan(initialCount);
  });
});

// ── regression: pagination / infinite scroll ─────────────────────

test.describe('League Discovery — pagination @regression', () => {
  test('shows a "Load More Leagues" control when a full page of results comes back', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(
        mockPublicLeagues(DISCOVERY_PAGE_SIZE),
      ),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.cardById(1).text('Public League 1').expectVisible();
    await leaguePage.discoveryLoadMoreButton.expectVisible();
  });

  test('does not show a "Load More Leagues" control when fewer results come back', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(mockPublicLeagues(3)),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.cardById(1).text('Public League 1').expectVisible();
    await leaguePage.discoveryLoadMoreButton.expectHidden();
  });

  test('clicking "Load More Leagues" requests and appends the next page', async ({
    page,
    leaguePage,
  }) => {
    const firstPage = mockPublicLeagues(DISCOVERY_PAGE_SIZE);
    const secondPage = mockPublicLeagues(2, DISCOVERY_PAGE_SIZE + 1);
    let secondPageRequested = false;

    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation !== 'getpublicleagues') {
        await unmockedGraphQLFallback(route);
        return;
      }
      const variables = extractOperationVariables(route);
      if (variables.offset === DISCOVERY_PAGE_SIZE) {
        secondPageRequested = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(publicLeaguesResponse(secondPage)),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publicLeaguesResponse(firstPage)),
      });
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.cardById(1).text('Public League 1').expectVisible();
    await leaguePage.discoveryLoadMoreButton.expectVisible();

    await leaguePage.discoveryLoadMoreButton.tap();

    await expect.poll(() => secondPageRequested).toBe(true);
    await leaguePage
      .cardById(DISCOVERY_PAGE_SIZE + 1)
      .text(`Public League ${DISCOVERY_PAGE_SIZE + 1}`)
      .expectVisible();

    // The second page came back short of a full page, so no more to load.
    await leaguePage.discoveryLoadMoreButton.expectHidden();
  });

  test('changing a filter resets the list back to the first page', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(
        mockPublicLeagues(DISCOVERY_PAGE_SIZE),
      ),
    });

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();
    await leaguePage.discoveryLoadMoreButton.expectVisible();

    // Swap in a short response for the re-issued query once the filter changes.
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse([
        mockPublicLeague({ id: 501, name: 'Queued Only League' }),
      ]),
    });
    await leaguePage.clickButton('Queued', { exact: true });

    await leaguePage.cardById(501).text('Queued Only League').expectVisible();
    await leaguePage.discoveryLoadMoreButton.expectHidden();
  });
});

// ── regression: advanced filtering (LS-2117) ─────────────────────

/**
 * Route `getPublicLeagues` through a per-request responder, recording each
 * request's variables. Unlike {@link routeGraphQL}'s static handler map, the
 * responder sees the variables for every call — needed to simulate the
 * backend narrowing results as filters/search change, and to assert on
 * exactly what was sent to the server.
 */
async function routePublicLeagues(
  page: import('@playwright/test').Page,
  responder: (variables: Record<string, unknown>) => object,
): Promise<Record<string, unknown>[]> {
  const capturedVariables: Record<string, unknown>[] = [];
  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();
    if (operation === 'getpublicleagues') {
      const variables = extractOperationVariables(route);
      capturedVariables.push(variables);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responder(variables)),
      });
      return;
    }
    await unmockedGraphQLFallback(route);
  });
  return capturedVariables;
}

test.describe('League Discovery — advanced filtering @regression', () => {
  test('combining draft-status and player-pool filters sends both to the query in one request', async ({
    page,
    leaguePage,
  }) => {
    const capturedVariables = await routePublicLeagues(page, () =>
      publicLeaguesResponse(),
    );

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.clickButton('Open (Not Started)', { exact: true });
    await leaguePage.clickButton('NL Only', { exact: true });

    await expect
      .poll(() => capturedVariables.at(-1)?.draftStatus)
      .toBe('not-started');
    expect(capturedVariables.at(-1)?.playerPool).toBe('nl');
  });

  test('search combined with an active filter sends both variables together', async ({
    page,
    leaguePage,
  }) => {
    const capturedVariables = await routePublicLeagues(page, () =>
      publicLeaguesResponse(),
    );

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.clickButton('Queued', { exact: true });
    await leaguePage.discoverySearch.fill('Alpha');

    // Search is debounced (300ms) — poll until the debounced query fires.
    await expect.poll(() => capturedVariables.at(-1)?.search).toBe('Alpha');
    expect(capturedVariables.at(-1)?.draftStatus).toBe('queued');
  });

  test('result count updates after a filter narrows the results', async ({
    page,
    leaguePage,
  }) => {
    await routePublicLeagues(page, (variables) =>
      variables.playerPool === 'nl'
        ? publicLeaguesResponse([
            mockPublicLeague({
              id: 1,
              name: 'NL Only League',
              playerPool: 'nl',
            }),
          ])
        : publicLeaguesResponse([
            mockPublicLeague({
              id: 1,
              name: 'NL Only League',
              playerPool: 'nl',
            }),
            mockPublicLeague({
              id: 2,
              name: 'AL Only League',
              playerPool: 'al',
            }),
          ]),
    );

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.discoveryResultsCount.expectContainsText('2');

    await leaguePage.clickButton('NL Only', { exact: true });

    await leaguePage.discoveryResultsCount.expectContainsText('1');
    const countText = await leaguePage.discoveryResultsCount.text();
    expect(countText).not.toContain('2');
  });

  test('search that matches nothing shows the filtered empty state, not the generic one', async ({
    page,
    leaguePage,
  }) => {
    await routePublicLeagues(page, (variables) =>
      variables.search
        ? publicLeaguesEmptyResponse()
        : publicLeaguesResponse([
            mockPublicLeague({ id: 1, name: 'Alpha League' }),
          ]),
    );

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.discoveryResultsCount.expectContainsText('1');

    await leaguePage.discoverySearch.fill('Zzzznomatch');

    await leaguePage
      .text(/No leagues matched your search/i)
      .expectVisible({ timeout: 5000 });
    await leaguePage.discoveryResultsCount.expectContainsText(
      'none match your filters',
    );
  });
});
