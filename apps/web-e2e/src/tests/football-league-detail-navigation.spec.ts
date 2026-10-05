/**
 * Football League Detail — sport-aware navigation regression (LS-9254)
 *
 * `LeagueDetailPageV2` (`apps/web/src/pages/baseball/league-detail-v2/LeagueDetailPageV2.tsx`)
 * backs both `/baseball/league/:id/:tab` and `/football/league/:id/:tab`. Its
 * internal `navigate()` calls (tab-bar clicks, the unknown-tab-slug redirect,
 * and the Join/Watch Draft banners) were previously hardcoded to the
 * `/baseball/...` prefix regardless of the league's actual sport — LS-9271
 * threaded a `sportBasePath` derived from `league.sport` through those calls.
 * This suite is the regression coverage for a football league confirming
 * none of those navigations regress back to `/baseball/...`.
 *
 * `onTeamNav` (Quick Standings team click) navigates via `sportBasePath`, so
 * a football league correctly lands on `/football/teams/:teamId` — LS-6438
 * added that route after this ticket's AC4 was originally scoped against
 * the `/baseball/teams/:id` fallback.
 *
 * All GraphQL calls are mocked via page.route() — no live backend required.
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const FOOTBALL_LEAGUE_ID = 77;

const MOCK_LEAGUE = {
  __typename: 'League',
  id: FOOTBALL_LEAGUE_ID,
  name: 'Sunday Showdown League',
  description: 'LS-9254 football navigation regression league',
  sport: 'football',
  owner: 1,
  maxRosterSize: 16,
  // 'in-progress' surfaces both the Join Draft and Watch Draft banners on
  // the Overview tab so a single mock covers both AC3 navigations.
  draftStatus: 'in-progress',
  currentMatchup: null,
  numberOfTeams: 2,
  playerPool: 'all',
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  isPublic: true,
  maxBatters: null,
  maxPitchers: null,
  tradingEnabled: true,
  waiverEnabled: true,
  startDate: null,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
  inviteCode: 'GRID9254',
  userMembership: { teamId: 1 },
  minCareerGames: null,
  minCareerSeasons: null,
  waiverType: 'standard',
  currentWeekNumber: 3,
  totalMatchups: 14,
  gamesPerMatchup: 1,
  pitcherStartsPerMatchup: null,
  playoffEnabled: false,
  playoffFormat: null,
  playoffMultiWeek: false,
  lmNotes: null,
  previousLeagueId: null,
  frozenAt: null,
  seasonNumber: 1,
  salaryCapEnabled: false,
  salaryCap: null,
  salaryFloor: null,
  luxuryTaxThreshold: null,
  minSalary: null,
  salaryEscalationPct: null,
  salaryDecayPct: null,
  auctionBudget: null,
  auctionMinBid: null,
  eraFilter: null,
  baseballHofOnly: false,
  customEraStartYear: null,
  customEraEndYear: null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Offense',
    owner: 1,
    leagueId: FOOTBALL_LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Defense',
    owner: 2,
    leagueId: FOOTBALL_LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

async function mockFootballLeagueDetailGraphQL(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();

    if (op === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (op === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (op === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: [] } }),
      });
    } else if (op === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (op === 'getteammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
    } else if (op === 'getleagueactivity') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: [] } }),
      });
    } else if (op === 'getleaguechatmessages') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueMessages: [] } }),
      });
    } else if (op === 'getleagueannouncements') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueAnnouncements: [] } }),
      });
    } else if (op === 'getteamwaiverclaims') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamWaiverClaims: [] } }),
      });
    } else if (op === 'getleaguestandings') {
      // Empty standings — Overview's QuickStandings falls back to `teams`.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else if (op === 'getleaguehistory') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueHistory: [] } }),
      });
    } else if (op === 'getalltimerecords') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getAllTimeRecords: [] } }),
      });
    } else if (op === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (
      op === 'getmatchupbyid' ||
      op === 'getmatchupsforleague' ||
      op === 'getmatchupplayers'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    } else if (op === 'getleaguescoringprofile') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
    } else if (op === 'getleagueduesstatus') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            leagueDuesSettings: {
              __typename: 'LeagueDuesSettings',
              enabled: false,
              amountCents: 0,
            },
            leagueDuesStatus: [],
          },
        }),
      });
    } else if (op === 'getteamtradeoffers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamTradeOffers: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('Football League Detail — sport-aware tab navigation @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballLeagueDetailGraphQL(page);
  });

  test('clicking a tab from the football Overview stays under /football/league/:id/:tab (AC1)', async ({
    page,
    leaguePage,
  }) => {
    await leaguePage.gotoDetail(FOOTBALL_LEAGUE_ID, 'overview', 'football');

    await leaguePage.openTab('Standings');

    await expect(page).toHaveURL(
      `/football/league/${FOOTBALL_LEAGUE_ID}/standings`,
    );
    await leaguePage.expectNoAppError();
  });

  test('clicking a second tab keeps the football namespace, not /baseball/... (AC1)', async ({
    page,
    leaguePage,
  }) => {
    await leaguePage.gotoDetail(FOOTBALL_LEAGUE_ID, 'overview', 'football');

    await leaguePage.openTab('Trades');

    await expect(page).toHaveURL(
      `/football/league/${FOOTBALL_LEAGUE_ID}/trades`,
    );
    await expect(page).not.toHaveURL(/\/baseball\//);
  });

  test('unknown tab segment on a football league route redirects to /football/league/:id/overview, not /baseball/... (AC2)', async ({
    page,
  }) => {
    await page.goto(`/football/league/${FOOTBALL_LEAGUE_ID}/unknown-tab-xyz`);
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(
      new RegExp(`/football/league/${FOOTBALL_LEAGUE_ID}/overview$`),
    );
    await expect(page).not.toHaveURL(/\/baseball\//);
  });
});

test.describe('Football League Detail — Join/Watch Draft navigation @regression', () => {
  test.beforeEach(async ({ page, leaguePage }) => {
    await mockFootballLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(FOOTBALL_LEAGUE_ID, 'overview', 'football');
  });

  test('Join Draft Room navigates under /football/league/:id/draft (AC3)', async ({
    page,
    leaguePage,
  }) => {
    await leaguePage.button(/join draft room/i).tap();

    await expect(page).toHaveURL(
      `/football/league/${FOOTBALL_LEAGUE_ID}/draft`,
    );
    await expect(page).not.toHaveURL(/\/baseball\//);
  });

  test('Watch Draft navigates under /football/league/:id/draft/watch (AC3)', async ({
    page,
    leaguePage,
  }) => {
    await leaguePage.button(/watch draft/i).tap();

    await expect(page).toHaveURL(
      `/football/league/${FOOTBALL_LEAGUE_ID}/draft/watch`,
    );
    await expect(page).not.toHaveURL(/\/baseball\//);
  });
});

test.describe('Football League Detail — Quick Standings team navigation @regression', () => {
  test('clicking a team in Quick Standings on a football league navigates to the existing team route (AC4)', async ({
    page,
    leaguePage,
  }) => {
    await mockFootballLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(FOOTBALL_LEAGUE_ID, 'overview', 'football');

    // LS-6438 added a /football/teams/:teamId route after this test was
    // written; onTeamNav already threads sportBasePath, so a football
    // league now correctly navigates to the football teams route.
    await page
      .locator('.ls-qstandings-row', { hasText: 'Alpha Offense' })
      .click();

    await expect(page).toHaveURL('/football/teams/1');
  });
});
