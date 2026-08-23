/**
 * Football Matchup Detail — Win Probability Premium Gating E2E Tests (LS-5269)
 *
 * Covers /football/league/:leagueId/matchups/:matchupId — the shared
 * `MatchupDetailPage` gates `MatchupWinProbabilityPanel` behind
 * `PremiumGate`/`canSeeProjections` (ENTITLEMENTS.matchup_projections) for
 * every sport, but until now only the baseball route
 * (matchup-week-navigation.spec.ts) asserted the free-vs-premium behavior.
 * This closes that gap for football:
 *   - Premium users see the Win Probability panel and no upgrade overlay.
 *   - Free users see the "Premium Feature" upgrade overlay instead of the
 *     panel, and never see win-probability content.
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { customAuthTest } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { mockLeague } from '../mocks/graphql/league.mocks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 71;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = { ...mockLeague({ id: LEAGUE_ID }), sport: 'football' };

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Gridiron Giants',
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
    name: 'End Zone Eagles',
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

const MATCHUP = {
  __typename: 'Matchup',
  id: MATCHUP_ID,
  leagueId: LEAGUE_ID,
  weekNumber: 6,
  team1Id: 1,
  team2Id: 2,
  team1Score: 0,
  team2Score: 0,
  status: 'scheduled',
  statsLoadingStatus: 'complete',
  gamesPerMatchup: 1,
  pitcherStartsPerMatchup: 0,
  selectedGamesCount: 0,
  startTime: null,
  endTime: null,
};

// ---------------------------------------------------------------------------
// GraphQL mock setup
// ---------------------------------------------------------------------------

/**
 * Routes every GraphQL operation the football matchup detail page issues,
 * gating `GetMatchupWinProbability` on `opts.isPremium` (LS-5907: win
 * probability is a server-gated field) and pinning the entitlement tier via
 * the shared `useTier` fixture so `canSeeProjections` resolves the same way
 * the real resolver would for an entitled vs. non-entitled caller.
 */
async function mockPremiumGatingGraphQL(
  page: import('@playwright/test').Page,
  opts: { isPremium: boolean },
) {
  const { isPremium } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (op === 'GetLeagueById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (op === 'GetMatchupById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: MATCHUP } }),
      });
    } else if (op === 'GetMatchupsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsForLeague: [MATCHUP] } }),
      });
    } else if (op === 'GetCurrentWeekForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getCurrentWeekForLeague: MATCHUP.weekNumber },
        }),
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
    } else if (op === 'GetMatchupPlayers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: [] } }),
      });
    } else if (op === 'GetMatchupWinProbability') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getMatchupById: isPremium
              ? {
                  __typename: 'Matchup',
                  id: String(MATCHUP_ID),
                  winProbability: {
                    __typename: 'MatchupWinProbability',
                    team1WinProbability: 0.57,
                    team2WinProbability: 0.43,
                    tiesProbability: 0,
                    team1ProjectedScore: 105.2,
                    team2ProjectedScore: 96.8,
                    simulationCount: 5000,
                  },
                }
              : {
                  __typename: 'Matchup',
                  id: String(MATCHUP_ID),
                  winProbability: null,
                },
          },
        }),
      });
    } else if (op === 'MatchupScores') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { matchupScores: [] } }),
      });
    } else if (op === 'GetTeamMatchupHistory') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getTeamMatchupHistory: [] } }),
      });
    } else if (op === 'GetLeagueStandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });

  // Registered after the route above so its GetUserById handler runs first
  // (Playwright LIFO) — see matchup-week-navigation.spec.ts (LS-8058).
  await useTier(page, isPremium ? 'premium' : 'free');
}

// ---------------------------------------------------------------------------
// Tests – premium users
//
// Use a non-admin auth identity so the useIsPremium hook falls through to
// the subscription-tier check rather than short-circuiting on
// accessLevel === 'admin' (see matchup-week-navigation.spec.ts).
// ---------------------------------------------------------------------------

const premiumTest = customAuthTest('football-premium@test.com');

premiumTest.describe(
  'Football Matchup Detail – win probability (premium) @regression',
  () => {
    premiumTest.beforeEach(async ({ page, matchupPage }) => {
      await mockPremiumGatingGraphQL(page, { isPremium: true });
      await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
    });

    premiumTest('shows the Win Probability panel', async ({ matchupPage }) => {
      await matchupPage.winProbabilityPanel.expectVisible({
        timeout: 10000,
      });
    });

    premiumTest(
      'does not show the premium upgrade overlay',
      async ({ matchupPage }) => {
        await matchupPage.text('Premium Feature').expectHidden();
        await matchupPage.upgradeButton.expectHidden();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests – free users
// ---------------------------------------------------------------------------

const freeTest = customAuthTest('football-free@test.com');

freeTest.describe(
  'Football Matchup Detail – win probability (free user) @regression',
  () => {
    freeTest.beforeEach(async ({ page, matchupPage }) => {
      await mockPremiumGatingGraphQL(page, { isPremium: false });
      await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
    });

    freeTest(
      'sees the premium gate overlay instead of the Win Probability panel',
      async ({ matchupPage }) => {
        await matchupPage.text('Premium Feature').expectVisible();
        await matchupPage.upgradeButton.expectVisible();
      },
    );

    freeTest('never sees win-probability content', async ({ matchupPage }) => {
      await matchupPage.text('Premium Feature').expectVisible();
      await matchupPage.text('PROJECTED FINAL SCORES').expectHidden();
    });
  },
);
