/**
 * League Detail Tabs — E2E Tests
 *
 * Covers the following sections of the League Detail page:
 *   /baseball/league/:id/overview  — Overview, Activity Feed, Chat
 *   /baseball/league/:id/standings — Standings (navigation smoke)
 *   /baseball/league/:id/roster    — My Roster, Pending Waivers
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Playoff Push League',
  description: 'E2E league-detail-tabs test league',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: 1,
  numberOfTeams: 4,
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
  inviteCode: 'ABCD1234',
  userMembership: { teamId: 1 },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
    owner: 1,
    leagueId: 1,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Force',
    owner: 2,
    leagueId: 1,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, leagueId: 1, positionType: 'C' },
  { __typename: 'LeaguePosition', id: 2, leagueId: 1, positionType: '1B' },
];

const MOCK_ACTIVITY_EVENTS = [
  {
    __typename: 'LeagueActivityEvent',
    id: '1',
    leagueId: 1,
    teamId: 1,
    actorUserId: 1,
    actorUsername: 'manager1',
    eventType: 'trade_accepted',
    payload: JSON.stringify({
      teamAName: 'Alpha Squad',
      teamBName: 'Beta Force',
    }),
    occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    __typename: 'LeagueActivityEvent',
    id: '2',
    leagueId: 1,
    teamId: 2,
    actorUserId: 2,
    actorUsername: 'manager2',
    eventType: 'waiver_claim_approved',
    payload: JSON.stringify({
      playerName: 'John Smith',
      teamName: 'Beta Force',
    }),
    occurredAt: new Date(Date.now() - 7_200_000).toISOString(),
  },
];

const MOCK_CHAT_MESSAGES = [
  {
    __typename: 'LeagueChatMessage',
    id: '1',
    userId: 1,
    messageText: 'Good luck this week everyone!',
    timestamp: new Date(Date.now() - 1_800_000).toISOString(),
    messageType: 'text',
    gifUrl: null,
    metadata: null,
    sender: { username: 'manager1', avatarUrl: null },
  },
  {
    __typename: 'LeagueChatMessage',
    id: '2',
    userId: 2,
    messageText: 'May the best roster win!',
    timestamp: new Date(Date.now() - 900_000).toISOString(),
    messageType: 'text',
    gifUrl: null,
    metadata: null,
    sender: { username: 'manager2', avatarUrl: null },
  },
];

const MOCK_TEAM_MEMBERS = [
  {
    __typename: 'TeamMember',
    id: 1,
    teamId: 1,
    playerId: 101,
    positionId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    player: {
      id: 101,
      firstName: 'Mike',
      lastName: 'Johnson',
      brefId: 'johnmi01',
      eligiblePositions: ['C'],
      careerBatting: { games: 300 },
      seasonsPlayed: 5,
    },
  },
];

const MOCK_WAIVER_CLAIMS = [
  {
    __typename: 'WaiverClaim',
    id: 1,
    leagueId: 1,
    teamId: 1,
    playerId: 200,
    dropPlayerId: null,
    faabBid: 10,
    status: 'pending',
    errorMessage: null,
    playerName: 'Waiver Target',
    dropPlayerName: null,
    processedAt: null,
    createdAt: new Date(Date.now() - 600_000).toISOString(),
  },
];

// ── GraphQL Mock Setup ────────────────────────────────────────────────────────

interface MockOptions {
  /** Override activity events returned by getleagueactivity */
  activityEvents?: typeof MOCK_ACTIVITY_EVENTS | [];
  /** Override chat messages returned by getleaguemessages */
  chatMessages?: typeof MOCK_CHAT_MESSAGES | [];
  /** Override waiver claims returned by teamwaiverclaims */
  waiverClaims?: typeof MOCK_WAIVER_CLAIMS | [];
  /** Override team members returned by teammembers */
  teamMembers?: typeof MOCK_TEAM_MEMBERS | [];
}

async function mockLeagueDetailGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOptions = {},
) {
  const {
    activityEvents = MOCK_ACTIVITY_EVENTS,
    chatMessages = MOCK_CHAT_MESSAGES,
    waiverClaims = [],
    teamMembers = MOCK_TEAM_MEMBERS,
  } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (
      postData.includes('getleaguebyid') ||
      postData.includes('"getleague"')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (postData.includes('getleagueteams')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (postData.includes('getpositionsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (postData.includes('getuserteamid')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (
      postData.includes('getteammembers') ||
      postData.includes('teammembers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers } }),
      });
    } else if (
      postData.includes('getleagueactivity') ||
      postData.includes('leagueactivity')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: activityEvents } }),
      });
    } else if (
      postData.includes('getleaguechatmessages') ||
      postData.includes('getleaguemessages')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueMessages: chatMessages } }),
      });
    } else if (postData.includes('getleagueannouncements')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueAnnouncements: [] } }),
      });
    } else if (
      postData.includes('getteamwaiverclaims') ||
      postData.includes('teamwaiverclaims')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamWaiverClaims: waiverClaims } }),
      });
    } else if (
      postData.includes('getleaguestandings') ||
      postData.includes('leaguestandings')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else if (
      postData.includes('getuserleagues') ||
      postData.includes('getusers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (
      postData.includes('getcurrentmatchup') ||
      postData.includes('getmatchupbyid') ||
      postData.includes('getmatchupsforleague') ||
      postData.includes('getmatchupplayers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    } else if (
      postData.includes('getleaguescoring') ||
      postData.includes('leaguescoringprofile')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
    } else if (
      postData.includes('getpendingtradeoffers') ||
      postData.includes('pendingtradeoffers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingTradeOffers: [] } }),
      });
    } else {
      await route.fallback();
    }
  });
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

