/**
 * Overview Tab — E2E Tests (LS-5345)
 *
 * Covers the Overview Tab on the Baseball League Detail page
 * (/baseball/league/:id/overview).
 *
 * All GraphQL responses are mocked hermetically via route.fulfill() — no live
 * backend is required.
 */

import { expect, test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { agoIso } from '../mocks/time';

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_LEAGUE_BASE = {
  __typename: 'League',
  id: 42,
  name: 'Diamond Dynasty',
  description: 'LS-5345 overview-tab E2E league',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: null,
  currentWeekNumber: 5,
  numberOfTeams: 8,
  playerPool: 'all',
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  isPublic: false,
  maxBatters: 14,
  maxPitchers: 9,
  tradingEnabled: true,
  waiverEnabled: true,
  startDate: null,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
  inviteCode: 'OVW345',
  userMembership: { teamId: 1 },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
  leaguePhase: null,
  weekAdvanceStatus: null,
  faabBudgetDefault: null,
  pitcherStartsPerMatchup: 1,
  gamesPerMatchup: 7,
  totalMatchups: 14,
  playoffEnabled: true,
  playoffFormat: '4-team',
  playoffMultiWeek: false,
  lmNotes: null,
  isMockDraft: false,
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
  sport: 'baseball',
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Sluggers',
    owner: 1,
    leagueId: 42,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Bombers',
    owner: 2,
    leagueId: 42,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const MOCK_TEAM_MEMBERS = [
  {
    __typename: 'TeamMember',
    id: 1,
    teamId: 1,
    playerId: 101,
    positionId: 1,
    leagueId: 42,
    onTradeBlock: false,
    salary: null,
    player: {
      id: 101,
      firstName: 'Carlos',
      lastName: 'Rivera',
      brefId: 'rivercar01',
      eligiblePositions: ['1B'],
      careerBatting: { games: 350 },
      seasonsPlayed: 6,
    },
  },
];

const MOCK_ACTIVITY_EVENTS = [
  {
    __typename: 'LeagueActivityEvent',
    id: '1',
    leagueId: 42,
    teamId: 1,
    actorUserId: 1,
    actorUsername: 'manager1',
    eventType: 'trade_accepted',
    payload: JSON.stringify({
      teamAName: 'Alpha Sluggers',
      teamBName: 'Beta Bombers',
    }),
    occurredAt: agoIso(3_600_000),
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

interface MockOverrides {
  league?: Partial<typeof MOCK_LEAGUE_BASE>;
  activityEvents?: typeof MOCK_ACTIVITY_EVENTS | [];
}

async function mockOverviewTab(
  page: import('@playwright/test').Page,
  overrides: MockOverrides = {},
) {
  const league = { ...MOCK_LEAGUE_BASE, ...(overrides.league ?? {}) };
  const activityEvents = overrides.activityEvents ?? MOCK_ACTIVITY_EVENTS;

  await createGraphQLRouter(page, {
    getleaguebyid: (route) => fulfillJson(route, { data: { league } }),
    getleague: (route) => fulfillJson(route, { data: { league } }),
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: MOCK_TEAMS } }),
    getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
    getteammembers: (route) =>
      fulfillJson(route, { data: { teamMembers: MOCK_TEAM_MEMBERS } }),
    teammembers: (route) =>
      fulfillJson(route, { data: { teamMembers: MOCK_TEAM_MEMBERS } }),
    getleagueactivity: (route) =>
      fulfillJson(route, { data: { leagueActivity: activityEvents } }),
    leagueactivity: (route) =>
      fulfillJson(route, { data: { leagueActivity: activityEvents } }),
    getleaguechatmessages: (route) =>
      fulfillJson(route, { data: { getLeagueMessages: [] } }),
    getleaguemessages: (route) =>
      fulfillJson(route, { data: { getLeagueMessages: [] } }),
    getleagueannouncements: (route) =>
      fulfillJson(route, { data: { getLeagueAnnouncements: [] } }),
    getleaguestandings: (route) =>
      fulfillJson(route, { data: { getLeagueStandings: [] } }),
    leaguestandings: (route) =>
      fulfillJson(route, { data: { getLeagueStandings: [] } }),
    getleagueduessettings: (route) =>
      fulfillJson(route, { data: DUES_DISABLED }),
    leagueduessettings: (route) => fulfillJson(route, { data: DUES_DISABLED }),
    getleagueduesstatus: (route) => fulfillJson(route, { data: DUES_DISABLED }),
    leagueduesstatus: (route) => fulfillJson(route, { data: DUES_DISABLED }),
    getpositionsforleague: (route) =>
      fulfillJson(route, { data: { leaguePositions: [] } }),
    getcurrentmatchup: (route) => fulfillJson(route, { data: null }),
    getmatchupbyid: (route) => fulfillJson(route, { data: null }),
    getmatchupsforleague: (route) => fulfillJson(route, { data: null }),
    getmatchupplayers: (route) => fulfillJson(route, { data: null }),
    getleaguescoring: (route) =>
      fulfillJson(route, { data: { leagueScoringProfile: null } }),
    leaguescoringprofile: (route) =>
      fulfillJson(route, { data: { leagueScoringProfile: null } }),
    getuserleagues: (route) =>
      fulfillJson(route, { data: { userLeagues: [league] } }),
    getusers: (route) => fulfillJson(route, { data: { users: [] } }),
  });
}

// ── Overview Tab — Layout ─────────────────────────────────────────────────────

test.describe('Overview Tab — Layout (LS-5345) @regression', () => {
  test('overview tab is the default landing tab on the league detail page', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page);
    await leaguePage.gotoDetail(42);

    await expect(page).toHaveURL(/\/baseball\/league\/42/);
    await leaguePage.expectNoAppError();
  });

  test('navigating directly to /overview renders without application error', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page);
    await leaguePage.gotoDetail(42, 'overview');

    await expect(page).toHaveURL('/baseball/league/42/overview');
    await leaguePage.expectNoAppError();
  });

  test('league name heading is visible on the overview tab', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page);
    await leaguePage.gotoDetail(42, 'overview');

    await expect(leaguePage.leagueNameHeading('Diamond Dynasty')).toBeVisible();
  });

  test('League Snapshot Bar displays team count and roster size', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page);
    await leaguePage.gotoDetail(42, 'overview');

    await expect(page.getByText('Teams').first()).toBeVisible();
    await expect(page.getByText('Roster Size').first()).toBeVisible();
  });

  test('Activity sub-tab is active by default and shows the activity feed', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page);
    await leaguePage.gotoDetail(42, 'overview');

    await expect(page.getByRole('tab', { name: /activity/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByText('Trade accepted', { exact: false }),
    ).toBeVisible();
  });

  test('switching to the Chat sub-tab shows the chat section', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page);
    await leaguePage.gotoDetail(42, 'overview');

    await page.getByRole('tab', { name: /^chat$/i }).click();
    await expect(
      page.getByText(/league chat/i, { exact: false }),
    ).toBeVisible();
  });

  test('switching to the Scoring sub-tab shows scoring rules section', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page);
    await leaguePage.gotoDetail(42, 'overview');

    await page.getByRole('tab', { name: /^scoring$/i }).click();
    await expect(
      page.getByText(/scoring rules/i, { exact: false }),
    ).toBeVisible();
  });

  test('Quick Standings section is visible in the sidebar', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page);
    await leaguePage.gotoDetail(42, 'overview');

    await expect(
      page.getByRole('heading', { name: 'Standings' }),
    ).toBeVisible();
  });

  test('empty activity state shows "No activity yet" message', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page, { activityEvents: [] });
    await leaguePage.gotoDetail(42, 'overview');

    await expect(
      page.getByText(/no activity yet/i, { exact: false }),
    ).toBeVisible();
  });
});

