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
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { agoIso } from '../mocks/time';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

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
  spStartsPerMatchup: 1,
  gamesPerMatchup: 5,
  totalMatchups: 10,
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
  hofOnly: false,
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
  /** Capture rename mutation calls */
  onRenameTeam?: (variables: {
    teamId: number;
    leagueId: number;
    newName: string;
  }) => void;
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
  } = opts;
  const leagueForResponse =
    inviteCode === undefined ? MOCK_LEAGUE : { ...MOCK_LEAGUE, inviteCode };

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (
      postData.includes('getleaguebyid') ||
      postData.includes('"getleague"')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: leagueForResponse } }),
      });
    } else if (postData.includes('renameteam')) {
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
              __typename: 'Team',
              ...MOCK_TEAMS[0],
              name: 'Renamed Squad',
            },
          },
        }),
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
      await unmockedGraphQLFallback(route);
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

    // V2: league name is in an <h1> element (no data-testid="league-title")
    await expect(
      page.getByRole('heading', { name: 'Playoff Push League', level: 1 }),
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

// ── LS-2940: /my-team alias for /team-settings @regression ───────────────────

test.describe('my-team URL alias — LS-2940 regression @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/my-team');
    await page.waitForLoadState('load');
  });

  test('/my-team stays on /my-team, mounts team-settings panel, and shows no error', async ({
    page,
  }) => {
    // URL should remain /my-team (alias, not a redirect to /team-settings or /overview)
    await expect(page).toHaveURL(/\/baseball\/league\/1\/my-team/);
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    // V2: The team settings panel is identified by the team name input
    // (no #panel-team-settings ID in V2 — that was the legacy page)
    await expect(page.locator('#team-name-input')).toBeAttached();
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
  }) => {
    let renameCalled = false;
    await mockLeagueDetailGraphQL(page, {
      onRenameTeam: () => {
        renameCalled = true;
      },
    });
    await page.goto('/baseball/league/1/team-settings');
    await page.waitForLoadState('load');

    const input = page.locator('#team-name-input');
    await expect(input).toBeVisible();
    await input.fill('Brand New Name');

    await page.getByRole('button', { name: /save name/i }).click();

    const dialog = page.getByTestId('rename-team-confirm');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'alertdialog');
    await expect(
      dialog.getByText(/rename team\?/i, { exact: false }),
    ).toBeVisible();
    expect(renameCalled).toBe(false);
  });

  test('cancel closes the dialog without renaming', async ({ page }) => {
    let renameCalled = false;
    await mockLeagueDetailGraphQL(page, {
      onRenameTeam: () => {
        renameCalled = true;
      },
    });
    await page.goto('/baseball/league/1/team-settings');
    await page.waitForLoadState('load');

    await page.locator('#team-name-input').fill('Brand New Name');
    await page.getByRole('button', { name: /save name/i }).click();

    const dialog = page.getByTestId('rename-team-confirm');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).toHaveCount(0);
    expect(renameCalled).toBe(false);
  });

  test('confirming the dialog submits the rename mutation with the new name', async ({
    page,
  }) => {
    const renameVariables: Array<{
      teamId: number;
      leagueId: number;
      newName: string;
    }> = [];
    await mockLeagueDetailGraphQL(page, {
      onRenameTeam: (v) => renameVariables.push(v),
    });
    await page.goto('/baseball/league/1/team-settings');
    await page.waitForLoadState('load');

    await page.locator('#team-name-input').fill('Brand New Name');
    await page.getByRole('button', { name: /save name/i }).click();

    const dialog = page.getByTestId('rename-team-confirm');
    await dialog.getByRole('button', { name: /^rename$/i }).click();

    await expect.poll(() => renameVariables.length).toBeGreaterThan(0);
    expect(renameVariables[0].newName).toBe('Brand New Name');
  });

  test('pressing Enter in the input opens the confirmation dialog instead of submitting directly', async ({
    page,
  }) => {
    let renameCalled = false;
    await mockLeagueDetailGraphQL(page, {
      onRenameTeam: () => {
        renameCalled = true;
      },
    });
    await page.goto('/baseball/league/1/team-settings');
    await page.waitForLoadState('load');

    const input = page.locator('#team-name-input');
    await input.fill('Enter Submitted Name');
    await input.press('Enter');

    await expect(page.getByTestId('rename-team-confirm')).toBeVisible();
    expect(renameCalled).toBe(false);
  });
});

// ── LS-4018: QR code loading skeleton @regression ────────────────────────────

test.describe('QR code loading skeleton — LS-4018 @regression', () => {
  test('shows a skeleton placeholder while inviteCode is unavailable, with accessible loading state', async ({
    page,
  }) => {
    await mockLeagueDetailGraphQL(page, { inviteCode: null });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: /show qr code to invite/i }).click();

    const skeleton = page.getByTestId('qr-code-skeleton');
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveAttribute('role', 'status');
    await expect(skeleton).toHaveAttribute('aria-label', 'Loading QR code');
    await expect(page.getByTestId('qr-code-svg')).toHaveCount(0);
  });

  test('renders the QR code (no skeleton) once inviteCode is present', async ({
    page,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: /show qr code to invite/i }).click();

    await expect(page.getByTestId('qr-code-svg')).toBeVisible();
    await expect(page.getByTestId('qr-code-skeleton')).toHaveCount(0);
  });
});
