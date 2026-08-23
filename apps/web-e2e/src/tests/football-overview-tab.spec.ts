/**
 * Football League Detail — Overview Tab E2E Tests (LS-5420)
 *
 * Covers the Overview tab on the Football League Detail page
 * (/football/league/:id/overview), per the Feature Story journey defined on
 * the "Football League Detail" QA epic (LS-5268):
 *
 *   "As a league manager, I want to land on the league detail Overview tab
 *   so that I can see my league's name, my team, and league-wide status at a
 *   glance." -> navigate to the league detail route, assert the Overview tab
 *   is active by default, and assert the league header, my-team card, and
 *   standings/overview summary render with non-empty data.
 *
 * The football route (/football/league/:id/:tab) renders the same
 * `LeagueDetailPage` component as baseball (multi-sport model — see
 * docs/architecture/multi-sport.md), so this suite mirrors
 * `overview-tab.spec.ts` (the baseball equivalent) with a football league and
 * the `football_enabled` feature flag seeded on (LS-4767).
 *
 * All GraphQL responses are mocked hermetically via route.fulfill() — no live
 * backend is required.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  enableFootball,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { mockLeague } from '../mocks/graphql/league.mocks';
import { agoIso } from '../mocks/time';

// ── Mock Data ─────────────────────────────────────────────────────────────────

const FOOTBALL_LEAGUE_ID = 42;

const MOCK_LEAGUE = mockLeague({
  id: FOOTBALL_LEAGUE_ID,
  name: 'Gridiron Dynasty',
  sport: 'football',
  description: 'LS-5420 football overview-tab E2E league',
  draftStatus: 'completed',
  numberOfTeams: 8,
  currentWeekNumber: 5,
  inviteCode: 'FBOVW42',
});

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

const FOOTBALL_POSITIONS = [
  {
    __typename: 'LeaguePosition',
    id: 101,
    leagueId: FOOTBALL_LEAGUE_ID,
    positionType: 'QB',
  },
  {
    __typename: 'LeaguePosition',
    id: 102,
    leagueId: FOOTBALL_LEAGUE_ID,
    positionType: 'RB',
  },
];

const MOCK_ACTIVITY_EVENTS = [
  {
    __typename: 'LeagueActivityEvent',
    id: '1',
    leagueId: FOOTBALL_LEAGUE_ID,
    teamId: 1,
    actorUserId: 1,
    actorUsername: 'manager1',
    eventType: 'trade_accepted',
    payload: JSON.stringify({
      teamAName: 'Alpha Offense',
      teamBName: 'Beta Defense',
    }),
    occurredAt: agoIso(3_600_000),
  },
];

const MOCK_STANDINGS = [
  {
    __typename: 'TeamStanding',
    teamId: 1,
    teamName: 'Alpha Offense',
    wins: 4,
    losses: 1,
    ties: 0,
    winPercentage: 0.8,
    pointsFor: 512.4,
    pointsAgainst: 401.2,
    primaryColor: null,
  },
  {
    __typename: 'TeamStanding',
    teamId: 2,
    teamName: 'Beta Defense',
    wins: 3,
    losses: 2,
    ties: 0,
    winPercentage: 0.6,
    pointsFor: 470.1,
    pointsAgainst: 430.5,
    primaryColor: null,
  },
];

const DUES_DISABLED = {
  leagueDuesSettings: {
    __typename: 'LeagueDuesSettings',
    enabled: false,
    amountCents: 0,
  },
  leagueDuesStatus: [],
};

// ── GraphQL Routing ───────────────────────────────────────────────────────────

async function mockFootballOverviewTab(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(
    page,
    {
      getleaguebyid: (route) =>
        fulfillJson(route, { data: { league: MOCK_LEAGUE } }),
      getleague: (route) =>
        fulfillJson(route, { data: { league: MOCK_LEAGUE } }),
      getleagueteams: (route) =>
        fulfillJson(route, { data: { leagueTeams: MOCK_TEAMS } }),
      getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
      getteammembers: (route) =>
        fulfillJson(route, { data: { teamMembers: [] } }),
      teammembers: (route) => fulfillJson(route, { data: { teamMembers: [] } }),
      getpositionsforleague: (route) =>
        fulfillJson(route, { data: { leaguePositions: FOOTBALL_POSITIONS } }),
      getleagueactivity: (route) =>
        fulfillJson(route, { data: { leagueActivity: MOCK_ACTIVITY_EVENTS } }),
      leagueactivity: (route) =>
        fulfillJson(route, { data: { leagueActivity: MOCK_ACTIVITY_EVENTS } }),
      getleaguechatmessages: (route) =>
        fulfillJson(route, { data: { getLeagueMessages: [] } }),
      getleaguemessages: (route) =>
        fulfillJson(route, { data: { getLeagueMessages: [] } }),
      getleagueannouncements: (route) =>
        fulfillJson(route, { data: { getLeagueAnnouncements: [] } }),
      getleaguestandings: (route) =>
        fulfillJson(route, { data: { getLeagueStandings: MOCK_STANDINGS } }),
      leaguestandings: (route) =>
        fulfillJson(route, { data: { getLeagueStandings: MOCK_STANDINGS } }),
      getleagueduessettings: (route) =>
        fulfillJson(route, { data: DUES_DISABLED }),
      leagueduessettings: (route) =>
        fulfillJson(route, { data: DUES_DISABLED }),
      getleagueduesstatus: (route) =>
        fulfillJson(route, { data: DUES_DISABLED }),
      leagueduesstatus: (route) => fulfillJson(route, { data: DUES_DISABLED }),
      getcurrentmatchup: (route) => fulfillJson(route, { data: null }),
      getmatchupbyid: (route) => fulfillJson(route, { data: null }),
      getmatchupsforleague: (route) => fulfillJson(route, { data: null }),
      getmatchupplayers: (route) => fulfillJson(route, { data: null }),
      getcurrentweekforleague: (route) =>
        fulfillJson(route, { data: { getCurrentWeekForLeague: 5 } }),
      getleaguescoring: (route) =>
        fulfillJson(route, { data: { leagueScoringProfile: null } }),
      leaguescoringprofile: (route) =>
        fulfillJson(route, { data: { leagueScoringProfile: null } }),
      getuserleagues: (route) =>
        fulfillJson(route, { data: { userLeagues: [MOCK_LEAGUE] } }),
      getusers: (route) => fulfillJson(route, { data: { users: [] } }),
    },
    { onUnmocked: unmockedGraphQLFallback },
  );
}

// ── Overview Tab — Football League ───────────────────────────────────────────

test.describe('Football Overview Tab — LS-5420 @regression', () => {
  test.beforeEach(async ({ page }) => {
    await enableFootball(page);
    await mockFootballOverviewTab(page);
  });

  test('overview tab is the default landing tab on the football league detail page', async ({
    page,
  }) => {
    await page.goto(`/football/league/${FOOTBALL_LEAGUE_ID}`);
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(
      new RegExp(`/football/league/${FOOTBALL_LEAGUE_ID}`),
    );
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('Overview tab in the tab bar is marked active by default', async ({
    page,
  }) => {
    await page.goto(`/football/league/${FOOTBALL_LEAGUE_ID}`);
    await page.waitForLoadState('load');

    const tabList = page.getByRole('tablist', { name: /League sections/i });
    await expect(tabList).toBeVisible();
    await expect(
      tabList.getByRole('tab', { name: /overview/i }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('navigating directly to /overview renders without application error', async ({
    page,
  }) => {
    await page.goto(`/football/league/${FOOTBALL_LEAGUE_ID}/overview`);
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(
      `/football/league/${FOOTBALL_LEAGUE_ID}/overview`,
    );
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('league header shows the football league name', async ({ page }) => {
    await page.goto(`/football/league/${FOOTBALL_LEAGUE_ID}/overview`);

    await expect(page.getByTestId('league-title')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('league-title')).toHaveText(MOCK_LEAGUE.name);
  });

  test('League Snapshot bar (my-team summary) shows team count and roster size', async ({
    page,
  }) => {
    await page.goto(`/football/league/${FOOTBALL_LEAGUE_ID}/overview`);
    await expect(page.getByTestId('league-title')).toBeVisible({
      timeout: 15_000,
    });

    const teamsStat = page.locator('.ls-snap-stat', { hasText: 'Teams' });
    await expect(teamsStat).toBeVisible();
    await expect(teamsStat).toContainText(String(MOCK_TEAMS.length));

    const rosterSizeStat = page.locator('.ls-snap-stat', {
      hasText: 'Roster Size',
    });
    await expect(rosterSizeStat).toBeVisible();
    await expect(rosterSizeStat).toContainText(
      String(MOCK_LEAGUE.maxRosterSize),
    );
  });

  test('Quick Standings (league-wide status) section is visible in the sidebar', async ({
    page,
  }) => {
    await page.goto(`/football/league/${FOOTBALL_LEAGUE_ID}/overview`);
    await expect(page.getByTestId('league-title')).toBeVisible({
      timeout: 15_000,
    });

    await expect(
      page.getByRole('heading', { name: 'Standings' }),
    ).toBeVisible();
    await expect(
      page.locator('.ls-qstandings-name', { hasText: 'Alpha Offense' }),
    ).toBeVisible();
    await expect(
      page.locator('.ls-qstandings-name', { hasText: 'Beta Defense' }),
    ).toBeVisible();
  });

  test('Activity feed shows a football league activity event by default', async ({
    page,
  }) => {
    await page.goto(`/football/league/${FOOTBALL_LEAGUE_ID}/overview`);
    await expect(page.getByTestId('league-title')).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByRole('tab', { name: /activity/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByText('Trade accepted', { exact: false }),
    ).toBeVisible();
  });

  test('Invite Friends card is rendered for the football league commissioner', async ({
    page,
  }) => {
    await page.goto(`/football/league/${FOOTBALL_LEAGUE_ID}/overview`);
    await expect(page.getByTestId('league-title')).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.locator('#invite-section')).toBeAttached();
  });
});
