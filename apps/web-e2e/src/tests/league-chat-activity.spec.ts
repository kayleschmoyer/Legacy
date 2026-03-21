/**
 * League Chat & Activity Feed — E2E Tests
 *
 * Covers:
 *   - Activity feed event rendering with type badges
 *   - Chat message display with sender names
 *   - Empty activity feed placeholder
 *   - Multiple event type rendering
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
  name: 'Test League',
  owner: 1,
  description: 'Test',
  maxRosterSize: 25,
  draftStatus: 'not-started',
  currentMatchup: null,
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
  inviteCode: 'TEST1234',
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

const MOCK_CHAT_MESSAGES = [
  {
    __typename: 'LeagueChatMessage',
    id: '1',
    userId: 1,
    messageText: 'Hey everyone!',
    timestamp: new Date(Date.now() - 1_800_000).toISOString(),
    messageType: 'text',
    gifUrl: null,
    metadata: null,
    sender: { username: 'testuser', avatarUrl: null },
  },
  {
    __typename: 'LeagueChatMessage',
    id: '2',
    userId: 2,
    messageText: 'Draft prep time!',
    timestamp: new Date(Date.now() - 900_000).toISOString(),
    messageType: 'text',
    gifUrl: null,
    metadata: null,
    sender: { username: 'opponent', avatarUrl: null },
  },
];

const MOCK_ACTIVITY_EVENTS = [
  {
    __typename: 'LeagueActivityEvent',
    id: '1',
    leagueId: 1,
    teamId: 1,
    actorUserId: 1,
    actorUsername: 'testuser',
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
    actorUsername: 'opponent',
    eventType: 'waiver_claimed',
    payload: JSON.stringify({ playerId: 42 }),
    occurredAt: new Date(Date.now() - 7_200_000).toISOString(),
  },
];

const MOCK_MULTI_ACTIVITY_EVENTS = [
  ...MOCK_ACTIVITY_EVENTS,
  {
    __typename: 'LeagueActivityEvent',
    id: '3',
    leagueId: 1,
    teamId: 1,
    actorUserId: 1,
    actorUsername: 'testuser',
    eventType: 'draft_pick_made',
    payload: JSON.stringify({ round: 1, pickNumber: 3 }),
    occurredAt: new Date(Date.now() - 10_800_000).toISOString(),
  },
  {
    __typename: 'LeagueActivityEvent',
    id: '4',
    leagueId: 1,
    teamId: 1,
    actorUserId: 1,
    actorUsername: 'testuser',
    eventType: 'league_announcement',
    payload: JSON.stringify({ messageText: 'Welcome to the league!' }),
    occurredAt: new Date(Date.now() - 14_400_000).toISOString(),
  },
];

// ── GraphQL Mock Setup ────────────────────────────────────────────────────────

interface MockOptions {
  activityEvents?: typeof MOCK_ACTIVITY_EVENTS | [];
  chatMessages?: typeof MOCK_CHAT_MESSAGES | [];
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOptions = {},
) {
  const {
    activityEvents = MOCK_ACTIVITY_EVENTS,
    chatMessages = MOCK_CHAT_MESSAGES,
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
        body: JSON.stringify({ data: { leaguePositions: [] } }),
      });
    } else if (postData.includes('getuserteamid')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
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
    } else if (
      postData.includes('getteamwaiverclaims') ||
      postData.includes('teamwaiverclaims')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamWaiverClaims: [] } }),
      });
    } else if (
      postData.includes('getteammembers') ||
      postData.includes('teammembers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
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
    } else {
      await route.fallback();
    }
  });
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

test.describe('Activity feed displays events with type badges @regression', () => {
  test('shows trade and waiver activity events with type badges', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Verify the activity section heading is present
    await expect(page.getByText('League Activity')).toBeVisible();

    // Verify trade event renders with its title
    await expect(page.getByText('Trade accepted')).toBeVisible();

    // Verify waiver event renders with its title
    await expect(page.getByText('Waiver claim processed')).toBeVisible();

    // Verify type badges are displayed
    await expect(
      page.getByText('Trades', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Waivers', { exact: true }).first(),
    ).toBeVisible();
  });
});

// ── Chat Messages ─────────────────────────────────────────────────────────────

test.describe('Chat messages display with sender names @regression', () => {
  test('shows chat messages and sender usernames', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Switch to the Chat sub-tab (Activity is selected by default)
    await page.getByText('Chat', { exact: true }).click();

    // Verify chat messages are visible
    await expect(page.getByText('Hey everyone!')).toBeVisible();
    await expect(page.getByText('Draft prep time!')).toBeVisible();

    // The component only renders the sender username for messages from OTHER
    // users (the current user's own messages show the bubble without a name,
    // like most chat UIs).  The auth mock sets the current user to id=1
    // ("testuser"), so only "opponent" (userId=2) should display a username.
    await expect(
      page.getByText('opponent', { exact: false }).first(),
    ).toBeVisible();
  });
});

// ── Empty Activity Feed ───────────────────────────────────────────────────────

test.describe('Empty activity feed shows placeholder @regression', () => {
  test('shows "No activity yet" when there are no activity events', async ({
    page,
  }) => {
    await setupGraphQL(page, { activityEvents: [] });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await expect(
      page.getByText('No activity yet', { exact: false }),
    ).toBeVisible();

    // Verify the descriptive placeholder text is shown
    await expect(
      page.getByText('Activity will appear here', { exact: false }),
    ).toBeVisible();
  });
});

// ── Multiple Event Types ──────────────────────────────────────────────────────

test.describe('Activity feed shows multiple event types @regression', () => {
  test('renders trade, waiver, draft, and commissioner events', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      activityEvents: MOCK_MULTI_ACTIVITY_EVENTS,
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Verify all four event types are rendered
    await expect(page.getByText('Trade accepted')).toBeVisible();
    await expect(page.getByText('Waiver claim processed')).toBeVisible();
    await expect(
      page.getByText('Round 1, Pick 3', { exact: false }),
    ).toBeVisible();
    await expect(page.getByText('League announcement')).toBeVisible();

    // Verify the event count footer reflects the total
    await expect(
      page.getByText('Showing 4 of 4 events', { exact: false }),
    ).toBeVisible();

    // Verify filter chips appear for each type with events
    await expect(
      page.getByText('Trades', { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Waivers', { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Draft', { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Commissioner', { exact: false }).first(),
    ).toBeVisible();
  });
});