test.describe('Overview Tab — navigation @smoke', () => {
  test('navigates to the overview tab without error', async ({ page }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/baseball/league/1/overview');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('shows the league name on the overview page', async ({ page }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await expect(
      page.getByText('Playoff Push League', { exact: false }),
    ).toBeVisible();
  });

  test('overview tab button is active when on the overview route', async ({
    page,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // The tab bar should contain an "Overview" label
    await expect(page.getByText('Overview').first()).toBeVisible();
  });
});

// ── Activity Feed (within Overview) ─────────────────────────────────────────

test.describe('Activity Feed – section rendering @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');
  });

  test('shows "League Activity" section heading', async ({ page }) => {
    await expect(page.getByText('League Activity')).toBeVisible();
  });

  test('shows a "Trade accepted" event from mocked activity data', async ({
    page,
  }) => {
    await expect(page.getByText('Trade accepted')).toBeVisible();
  });

  test('shows actor usernames from mocked activity events', async ({
    page,
  }) => {
    await expect(
      page.getByText('Alpha Squad', { exact: false }).first(),
    ).toBeVisible();
  });
});

test.describe('Activity Feed — empty state @regression', () => {
  test('shows "No activity yet" when there are no activity events', async ({
    page,
  }) => {
    await mockLeagueDetailGraphQL(page, { activityEvents: [] });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await expect(
      page.getByText('No activity yet', { exact: false }),
    ).toBeVisible();
  });
});

// ── Chat Section (within Overview) ───────────────────────────────────────────

test.describe('League Chat – section rendering @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');
  });

  test('shows "League Chat" section heading', async ({ page }) => {
    await expect(page.getByText('Chat', { exact: true })).toBeVisible();
  });

  test('shows chat messages from mocked data', async ({ page }) => {
    // Switch to the Chat sub-tab (Activity is selected by default)
    await page.getByText('Chat', { exact: true }).click();
    await expect(page.getByText('Good luck this week everyone!')).toBeVisible();
    await expect(page.getByText('May the best roster win!')).toBeVisible();
  });

  test('shows message send input field', async ({ page }) => {
    // Switch to the Chat sub-tab first
    await page.getByText('Chat', { exact: true }).click();
    // Chat input should be rendered (textarea or input)
    const chatInput = page.getByPlaceholder(/message/i).first();
    await expect(chatInput).toBeVisible();
  });
});

// ── Standings Tab — navigation smoke ─────────────────────────────────────────

test.describe('Standings Tab — navigation @smoke', () => {
  test('navigates to standings tab without error', async ({ page }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/standings');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/baseball/league/1/standings');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('clicking the Standings tab navigates from overview', async ({
    page,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await page.getByText('Standings').first().click();
    await expect(page).toHaveURL(/\/standings/);
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ── Roster Tab ───────────────────────────────────────────────────────────────

test.describe('Roster Tab — navigation @smoke', () => {
  test('navigates to the roster tab without error', async ({ page }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/roster');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/baseball/league/1/roster');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('clicking the Roster tab navigates from overview', async ({ page }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await page.getByText('My Roster').first().click();
    await expect(page).toHaveURL(/\/roster/);
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

test.describe('Roster Tab – data rendering @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockLeagueDetailGraphQL(page, { teamMembers: MOCK_TEAM_MEMBERS });
    await page.goto('/baseball/league/1/roster');
    await page.waitForLoadState('load');
  });

  test('shows a roster player from mocked team members', async ({ page }) => {
    await expect(
      page.getByText('Mike Johnson', { exact: false }),
    ).toBeVisible();
  });

  test('shows roster position slots for the league', async ({ page }) => {
    // Infield section renders with our mock positions (C and 1B)
    await expect(
      page.getByText('Infield', { exact: true }).first(),
    ).toBeVisible();
  });
});

// ── Waivers (within Roster Tab) ───────────────────────────────────────────────

test.describe('Pending Waivers — with claims @regression', () => {
  test('shows pending waiver claim card when claims exist', async ({
    page,
  }) => {
    await mockLeagueDetailGraphQL(page, {
      waiverClaims: MOCK_WAIVER_CLAIMS,
      teamMembers: MOCK_TEAM_MEMBERS,
    });
    await page.goto('/baseball/league/1/roster');
    await page.waitForLoadState('load');

    // PendingWaiverClaims renders when there are pending claims
    await expect(
      page.getByText('Waiver Target', { exact: false }),
    ).toBeVisible();
  });
});

test.describe('Pending Waivers — no claims @regression', () => {
  test('does not show waiver claim card when there are no pending claims', async ({
    page,
  }) => {
    await mockLeagueDetailGraphQL(page, {
      waiverClaims: [],
      teamMembers: MOCK_TEAM_MEMBERS,
    });
    await page.goto('/baseball/league/1/roster');
    await page.waitForLoadState('load');

    // The waiver claims component renders null when empty — no card should appear
    await expect(
      page.getByText('Pending Waiver Claims', { exact: false }),
    ).not.toBeVisible();
  });
});
