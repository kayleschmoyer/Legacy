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

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { agoIso } from '../mocks/time';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { DESKTOP_VIEWPORT } from '../utils/viewport';

// Page-object migration (LS-8092 / ADR-0015): all locators live on
// `leaguePage` — specs are selector-free. The default `test` from
// `../fixtures/pages` is the auth-enhanced isolated test with page objects
// injected (identical isolation to the previous `../fixtures/auth-enhanced`
// import, now with `{ leaguePage, … }`).

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  currentWeekNumber: 1,
  leaguePhase: null,
  weekAdvanceStatus: null,
  faabBudgetDefault: null,
  pitcherStartsPerMatchup: 1,
  gamesPerMatchup: 5,
  totalMatchups: 10,
  playoffEnabled: true,
  playoffFormat: '4-team',
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
    occurredAt: agoIso(3_600_000),
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
    occurredAt: agoIso(7_200_000),
  },
];

const MOCK_CHAT_MESSAGES = [
  {
    __typename: 'LeagueChatMessage',
    id: '1',
    userId: 1,
    messageText: 'Good luck this week everyone!',
    timestamp: agoIso(1_800_000),
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
    timestamp: agoIso(900_000),
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
    createdAt: agoIso(600_000),
  },
];

// ── History Tab Mock Data ─────────────────────────────────────────────────────

const MOCK_HISTORY_SEASONS = [
  {
    __typename: 'LeagueHistory',
    leagueId: 100,
    seasonNumber: 1,
    name: 'Playoff Push League — Season 1',
    frozenAt: '2023-12-01T00:00:00.000Z',
    leaguePhase: 'complete',
    totalMatchups: 10,
    championTeamId: 1,
    championTeamName: 'Alpha Squad',
    runnerUpTeamId: 2,
    runnerUpTeamName: 'Beta Force',
    championScore: 145.5,
    runnerUpScore: 132.2,
  },
  {
    __typename: 'LeagueHistory',
    leagueId: 1,
    seasonNumber: 2,
    name: 'Playoff Push League — Season 2',
    frozenAt: null,
    leaguePhase: 'regular',
    totalMatchups: 10,
    championTeamId: null,
    championTeamName: null,
    runnerUpTeamId: null,
    runnerUpTeamName: null,
    championScore: null,
    runnerUpScore: null,
  },
];

const MOCK_ALL_TIME_RECORDS = [
  {
    __typename: 'AllTimeRecord',
    recordType: 'highest_score',
    value: 201.4,
    teamName: 'Alpha Squad',
    teamId: 1,
    seasonNumber: 1,
    leagueId: 1,
    details: null,
  },
  {
    __typename: 'AllTimeRecord',
    recordType: 'most_wins',
    value: 9,
    teamName: 'Beta Force',
    teamId: 2,
    seasonNumber: 1,
    leagueId: 1,
    details: null,
  },
  {
    __typename: 'AllTimeRecord',
    recordType: 'most_points_season',
    value: 1456.8,
    teamName: 'Alpha Squad',
    teamId: 1,
    seasonNumber: 1,
    leagueId: 1,
    details: null,
  },
  {
    __typename: 'AllTimeRecord',
    recordType: 'longest_win_streak',
    value: 7,
    teamName: 'Alpha Squad',
    teamId: 1,
    seasonNumber: 1,
    leagueId: 1,
    details: null,
  },
];

