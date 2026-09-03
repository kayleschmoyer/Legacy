/**
 * E2E tests for the football League Discovery page (/football/leagues) —
 * LS-7634 (GAP-002): the Football Hub's "Browse Leagues" CTA must reach a
 * correctly football-scoped discovery page, not a re-skinned baseball one.
 *
 * Covers:
 * - Header copy reflects football, not "Baseball" text (AC3)
 * - Player-pool filter (NL/AL, a baseball-only concept) is not shown (AC3)
 * - Draft-status filter is still shown (shared UI, unaffected by sport)
 * - Create-league CTA navigates to /football/league/create, not /baseball/... (AC4)
 * - Join flow redirects to /football/league/:id, not /baseball/... (AC4)
 *
 * Mirrors apps/web-e2e/src/tests/league-discovery.spec.ts (the baseball
 * coverage, left unchanged by this ticket to guard against regression — AC6).
 */

import { expect, leagueTest as test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import {
  joinPublicLeagueResponse,
  mockPublicLeague,
  publicLeaguesResponse,
} from '../mocks/graphql/league.mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

type GraphQLHandlers = Record<string, unknown>;

/**
 * Route GraphQL requests by exact operation name (case-insensitive) —
 * `extractOperationName` reads the `operationName` field from the request
 * body, avoiding the substring-match trap of `postData().includes()` (e.g.
 * 'getpublicleagues' matching a hypothetical 'getpublicleaguesbyowner').
 */
async function routeGraphQL(
  page: import('@playwright/test').Page,
  handlers: GraphQLHandlers,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();
    const body = handlers[op];
    if (body) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
      return;
    }
    await unmockedGraphQLFallback(route);
  });
}

test.describe('Football League Discovery — sport scoping (LS-7634) @critical', () => {
  test('shows football header copy, not baseball', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(),
    });

    await leaguePage.gotoDiscovery('football');
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.text(/Football · Public Leagues/i).expectVisible();
    await leaguePage.text(/Baseball · Public Leagues/i).expectHidden();
  });

  test('hides the player-pool (NL/AL) filter but keeps draft-status filters', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(),
    });

    await leaguePage.gotoDiscovery('football');
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.button('All', { exact: true }).expectVisible();
    await leaguePage
      .button('Open (Not Started)', { exact: true })
      .expectVisible();

    await leaguePage.button('NL Only', { exact: true }).expectHidden();
    await leaguePage.button('AL Only', { exact: true }).expectHidden();
    await leaguePage.button('All Leagues', { exact: true }).expectHidden();
  });

  test('Create a League CTA navigates to /football/league/create', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse(),
    });

    await leaguePage.gotoDiscovery('football');
    await leaguePage.expectDiscoveryLoaded();

    // Two "Create a League" buttons render (header + footer CTA) once leagues
    // are populated — disambiguate with .first() (the header button).
    await leaguePage.button('Create a League', { exact: true }).first().tap();

    await expect(page).toHaveURL(/\/football\/league\/create/);
  });

  test('joining a public league redirects to /football/league/:id', async ({
    page,
    leaguePage,
  }) => {
    const league = mockPublicLeague({ id: 55, name: 'Football Only League' });

    await routeGraphQL(page, {
      getpublicleagues: publicLeaguesResponse([league]),
      joinpublicleague: joinPublicLeagueResponse(55),
    });

    await leaguePage.gotoDiscovery('football');
    await leaguePage.expectDiscoveryLoaded();

    const card = leaguePage.cardByName('Football Only League');
    await card.clickJoin();
    await card.expectTeamNamePrompt();
    await card.joinWithTeamName('Blitz Squad');

    await leaguePage.text(/Successfully joined/i).expectVisible();
    await expect(page).toHaveURL(/\/football\/league\/55/, {
      timeout: 5000,
    });
  });
});
