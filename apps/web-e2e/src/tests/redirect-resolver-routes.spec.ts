/**
 * Redirect / resolver routes — E2E Tests (LS-8464)
 *
 * Fills the coverage gap for the app's resolver + legacy-alias routes:
 *   • /matchup/:matchupId  → MatchupRedirectPage  → canonical league matchup URL
 *   • /standings           → StandingsRedirectPage → current league standings tab
 *   • /home  → /                          (legacy alias)
 *   • /draft/mock → /baseball/mock-draft   (legacy alias)
 *
 * Hermetic: every GraphQL operation is mocked via route.fulfill() (ADR-0015 §6 —
 * mocking lives in the spec, never the page object). Element access and content
 * assertions go through the driver-typed {@link RedirectResolverPage} (ADR-0016);
 * the canonical URL shapes come from the shared `canonical-routes` module so the
 * web assertions and the native `+native-intent.ts` rewrites (LS-8453) assert
 * identical targets. The redirect's final URL is verified at the runner level
 * (`expect(page).toHaveURL(...)`) — a web-only concern outside the driver
 * vocabulary (apps/web-e2e/src/driver/types.ts).
 *
 * `/faq → /pricing` is intentionally NOT covered here — it is already exercised
 * by pricing-page.spec.ts (out of scope for this ticket).
 */

import { expect, test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { leagueByIdResponse, userLeaguesResponse } from '../mocks/graphql';
import {
  canonicalMatchupPath,
  canonicalStandingsPath,
  HOME_PATH,
  MOCK_DRAFT_PATH,
} from '../support/canonical-routes';

// ── Mock data ──────────────────────────────────────────────────────────────

const MATCHUP_ID = 10;
const MATCHUP_LEAGUE_ID = 1;

/**
 * Full `GetMatchupById` shape (`...Matchup` + `...AppMatchup`), mirrors the
 * proven fixture in matchup-detail.spec.ts so the canonical destination page
 * renders rather than crashing.
 */
const MOCK_MATCHUP = {
  __typename: 'Matchup',
  id: MATCHUP_ID,
  leagueId: MATCHUP_LEAGUE_ID,
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
};

const STANDINGS_LEAGUE_ID = 7;
const STANDINGS_LEAGUE_NAME = 'Redirect Standings League';

// ── AC1 + AC2 + AC3 happy paths: resolve to canonical targets ───────────────

test.describe('Redirect & resolver routes — canonical targets (LS-8464) @smoke', () => {
  test('AC1: /matchup/:id resolves to the canonical league matchup URL', async ({
    page,
    redirectPage,
  }) => {
    await createGraphQLRouter(page, {
      getmatchupbyid: (route) =>
        fulfillJson(route, { data: { getMatchupById: MOCK_MATCHUP } }),
    });

    await redirectPage.gotoMatchupResolver(MATCHUP_ID);

    await expect(page).toHaveURL(
      canonicalMatchupPath(MATCHUP_LEAGUE_ID, MATCHUP_ID),
    );
    await redirectPage.expectMatchupDetailRendered();
  });

  test('AC2: /standings redirects to the current league standings tab', async ({
    page,
    redirectPage,
  }) => {
    await createGraphQLRouter(page, {
      getuserleagues: (route) =>
        fulfillJson(
          route,
          userLeaguesResponse([
            { id: STANDINGS_LEAGUE_ID, name: STANDINGS_LEAGUE_NAME },
          ]),
        ),
      getleaguebyid: (route) =>
        fulfillJson(
          route,
          leagueByIdResponse({
            id: STANDINGS_LEAGUE_ID,
            name: STANDINGS_LEAGUE_NAME,
          }),
        ),
    });

    await redirectPage.gotoStandingsResolver();

    await expect(page).toHaveURL(canonicalStandingsPath(STANDINGS_LEAGUE_ID));
    await redirectPage.expectStandingsRendered(STANDINGS_LEAGUE_NAME);
  });

  test('AC3: /home legacy alias resolves to home', async ({
    page,
    redirectPage,
  }) => {
    await redirectPage.gotoLegacyAlias('/home');

    await expect(page).toHaveURL(HOME_PATH);
    await redirectPage.expectHomeRendered();
  });

  test('AC3: /draft/mock legacy alias resolves to the mock-draft page', async ({
    page,
    redirectPage,
  }) => {
    await redirectPage.gotoLegacyAlias('/draft/mock');

    await expect(page).toHaveURL(MOCK_DRAFT_PATH);
    await redirectPage.expectMockDraftRendered();
  });
});

// ── AC1 + AC2 fallbacks: sensible behaviour on the empty / unknown edges ─────

test.describe('Redirect & resolver routes — fallbacks (LS-8464) @regression', () => {
  test('AC1: unknown matchup id falls back to home, not a blank page', async ({
    page,
    redirectPage,
  }) => {
    await createGraphQLRouter(page, {
      getmatchupbyid: (route) =>
        fulfillJson(route, { data: { getMatchupById: null } }),
    });

    await redirectPage.gotoMatchupResolver(999);

    await expect(page).toHaveURL(HOME_PATH);
    await redirectPage.expectHomeRendered();
  });

  test('AC2: /standings with zero leagues shows a sensible empty state', async ({
    page,
    redirectPage,
  }) => {
    await createGraphQLRouter(page, {
      getuserleagues: (route) =>
        fulfillJson(route, { data: { userLeagues: [] } }),
    });

    await redirectPage.gotoStandingsResolver();

    await expect(page).toHaveURL('/standings');
    await redirectPage.expectNoLeaguesState();
  });
});