const MOCK_STANDINGS_FOR_HISTORY = [
  {
    __typename: 'TeamStanding',
    teamId: 1,
    teamName: 'Alpha Squad',
    wins: 9,
    losses: 1,
    ties: 0,
    winPercentage: 0.9,
    pointsFor: 1456.8,
    pointsAgainst: 1100.5,
    primaryColor: null,
  },
  {
    __typename: 'TeamStanding',
    teamId: 2,
    teamName: 'Beta Force',
    wins: 7,
    losses: 3,
    ties: 0,
    winPercentage: 0.7,
    pointsFor: 1210.3,
    pointsAgainst: 1055.2,
    primaryColor: null,
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
  /** Override the league inviteCode (null simulates a league whose invite code hasn't been generated yet) */
  inviteCode?: string | null;
  /**
   * Override the team ID returned by getuserteamid.
   * Pass null to simulate a spectator who has no team in the league.
   * Defaults to 1 (the test user's team).
   */
  userTeamId?: number | null;
  /**
   * Override the league owner ID in the mock league response.
   * Defaults to 1 (matches the test user, making them commissioner).
   * Pass a different value (e.g. 999) to simulate a non-commissioner view.
   */
  leagueOwner?: number;
  /** Capture rename mutation calls */
  onRenameTeam?: (variables: {
    teamId: number;
    leagueId: number;
    newName: string;
  }) => void;
  /** Override history seasons returned by getleaguehistory (default: [] = first-season state) */
  historySeasons?: typeof MOCK_HISTORY_SEASONS | [];
  /** Override all-time records returned by getalltimerecords (default: MOCK_ALL_TIME_RECORDS) */
  allTimeRecords?: typeof MOCK_ALL_TIME_RECORDS | [];
  /** Override standings returned by getleaguestandings */
  standings?: typeof MOCK_STANDINGS_FOR_HISTORY | [];
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
    inviteCode,
    onRenameTeam,
    userTeamId = 1,
    leagueOwner = 1,
    historySeasons = [],
    allTimeRecords = MOCK_ALL_TIME_RECORDS,
    standings = [],
  } = opts;
  const leagueForResponse =
    inviteCode !== undefined || leagueOwner !== 1
      ? {
          ...MOCK_LEAGUE,
          ...(inviteCode !== undefined ? { inviteCode } : {}),
          owner: leagueOwner,
        }
      : MOCK_LEAGUE;

  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();

    if (operation === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: leagueForResponse } }),
      });
    } else if (operation === 'renameteam') {
      const rawBody = route.request().postData() ?? '';
      try {
        const parsed = JSON.parse(rawBody) as {
          variables?: {
            teamId?: number;
            leagueId?: number;
            newName?: string;
          };
        };
        if (parsed.variables && onRenameTeam) {
          onRenameTeam({
            teamId: Number(parsed.variables.teamId ?? 0),
            leagueId: Number(parsed.variables.leagueId ?? 0),
            newName: String(parsed.variables.newName ?? ''),
          });
        }
      } catch {
        /* malformed body — let the test see no callback */
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            renameTeam: {
              ...MOCK_TEAMS[0],
              name: 'Renamed Squad',
            },
          },
        }),
      });
    } else if (operation === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (operation === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (operation === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId } }),
      });
    } else if (
      operation === 'getteamtradeoffers' ||
      operation === 'getleaguetradeoffers'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { teamTradeOffers: [], leagueTradeOffers: [] },
        }),
      });
    } else if (operation === 'getteammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers } }),
      });
    } else if (operation === 'getleagueactivity') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: activityEvents } }),
      });
    } else if (
      operation === 'getleaguechatmessages' ||
      operation === 'getleaguemessages'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueMessages: chatMessages } }),
      });
    } else if (operation === 'getleagueannouncements') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueAnnouncements: [] } }),
      });
    } else if (operation === 'getteamwaiverclaims') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamWaiverClaims: waiverClaims } }),
      });
    } else if (operation === 'getleaguestandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: standings } }),
      });
    } else if (
      extractOperationName(route).toLowerCase() === 'getleaguehistory'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueHistory: historySeasons } }),
      });
    } else if (
      extractOperationName(route).toLowerCase() === 'getalltimerecords'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getAllTimeRecords: allTimeRecords } }),
      });
    } else if (operation === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (
      operation === 'getmatchupbyid' ||
      operation === 'getmatchupsforleague' ||
      operation === 'getmatchupplayers'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    } else if (
      operation === 'getleaguescoringprofile' ||
      operation === 'updateleaguescoringprofile'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

test.describe('Overview Tab — navigation @smoke', () => {
  test('navigates to the overview tab without error', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'overview');

    await expect(page).toHaveURL('/baseball/league/1/overview');
    await leaguePage.expectNoAppError();
  });

  test('shows the league name on the overview page', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'overview');

    // V2: league name is in an <h1> element (no data-testid="league-title")
    await leaguePage.leagueNameHeading('Playoff Push League').expectVisible();
  });

  test('overview tab button is active when on the overview route', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'overview');

    // The tab bar should contain an "Overview" label
    await leaguePage.text('Overview').first().expectVisible();
  });
});

// ── Activity Feed (within Overview) ─────────────────────────────────────────

test.describe('Activity Feed – section rendering @regression', () => {
  test.beforeEach(async ({ page, leaguePage }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'overview');
  });

  test('shows "League Activity" section heading', async ({ leaguePage }) => {
    await leaguePage.text('League Activity').expectVisible();
  });

  test('shows a "Trade accepted" event from mocked activity data', async ({
    leaguePage,
  }) => {
    await leaguePage.text('Trade accepted').expectVisible();
  });

  test('shows actor usernames from mocked activity events', async ({
    leaguePage,
  }) => {
    await leaguePage
      .text('Alpha Squad', { exact: false })
      .first()
      .expectVisible();
  });
});

