/**
 * Commissioner Tab Navigation — E2E Tests (LS-588)
 *
 * Covers commissioner tab navigation and pre-season states on the League Detail page:
 *   /baseball/league/:id/commissioner
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Default test JWT has id=1, so leagues with owner=1 give commissioner access.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Mock Data ─────────────────────────────────────────────────────────────────

/** League owned by user id=1 (matches the default test JWT). */
function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Test Commissioner League',
    description: 'E2E commissioner controls test league',
    owner: 1,
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
    inviteCode: 'COMM5678',
    userMembership: { teamId: 1 },
    minCareerGames: 50,
    minCareerSeasons: 3,
    waiverType: 'standard',
    gamesPerMatchup: 5,
    spStartsPerMatchup: 1,
    totalMatchups: 10,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    frozenAt: null,
    lmNotes: null,
    currentWeekNumber: null,
    leaguePhase: null,
    weekAdvanceStatus: null,
    faabBudgetDefault: null,
    isMockDraft: false,
    previousLeagueId: null,
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
    ...overrides,
  };
}

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
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
];

/** A matchup in week 1 with some / all games selected. */
function makeMatchup(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Matchup',
    id: 1,
    leagueId: 1,
    weekNumber: 1,
    team1Id: 1,
    team2Id: 2,
    status: 'in-progress',
    selectedGamesCount: 0,
    gamesPerMatchup: 5,
    statsLoadingStatus: 'not_started',
    ...overrides,
  };
}

// ── GraphQL Route Setup ────────────────────────────────────────────────────────

interface MockOptions {
  league?: ReturnType<typeof makeLeague>;
  matchups?: ReturnType<typeof makeMatchup>[];
  currentWeek?: number | null;
  draftMode?: string;
  /** Called when autoSelectGames mutation fires; return the response data. */
  onAutoSelectGames?: () => unknown;
  /** Called when autoAdvanceMatchups mutation fires; return the response data. */
  onAutoAdvanceMatchups?: () => unknown;
  /** Called when processWaiverClaims mutation fires; return the response data. */
  onProcessWaiverClaims?: () => unknown;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOptions = {},
) {
  const {
    league = makeLeague(),
    matchups = [],
    currentWeek = null,
    draftMode = 'live',
    onAutoSelectGames,
    onAutoAdvanceMatchups,
    onProcessWaiverClaims,
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
        body: JSON.stringify({ data: { league } }),
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
    } else if (postData.includes('getmatchupsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsForLeague: matchups } }),
      });
    } else if (postData.includes('getcurrentweekforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getCurrentWeekForLeague: currentWeek },
        }),
      });
    } else if (
      postData.includes('getleaguedraft') ||
      postData.includes('"getleaguedraftquery"')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getLeagueDraft: { __typename: 'Draft', draftMode },
          },
        }),
      });
    } else if (postData.includes('autoselectgames')) {
      const result = onAutoSelectGames?.() ?? { success: true };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { autoSelectGames: result } }),
      });
    } else if (postData.includes('autoadvancematchups')) {
      const result = onAutoAdvanceMatchups?.() ?? { success: true };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { autoAdvanceMatchups: result } }),
      });
    } else if (postData.includes('processwaiverclaims')) {
      const result = onProcessWaiverClaims?.() ?? {
        processed: 3,
        succeeded: 2,
        failed: 1,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { processWaiverClaims: result } }),
      });
    } else if (
      postData.includes('getuserleagues') ||
      postData.includes('getusers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [league] } }),
      });
    } else if (
      postData.includes('getleagueactivity') ||
      postData.includes('leagueactivity')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: [] } }),
      });
    } else if (
      postData.includes('getleaguechatmessages') ||
      postData.includes('getleaguemessages')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueMessages: [] } }),
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
      postData.includes('getmatchupbyid') ||
      postData.includes('getmatchupplayers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Commissioner Tab — Navigation ────────────────────────────────────────────

test.describe('Commissioner Tab — navigation @smoke', () => {
  test('navigates to commissioner tab without error', async ({ page }) => {
    await setupGraphQL(page, { league: makeLeague() });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/baseball/league/1/commissioner');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('commissioner tab is visible in tab bar for commissioner', async ({
    page,
  }) => {
    await setupGraphQL(page, { league: makeLeague({ owner: 1 }) });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // V2: tab bar uses role="tab" buttons inside a role="tablist" aria-label="League sections".
    // Scope to that tablist to avoid strict-mode conflict with the RoleBar tablist
    // (aria-label="View role") which also has a "Commissioner" tab for commissioners.
    await expect(
      page
        .getByRole('tablist', { name: 'League sections' })
        .getByRole('tab', { name: 'Commissioner' }),
    ).toBeVisible();
  });

  test('shows the league name on the commissioner page', async ({ page }) => {
    await setupGraphQL(page, { league: makeLeague() });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // V2: league name is in an <h1> element (no data-testid="league-title")
    await expect(
      page.getByRole('heading', { name: 'Test Commissioner League', level: 1 }),
    ).toBeVisible();
  });
});

// ── Commissioner Tab — Non-Commissioner Access ────────────────────────────────

test.describe('Commissioner Tab — non-commissioner access @regression', () => {
  test('commissioner tab button is hidden for non-commissioner members', async ({
    page,
  }) => {
    // League owned by user 2 — the test user (id=1) is NOT the commissioner
    await setupGraphQL(page, { league: makeLeague({ owner: 2 }) });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Wait for tabs to render
    await expect(
      page.getByText('Overview', { exact: false }).first(),
    ).toBeVisible();

    // V2: the Commissioner tab is filtered out of the DOM entirely for non-commissioners
    // (TabBar uses TABS.filter(...commishOnly) — it's never rendered, not just hidden)
    const commissionerTab = page.getByRole('tab', { name: /commissioner/i });
    await expect(commissionerTab).not.toBeAttached();
  });
});

// ── Next Step Control — Draft / Create Week 1 States ─────────────────────────

test.describe('Next Step — pre-season states @critical', () => {
  test('shows "Start Draft" button when league draft has not started', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'not-started' }),
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // NextStepControl renders a Tamagui Button with data-testid="start-draft-button"
    // and text "Start Draft". The testid is more reliable than role-based selectors
    // for Tamagui components which may render as div[role="button"] on web.
    await expect(page.getByTestId('start-draft-button')).toBeVisible();
    await expect(page.getByTestId('start-draft-button')).toContainText(
      /start draft/i,
    );
  });

  test('shows "Create Week 1 Matchups" when draft is complete but no matchups exist', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed' }),
      matchups: [],
      currentWeek: null,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    await expect(page.getByTestId('start-draft-button')).toBeVisible();
    await expect(page.getByTestId('start-draft-button')).toContainText(
      /create week 1 matchups/i,
    );
  });
});
