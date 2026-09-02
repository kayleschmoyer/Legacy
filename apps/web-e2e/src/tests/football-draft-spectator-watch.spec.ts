/**
 * Football Draft Spectator (Watch) Page E2E Tests (LS-9684)
 *
 * Regression coverage for the previously-missing
 * /football/league/:id/draft/watch route: a football league's "Watch Draft"
 * banner (LeagueDetailPageV2's onWatchDraft) navigates here, but no <Route>
 * matched it, so the page rendered blank inside the app shell. This suite
 * confirms the route now renders the same read-only spectator layout the
 * baseball route already covers (see draft-spectator-watch.spec.ts) for a
 * football league.
 *
 * All GraphQL calls are mocked via page.route(); the WebSocket channel is
 * intercepted via page.routeWebSocket() — no real backend required.
 */

import { injectWebSocketUrl } from './helpers/websocket-test-utils';
import { expect, test } from '../fixtures/auth';
import { unauthTest } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { leagueByIdResponse } from '../mocks/graphql';
import { FIXED_NOW_ISO } from '../mocks/time';

const LEAGUE_ID = 77;
const WATCH_URL = `/football/league/${LEAGUE_ID}/draft/watch`;

test.describe('Football Draft Spectator Watch page @critical', () => {
  test('a football league renders the live spectator grid and clock at /football/league/:id/draft/watch', async ({
    page,
  }) => {
    await injectWebSocketUrl(page);

    await createGraphQLRouter(page, {
      getleaguebyid: (route) =>
        fulfillJson(
          route,
          leagueByIdResponse({
            id: LEAGUE_ID,
            name: 'Gridiron Test League',
            sport: 'football',
            isPublic: true,
            draftStatus: 'in-progress',
          }),
        ),
      getlivedraftleaguedraft: (route) =>
        fulfillJson(route, {
          data: {
            getLeagueDraft: {
              __typename: 'Draft',
              id: 1,
              leagueId: LEAGUE_ID,
              draftMode: 'live',
              selectionMethod: 'standard',
              draftOrder: 'snake',
              currentPick: 1,
              pickTimeLimitSeconds: 90,
              currentPickDeadline: null,
              draftStartedAt: FIXED_NOW_ISO,
              draftCompletedAt: null,
              scheduledAt: null,
              createdAt: FIXED_NOW_ISO,
              autoPickDisabled: false,
            },
          },
        }),
      getcurrentdraftpick: (route) =>
        fulfillJson(route, {
          data: {
            getCurrentDraftPick: {
              __typename: 'CurrentDraftPick',
              draftId: 1,
              teamId: 1,
              round: 1,
              pickNumber: 1,
              overallPick: 1,
              isComplete: false,
            },
          },
        }),
      getdraftpicks: (route) =>
        fulfillJson(route, { data: { getDraftPicks: [] } }),
      // leagueTeamsResponse() (shared factory) omits leagueId, which
      // useSpectatorDraftData's leagueTeams filter requires (t.leagueId !=
      // null) — build the response directly so the mocked teams survive
      // that filter and actually render in the grid.
      getleagueteams: (route) =>
        fulfillJson(route, {
          data: {
            leagueTeams: [
              {
                __typename: 'Team',
                id: 1,
                name: 'Home Team',
                leagueId: LEAGUE_ID,
                owner: 1,
              },
              {
                __typename: 'Team',
                id: 2,
                name: 'Away Team',
                leagueId: LEAGUE_ID,
                owner: 2,
              },
            ],
          },
        }),
    });

    // Navigate directly to the football watch route — the route match itself
    // (not just the URL) is what this test guards against regressing.
    await page.goto(WATCH_URL);
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(WATCH_URL);
    await expect(page.getByTestId('spectator-screen')).toBeVisible();
    await expect(page.getByTestId('spectator-top-band')).toBeVisible();
    await expect(page.getByTestId('pick-timer')).toBeVisible();
    // Team 1 (Home Team) is on the clock, so its name legitimately appears in
    // both the top band and the grid header — scope to the top band testid
    // rather than chaining .first() on a text locator (LS-9660: the app
    // mounts desktop AND mobile nav chrome simultaneously, so a bare
    // getByText().first() can silently match a CSS-hidden copy).
    await expect(
      page.getByTestId('spectator-top-band').getByText('Home Team'),
    ).toBeVisible();
    // Away Team is never on the clock in this fixture, so it renders exactly
    // once (the grid's team-order header) — no scoping/disambiguation needed.
    await expect(page.getByText('Away Team')).toBeVisible();
  });
});

unauthTest.describe(
  'Football Draft Spectator Watch page — signed out @critical',
  () => {
    unauthTest(
      'unauthenticated user does not see spectator content at the football watch route',
      async ({ page }) => {
        // The route isn't in main.tsx's PUBLIC_PATHS, so EnhancedAuthGuard
        // renders the login page in-place at this URL without a redirect —
        // mirrors admin-auth-loading-redirect.spec.ts's unauthTest pattern.
        await page.goto(WATCH_URL);
        await page.waitForLoadState('load');

        await expect(page.getByTestId('spectator-screen')).not.toBeVisible({
          timeout: 10000,
        });
      },
    );
  },
);