test.describe('Activity Feed — empty state @regression', () => {
  test('shows "No activity yet" when there are no activity events', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page, { activityEvents: [] });
    await leaguePage.gotoDetail(1, 'overview');

    await leaguePage.text('No activity yet', { exact: false }).expectVisible();
  });
});

// ── Chat Section (within Overview) ───────────────────────────────────────────

test.describe('League Chat – section rendering @regression', () => {
  test.beforeEach(async ({ page, leaguePage }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'overview');
  });

  test('shows "League Chat" section heading', async ({ leaguePage }) => {
    await leaguePage.text('Chat', { exact: true }).expectVisible();
  });

  test('shows chat messages from mocked data', async ({ leaguePage }) => {
    // Switch to the Chat sub-tab (Activity is selected by default)
    await leaguePage.openTab('Chat', { exact: true });
    await leaguePage.text('Good luck this week everyone!').expectVisible();
    await leaguePage.text('May the best roster win!').expectVisible();
  });

  test('shows message send input field', async ({ leaguePage }) => {
    // Switch to the Chat sub-tab first
    await leaguePage.openTab('Chat', { exact: true });
    // Chat input should be rendered (textarea or input)
    await leaguePage.chatInput.expectVisible();
  });
});

// ── Standings Tab — navigation smoke ─────────────────────────────────────────

test.describe('Standings Tab — navigation @smoke', () => {
  test('navigates to standings tab without error', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'standings');

    await expect(page).toHaveURL('/baseball/league/1/standings');
    await leaguePage.expectNoAppError();
  });

  test('clicking the Standings tab navigates from overview', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'overview');

    await leaguePage.openTab('Standings');
    await expect(page).toHaveURL(/\/standings/);
    await leaguePage.expectNoAppError();
  });
});

// ── Roster Tab ───────────────────────────────────────────────────────────────

test.describe('Roster Tab — navigation @smoke', () => {
  test('navigates to the roster tab without error', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'roster');

    await expect(page).toHaveURL('/baseball/league/1/roster');
    await leaguePage.expectNoAppError();
  });

  test('clicking the Roster tab navigates from overview', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'overview');

    await leaguePage.openTab('My Roster');
    await expect(page).toHaveURL(/\/roster/);
    await leaguePage.expectNoAppError();
  });
});

test.describe('Roster Tab – data rendering @regression', () => {
  test.beforeEach(async ({ page, leaguePage }) => {
    await mockLeagueDetailGraphQL(page, { teamMembers: MOCK_TEAM_MEMBERS });
    await leaguePage.gotoDetail(1, 'roster');
  });

  test('shows a roster player from mocked team members', async ({
    leaguePage,
  }) => {
    await leaguePage.text('Mike Johnson', { exact: false }).expectVisible();
  });

  test('shows roster position slots for the league', async ({ leaguePage }) => {
    // RosterBoardV2 groups the league's roster positions under a
    // "Starting Hitters" section (mock positions C and 1B are both hitters).
    await leaguePage.heading('Starting Hitters').expectVisible();
  });
});

// ── Waivers (within Roster Tab) ───────────────────────────────────────────────

/**
 * Roster.tsx renders PendingWaiverClaims with compact={isNarrow} below the
 * narrow-viewport breakpoint, which shows only a claim-count summary and
 * never the per-claim player name asserted below (LS-9493). Pinned rather
 * than skipped so the pending-claim assertion still runs under the mobile
 * projects (LS-9712).
 */
test.describe('Pending Waivers — with claims @regression', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test('shows pending waiver claim card when claims exist', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page, {
      waiverClaims: MOCK_WAIVER_CLAIMS,
      teamMembers: MOCK_TEAM_MEMBERS,
    });
    await leaguePage.gotoDetail(1, 'roster');

    // PendingWaiverClaims renders when there are pending claims
    await leaguePage.text('Waiver Target', { exact: false }).expectVisible();
  });
});

test.describe('Pending Waivers — no claims @regression', () => {
  test('does not show waiver claim card when there are no pending claims', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page, {
      waiverClaims: [],
      teamMembers: MOCK_TEAM_MEMBERS,
    });
    await leaguePage.gotoDetail(1, 'roster');

    // The waiver claims component renders null when empty — no card should appear
    await leaguePage
      .text('Pending Waiver Claims', { exact: false })
      .expectHidden();
  });
});

