/**
 * Matchup Detail Page E2E Tests (LS-675)
 *
 * Covers /baseball/league/:leagueId/matchups/:matchupId:
 *   - Scoreboard, roster comparison, win probability panel
 *   - Week navigation controls
 *   - Loading / error / not-found states
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// Page-object migration (LS-8451 / ADR-0016): matchup detail assertions speak
// `matchupPage` driver verbs so the spec is selector-free and native-ready.
// `page` is retained only for GraphQL route mocking (a web-only capability),
// URL assertions, and the web-only page-meta (<title>/<head>) and loading-nav
// surfaces documented inline below.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 10;
const MATCHUP_URL = `/baseball/league/${LEAGUE_ID}/matchups/${MATCHUP_ID}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_MATCHUP = {
  __typename: 'Matchup',
  id: MATCHUP_ID,
  leagueId: LEAGUE_ID,
  weekNumber: 3,
  team1Id: 1,
  team2Id: 2,
  team1Score: 42.5,
  team2Score: 38.1,
  status: 'in_progress',
  statsLoadingStatus: 'complete',
  gamesPerMatchup: 7,
  pitcherStartsPerMatchup: 2,
  selectedGamesCount: 4,
  startTime: null,
  endTime: null,
  winProbability: null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 1,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Force',
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 2,
  },
];

const MOCK_MATCHUPS_FOR_LEAGUE = [MOCK_MATCHUP];

async function mockMatchupGraphQL(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route);

      if (op === 'GetMatchupById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupById: MOCK_MATCHUP } }),
        });
      } else if (op === 'GetMatchupsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupsForLeague: MOCK_MATCHUPS_FOR_LEAGUE },
          }),
        });
      } else if (op === 'GetCurrentWeekForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: 3 } }),
        });
      } else if (op === 'GetUserTeamId') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
      } else if (op === 'GetLeagueTeams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Tests – page loading & structure
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – page structure @smoke', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockMatchupGraphQL(page);
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID);
  });

  test('loads the matchup detail page without errors', async ({
    page,
    matchupPage,
  }) => {
    await expect(page).toHaveURL(MATCHUP_URL);
    await matchupPage.expectNoAppError();
  });

  test('shows Matchup Details heading', async ({ matchupPage }) => {
    await matchupPage.heading(/matchup details/i).expectVisible();
  });

  test('shows Back to League button', async ({ matchupPage }) => {
    await matchupPage.button(/back to league/i).expectVisible();
  });

  test('clicking Back to League navigates back', async ({
    page,
    matchupPage,
  }) => {
    await matchupPage.goBackToLeague();
    await expect(page).toHaveURL(`/baseball/league/${LEAGUE_ID}`);
  });
});

// ---------------------------------------------------------------------------
// Tests – page meta (dynamic title + description) (LS-5354)
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – page meta @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockMatchupGraphQL(page);
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID);
  });

  test('sets a dynamic document title reflecting the matchup week', async ({
    page,
  }) => {
    // MOCK_MATCHUP.weekNumber === 3, so PageMeta renders
    // "Week 3 Matchup | Legacy Sports".
    // web-only (ADR-0016 §4): no portable expression
    await expect(page).toHaveTitle(/Week 3 Matchup \| Legacy Sports/);
  });

  test('sets a meta description mentioning the matchup week', async ({
    page,
  }) => {
    // The static index.html ships a default description meta; PageMeta injects
    // a second, matchup-specific one. Scope to the dynamic tag by its content
    // ("matchup" appears only in PageMeta's description) so the strict-mode
    // locator resolves to exactly one element.
    // web-only (ADR-0016 §4): no portable expression
    await expect(
      page.locator('head > meta[name="description"][content*="matchup"]'),
    ).toHaveAttribute('content', /Week 3 .*matchup/i);
  });
});

// ---------------------------------------------------------------------------
// Tests – matchup content with mocked data
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – scoreboard @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockMatchupGraphQL(page);
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID);
  });

  test('does not show loading skeleton after data loads', async ({
    matchupPage,
  }) => {
    await matchupPage.loadingIndicator.expectHidden();
  });

  test('does not show not-found state', async ({ matchupPage }) => {
    await matchupPage.text('Matchup not found').expectHidden();
  });

  test('renders main matchup content area', async ({ matchupPage }) => {
    // The main content area has role="main" aria-label="Matchup details"
    await matchupPage.mainRegion.expectVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests – loading state
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – loading state @regression', () => {
  test('shows loading skeleton while data is pending', async ({
    page,
    matchupPage,
  }) => {
    // Intercept the matchup query with a long delay so the loading state
    // is reliably visible. Register the catch-all first, then the delay
    // route — Playwright evaluates routes in LIFO order (last registered
    // wins), so the delay route takes priority for the matchup query.
    let resolveMatchup: (() => void) | undefined;
    const matchupGate = new Promise<void>((r) => {
      resolveMatchup = r;
    });

    // Catch-all for every other GraphQL operation (lower priority)
    await mockMatchupGraphQL(page);

    // Delay route for the matchup query (higher priority — registered last)
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        const postData = route.request().postData()?.toLowerCase() ?? '';
        if (
          postData.includes('getmatchupbyid') ||
          postData.includes('matchupbyid')
        ) {
          // Hold the response until we've asserted the loading state
          await matchupGate;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { getMatchupById: MOCK_MATCHUP } }),
          });
        } else {
          await unmockedGraphQLFallback(route);
        }
      },
    );

    // web-only timing: gate the skeleton before the mocked query resolves
    await page.goto(MATCHUP_URL, { waitUntil: 'commit' });

    // The loading branch renders the layout-matching skeleton. Allow more
    // time — V2 main bundle hydration plus the Apollo query setup can take
    // several seconds before the loading branch paints when the network
    // request is gated.
    await matchupPage.loadingIndicator.expectVisible({
      timeout: 15_000,
    });

    // Release the gate so the page can finish loading and cleanup
    if (resolveMatchup) resolveMatchup();
  });
});

// ---------------------------------------------------------------------------
// Tests – error state
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – error state @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (
        postData.includes('getmatchupbyid') ||
        postData.includes('matchupbyid')
      ) {
        // GraphQL errors array present — Apollo's default errorPolicy
        // ('none') always surfaces this as the `error` branch, regardless
        // of `data.getMatchupById`.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupById: null },
            errors: [{ message: 'Matchup not found' }],
          }),
        });
      } else {
        // Stub all other operations so the test isolates the error path
        await unmockedGraphQLFallback(route);
      }
    });

    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID);
  });

  test('shows error message when GraphQL returns an error', async ({
    matchupPage,
  }) => {
    await matchupPage.text(/error loading matchup/i).expectVisible();
  });

  test('shows Back to League button and navigates back', async ({
    page,
    matchupPage,
  }) => {
    await matchupPage.button(/back to league/i).expectVisible();
    await matchupPage.goBackToLeague();
    await expect(page).toHaveURL(`/baseball/league/${LEAGUE_ID}`);
  });
});

// ---------------------------------------------------------------------------
// Tests – not-found state
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – not-found state @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (
        postData.includes('getmatchupbyid') ||
        postData.includes('matchupbyid')
      ) {
        // No errors array — exercises the true `!matchup` not-found branch,
        // distinct from the GraphQL-error branch above.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupById: null } }),
        });
      } else {
        // Stub all other operations so the test isolates the not-found path
        await unmockedGraphQLFallback(route);
      }
    });

    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID);
  });

  test('shows Matchup not found message', async ({ matchupPage }) => {
    await matchupPage.text('Matchup not found').expectVisible();
  });

  test('shows Back to League button and navigates back', async ({
    page,
    matchupPage,
  }) => {
    await matchupPage.button(/back to league/i).expectVisible();
    await matchupPage.goBackToLeague();
    await expect(page).toHaveURL(`/baseball/league/${LEAGUE_ID}`);
  });
});

// ---------------------------------------------------------------------------
// Tests – scoreboard stale-scores warning (LS-4038)
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – stale-scores warning @regression', () => {
  test('shows warning banner when getMatchupPlayers query errors', async ({
    page,
    matchupPage,
  }) => {
    // Mock everything normally except getMatchupPlayers, which returns an
    // error so MatchupScoreboard falls back to the matchup's stored scores
    // and must surface a visible warning to the user (LS-4038).
    await page.route(isGraphQLEndpoint, async (route) => {
      const op = extractOperationName(route);

      if (op === 'GetMatchupPlayers') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupPlayers: null },
            errors: [{ message: 'Failed to load player stats' }],
          }),
        });
      } else if (op === 'GetMatchupById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupById: MOCK_MATCHUP } }),
        });
      } else if (op === 'GetMatchupsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupsForLeague: MOCK_MATCHUPS_FOR_LEAGUE },
          }),
        });
      } else if (op === 'GetLeagueTeams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
      } else if (op === 'GetCurrentWeekForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: 3 } }),
        });
      } else if (op === 'GetUserTeamId') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
      } else if (op === 'GetMatchupWinProbability') {
        // Without __typename here, this write isn't normalizable to the
        // same `Matchup:{id}` cache entity as GetMatchupById's response —
        // Apollo instead replaces the whole `getMatchupById` ROOT_QUERY
        // field with this sparse object, permanently starving GetMatchupById
        // of its other fields and leaving the page stuck loading.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              getMatchupById: {
                __typename: 'Matchup',
                id: MATCHUP_ID,
                winProbability: null,
              },
            },
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID);

    // The banner only paints after GetMatchupById, GetMatchupPlayers (error),
    // and the scoreboard's own re-render have all settled — three chained
    // round trips. The suite's global 3s expect timeout is tight for that
    // chain under load; give this one assertion more headroom, matching the
    // loading-skeleton test above.
    await matchupPage
      .text(/live stats unavailable.*last saved scores/i)
      .expectVisible({ timeout: 10_000 });
  });
});