// ── Draft In Progress Banner ─────────────────────────────────────────────────

test.describe('Overview Tab — Draft In Progress Banner (LS-5345) @regression', () => {
  test('"Draft Is Live" banner appears when draftStatus is in-progress', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page, { league: { draftStatus: 'in-progress' } });
    await leaguePage.gotoDetail(42, 'overview');

    await expect(page.getByText(/draft is live/i)).toBeVisible();
  });

  test('"Join Draft Room" button is present in the draft banner', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page, { league: { draftStatus: 'in-progress' } });
    await leaguePage.gotoDetail(42, 'overview');

    await expect(
      page.getByRole('button', { name: /join draft room/i }),
    ).toBeVisible();
  });

  test('draft banner is absent when draftStatus is completed', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page, { league: { draftStatus: 'completed' } });
    await leaguePage.gotoDetail(42, 'overview');

    await expect(
      page.getByRole('button', { name: /join draft room/i }),
    ).not.toBeVisible();
  });
});

// ── Commissioner Features ────────────────────────────────────────────────────

test.describe('Overview Tab — Commissioner features (LS-5345) @regression', () => {
  test('#invite-section is rendered for the commissioner (owner)', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page, { league: { owner: 1 } });
    await leaguePage.gotoDetail(42, 'overview');

    await expect(page.locator('#invite-section')).toBeAttached();
  });

  test('invite link input is visible in the invite card', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page, { league: { owner: 1, inviteCode: 'OVW345' } });
    await leaguePage.gotoDetail(42, 'overview');

    await expect(page.getByLabel(/copy invite link/i)).toBeVisible();
  });

  test('invite code input is visible in the invite card', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page, { league: { owner: 1, inviteCode: 'OVW345' } });
    await leaguePage.gotoDetail(42, 'overview');

    await expect(page.getByLabel(/copy invite code/i)).toBeVisible();
  });

  test('"Show QR Code to Invite" button toggles the QR code panel', async ({
    page,
    leaguePage,
  }) => {
    await mockOverviewTab(page, { league: { owner: 1, inviteCode: 'OVW345' } });
    await leaguePage.gotoDetail(42, 'overview');

    const qrButton = page.getByRole('button', {
      name: /show qr code to invite/i,
    });
    await expect(qrButton).toBeVisible();

    await qrButton.click();
    await expect(
      page.locator(
        '[data-testid="qr-code-svg"], [data-testid="qr-code-skeleton"]',
      ),
    ).toBeVisible();

    await page.getByRole('button', { name: /hide qr code to invite/i }).click();
    await expect(
      page.locator(
        '[data-testid="qr-code-svg"], [data-testid="qr-code-skeleton"]',
      ),
    ).not.toBeVisible();
  });
});