// ── LS-2940: /my-team alias for /team-settings @regression ───────────────────

test.describe('my-team URL alias — LS-2940 regression @regression', () => {
  test.beforeEach(async ({ page, leaguePage }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'my-team');
  });

  test('/my-team stays on /my-team, mounts team-settings panel, and shows no error', async ({
    page,
    leaguePage,
  }) => {
    // URL should remain /my-team (alias, not a redirect to /team-settings or /overview)
    await expect(page).toHaveURL(/\/baseball\/league\/1\/my-team/);
    await leaguePage.expectNoAppError();
    // V2: The team settings panel is identified by the team name input
    // (no #panel-team-settings ID in V2 — that was the legacy page)
    await leaguePage.teamNameSettingInput.expectAttached();
  });
});

// ── LS-1303: Unknown tab and commissioner redirect @regression ────────────────

test.describe('Unknown Tab Redirect — LS-1303 regression @regression', () => {
  test('unknown tab segment is replaced with /overview in URL', async ({
    page,
  }) => {
    await mockLeagueDetailGraphQL(page);
    // Navigate to an unknown tab; the component should replace-navigate to /overview
    await page.goto('/baseball/league/1/unknown-tab-xyz');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(/\/baseball\/league\/1\/overview/);
  });

  test('navigating back after unknown-tab redirect does not loop', async ({
    page,
  }) => {
    await mockLeagueDetailGraphQL(page);

    // First land on a known page so there is history to go back to
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Then navigate to an unknown tab — replace-navigate means history stays clean.
    // Firefox throws NS_BINDING_ABORTED when a React replace-navigate fires during
    // page load; use waitUntil:'commit' so we don't wait for the aborted load,
    // then wait for the final redirected URL explicitly.
    await page
      .goto('/baseball/league/1/not-a-real-tab', { waitUntil: 'commit' })
      .catch(() => {
        /* Firefox: aborted load is expected */
      });
    await page.waitForURL(/\/baseball\/league\/1\/overview/, { timeout: 8000 });

    await expect(page).toHaveURL(/\/baseball\/league\/1\/overview/);

    // Going back should leave the league detail page, not loop
    await page.goBack();
    // We should be back at the pre-league URL (overview from first visit), not stuck on the redirect target
    await expect(page).not.toHaveURL(/not-a-real-tab/);
  });
});

// ── LS-4018: Team rename confirmation @regression ────────────────────────────

test.describe('Team rename confirmation — LS-4018 @regression', () => {
  test('clicking Save Name opens a confirmation dialog and does not call the rename mutation directly', async ({
    page,
    leaguePage,
  }) => {
    let renameCalled = false;
    await mockLeagueDetailGraphQL(page, {
      onRenameTeam: () => {
        renameCalled = true;
      },
    });
    await leaguePage.gotoDetail(1, 'team-settings');

    const input = leaguePage.teamNameSettingInput;
    await input.expectVisible();
    await input.fill('Brand New Name');

    await leaguePage.saveTeamName();

    const dialog = leaguePage.renameConfirmDialog;
    await dialog.expectVisible();
    await dialog.expectAttribute('role', 'alertdialog');
    await leaguePage.text(/rename team\?/i, { exact: false }).expectVisible();
    expect(renameCalled).toBe(false);
  });

  test('cancel closes the dialog without renaming', async ({
    page,
    leaguePage,
  }) => {
    let renameCalled = false;
    await mockLeagueDetailGraphQL(page, {
      onRenameTeam: () => {
        renameCalled = true;
      },
    });
    await leaguePage.gotoDetail(1, 'team-settings');

    await leaguePage.teamNameSettingInput.fill('Brand New Name');
    await leaguePage.saveTeamName();

    const dialog = leaguePage.renameConfirmDialog;
    await dialog.expectVisible();

    await leaguePage.cancelRename();
    await dialog.expectCount(0);
    expect(renameCalled).toBe(false);
  });

  test('confirming the dialog submits the rename mutation with the new name', async ({
    page,
    leaguePage,
  }) => {
    const renameVariables: Array<{
      teamId: number;
      leagueId: number;
      newName: string;
    }> = [];
    await mockLeagueDetailGraphQL(page, {
      onRenameTeam: (v) => renameVariables.push(v),
    });
    await leaguePage.gotoDetail(1, 'team-settings');

    await leaguePage.teamNameSettingInput.fill('Brand New Name');
    await leaguePage.saveTeamName();

    await leaguePage.confirmRename();

    await expect.poll(() => renameVariables.length).toBeGreaterThan(0);
    expect(renameVariables[0].newName).toBe('Brand New Name');
  });

  test('pressing Enter in the input opens the confirmation dialog instead of submitting directly', async ({
    page,
    leaguePage,
  }) => {
    let renameCalled = false;
    await mockLeagueDetailGraphQL(page, {
      onRenameTeam: () => {
        renameCalled = true;
      },
    });
    await leaguePage.gotoDetail(1, 'team-settings');

    const input = leaguePage.teamNameSettingInput;
    await input.fill('Enter Submitted Name');
    await input.press('Enter');

    await leaguePage.renameConfirmDialog.expectVisible();
    expect(renameCalled).toBe(false);
  });
});

// ── History Tab — navigation @smoke ──────────────────────────────────────────

test.describe('History Tab — navigation @smoke', () => {
  test('navigates to the history tab without error', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'history');

    await expect(page).toHaveURL('/baseball/league/1/history');
    await leaguePage.expectNoAppError();
  });

  test('clicking the History tab navigates from overview', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'overview');

    await leaguePage.openTab('History');
    await expect(page).toHaveURL(/\/history/);
    await leaguePage.expectNoAppError();
  });
});

// ── History Tab — first-season empty state @regression ───────────────────────

test.describe('History Tab — first season state @regression', () => {
  test('shows "First season in progress" when only one season exists', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page, { historySeasons: [] });
    await leaguePage.gotoDetail(1, 'history');

    await leaguePage
      .text('First season in progress', { exact: false })
      .expectVisible();
  });

  test('does not show season selector when history is empty', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page, { historySeasons: [] });
    await leaguePage.gotoDetail(1, 'history');

    await leaguePage.seasonSelector.expectNotAttached();
  });
});

// ── History Tab — season selector @regression ─────────────────────────────────

test.describe('History Tab — season selector @regression', () => {
  test('shows season selector dropdown when multiple seasons exist', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page, {
      historySeasons: MOCK_HISTORY_SEASONS,
      standings: MOCK_STANDINGS_FOR_HISTORY,
    });
    await leaguePage.gotoDetail(1, 'history');

    await leaguePage.seasonSelector.expectVisible();
  });

  test('season selector lists each past season by number', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page, {
      historySeasons: MOCK_HISTORY_SEASONS,
      standings: MOCK_STANDINGS_FOR_HISTORY,
    });
    await leaguePage.gotoDetail(1, 'history');

    await leaguePage.seasonSelector.expectContainsText('Season 1');
    await leaguePage.seasonSelector.expectContainsText('Season 2');
  });
});

// ── History Tab — standings table @regression ─────────────────────────────────

test.describe('History Tab — standings table @regression', () => {
  test.beforeEach(async ({ page, leaguePage }) => {
    await mockLeagueDetailGraphQL(page, {
      historySeasons: MOCK_HISTORY_SEASONS,
      standings: MOCK_STANDINGS_FOR_HISTORY,
    });
    await leaguePage.gotoDetail(1, 'history');
  });

  test('shows League History section heading', async ({ leaguePage }) => {
    await leaguePage.text('League History').expectVisible();
  });

  test('renders standings table with W column header', async ({
    leaguePage,
  }) => {
    await leaguePage.standingsColumnHeader(/^W$/i).expectVisible();
  });

  test('renders standings table with L column header', async ({
    leaguePage,
  }) => {
    await leaguePage.standingsColumnHeader(/^L$/i).expectVisible();
  });

  test('renders standings table with T column header', async ({
    leaguePage,
  }) => {
    await leaguePage.standingsColumnHeader(/^T$/i).expectVisible();
  });

  test('renders standings table with Win% column header', async ({
    leaguePage,
  }) => {
    await leaguePage.standingsColumnHeader(/win\s*%/i).expectVisible();
  });

  test('renders standings table with PF column header', async ({
    leaguePage,
  }) => {
    await leaguePage.standingsColumnHeader(/^PF$/i).expectVisible();
  });

  test('renders standings table with PA column header', async ({
    leaguePage,
  }) => {
    await leaguePage.standingsColumnHeader(/^PA$/i).expectVisible();
  });

  test('shows team names from mocked standings data', async ({
    leaguePage,
  }) => {
    await leaguePage
      .text('Alpha Squad', { exact: false })
      .first()
      .expectVisible();
    await leaguePage
      .text('Beta Force', { exact: false })
      .first()
      .expectVisible();
  });
});

// ── History Tab — all-time records @regression ────────────────────────────────

test.describe('History Tab — all-time records @regression', () => {
  test.beforeEach(async ({ page, leaguePage }) => {
    await mockLeagueDetailGraphQL(page, {
      historySeasons: MOCK_HISTORY_SEASONS,
      standings: MOCK_STANDINGS_FOR_HISTORY,
      allTimeRecords: MOCK_ALL_TIME_RECORDS,
    });
    await leaguePage.gotoDetail(1, 'history');
  });

  test('shows All-Time Records section heading', async ({ leaguePage }) => {
    await leaguePage.text('All-Time Records').expectVisible();
  });

  test('shows Highest Single-Matchup Score record card', async ({
    leaguePage,
  }) => {
    await leaguePage
      .text('Highest Single-Matchup Score', { exact: false })
      .expectVisible();
  });

  test('shows Most Wins in a Season record card', async ({ leaguePage }) => {
    await leaguePage
      .text('Most Wins in a Season', { exact: false })
      .expectVisible();
  });

  test('shows Most Points in a Season record card', async ({ leaguePage }) => {
    await leaguePage
      .text('Most Points in a Season', { exact: false })
      .expectVisible();
  });

  test('shows Longest Win Streak record card', async ({ leaguePage }) => {
    await leaguePage
      .text('Longest Win Streak', { exact: false })
      .expectVisible();
  });

  test('shows record holder team name', async ({ leaguePage }) => {
    await leaguePage
      .text('Alpha Squad', { exact: false })
      .first()
      .expectVisible();
  });
});

// ── History Tab — all-time records empty state @regression ────────────────────

test.describe('History Tab — no records state @regression', () => {
  test('shows "No records yet" when all-time records are empty', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page, {
      historySeasons: MOCK_HISTORY_SEASONS,
      standings: MOCK_STANDINGS_FOR_HISTORY,
      allTimeRecords: [],
    });
    await leaguePage.gotoDetail(1, 'history');

    await leaguePage.text('No records yet', { exact: false }).expectVisible();
  });
});

// ── LS-4018: QR code loading skeleton @regression ────────────────────────────

test.describe('QR code loading skeleton — LS-4018 @regression', () => {
  test('shows a skeleton placeholder while inviteCode is unavailable, with accessible loading state', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page, { inviteCode: null });
    await leaguePage.gotoDetail(1, 'overview');

    await leaguePage.showQrCode();

    const skeleton = leaguePage.qrCodeSkeleton;
    await skeleton.expectVisible();
    await skeleton.expectAttribute('role', 'status');
    await skeleton.expectAttribute('aria-label', 'Loading QR code');
    await leaguePage.qrCodeSvg.expectCount(0);
  });

  test('renders the QR code (no skeleton) once inviteCode is present', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'overview');

    await leaguePage.showQrCode();

    await leaguePage.qrCodeSvg.expectVisible();
    await leaguePage.qrCodeSkeleton.expectCount(0);
  });
});

// ── Trades Tab ────────────────────────────────────────────────────────────────

test.describe('Trades Tab — navigation @smoke', () => {
  test('navigates to trades tab without error', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'trades');

    await expect(page).toHaveURL('/baseball/league/1/trades');
    await leaguePage.expectNoAppError();
  });

  test('clicking the Trades tab navigates from overview', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'overview');

    await leaguePage.openTab('Trades');
    await expect(page).toHaveURL(/\/trades/);
    await leaguePage.expectNoAppError();
  });
});

test.describe('Trades Tab — member view @regression', () => {
  test('renders Trading Center heading for league members', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'trades');

    await leaguePage.testId('trade-center-heading').expectVisible();
    await leaguePage.expectNoAppError();
  });

  test('does not show spectator banner for league members', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await leaguePage.gotoDetail(1, 'trades');

    await leaguePage.text('Spectator Mode').expectHidden();
  });
});

test.describe('Trades Tab — spectator guard @regression', () => {
  test('shows spectator banner and empty state for non-members', async ({
    page,
    leaguePage,
  }) => {
    await mockLeagueDetailGraphQL(page, { userTeamId: null, leagueOwner: 999 });
    await leaguePage.gotoDetail(1, 'trades');

    await leaguePage.text('Spectator Mode').expectVisible();
    await leaguePage.testId('trade-center-heading').expectVisible();
    await leaguePage.text('Join this league to trade').expectVisible();
    await leaguePage.expectNoAppError();
  });
});
