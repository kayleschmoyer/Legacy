/**
 * Season Renewal — E2E Tests (LS-1616)
 *
 * Validates the season renewal UI on the commissioner tab for leagues with
 * a completed season. All GraphQL queries are mocked — no live backend.
 *
 * Covers:
 *   1. Season renewal section visible for commissioner of completed league
 *   2. Renewal dialog displays roster carry-over options
 *   3. Non-commissioner cannot see renewal controls
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

/** League owned by the given user. Defaults to user id=1 (test JWT). */
function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Season Renewal Test League',
    description: 'E2E season renewal test league',
    owner: 1,
    maxRosterSize: 25,
    draftStatus: 'completed',
    currentMatchup: null,
    numberOfTeams: 4,
    playerPool: 'all',
    draftMode: 'automated',
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
    inviteCode: 'RENEW1234',
    userMembership: { teamId: 1 },
    minCareerGames: 50,
    minCareerSeasons: 3,
    waiverType: 'standard',
    gamesPerMatchup: 5,
    spStartsPerMatchup: 1,
    totalMatchups: 10,
    playoffEnabled: false,
    playoffFormat: null,
    playoffMultiWeek: false,
    frozenAt: null,
    lmNote: null,
    ...overrides,
  };
}

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Dynasty Kings',
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
    name: 'The Comeback Kids',
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

/** Completed matchups covering all 10 weeks (highestWeek = totalMatchups). */
function makeCompletedMatchups() {
  return Array.from({ length: 10 }, (_, i) => ({
    __typename: 'Matchup',
    id: i + 1,
    leagueId: 1,
    weekNumber: i + 1,
    team1Id: 1,
    team2Id: 2,
    status: 'completed',
    selectedGamesCount: 5,
    gamesPerMatchup: 5,
    statsLoadingStatus: 'not_started',
  }));
}

// ── GraphQL Route Setup ──────────────────────────────────────────────────────

interface MockOptions {
  league?: ReturnType<typeof makeLeague>;
  matchups?: Array<Record<string, unknown>>;
  currentWeek?: number | null;
  draftMode?: string;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOptions = {},
) {
  const {
    league = makeLeague(),
    matchups = makeCompletedMatchups(),
    currentWeek = null,
    draftMode = 'automated',
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
      await route.fallback();
    }
  });
}

// ── Season Renewal — Visible for Commissioner ────────────────────────────────

test.describe('Season Renewal — commissioner with completed season @critical', () => {
  test('season renewal section visible for commissioner of completed league', async ({
    page,
  }) => {
    // League: draftStatus=completed, currentMatchup=null, totalMatchups=10,
    // frozenAt=null, highestWeek(from matchups)=10 → isSeasonComplete = true
    await setupGraphQL(page, {
      league: makeLeague({
        draftStatus: 'completed',
        currentMatchup: null,
        totalMatchups: 10,
        frozenAt: null,
      }),
      matchups: makeCompletedMatchups(),
      currentWeek: null,
    });

    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Verify "Season Complete" text is rendered
    await expect(
      page.getByText('Season Complete', { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Verify "All weeks have been played" description copy
    await expect(
      page.getByText(/All weeks have been played/i).first(),
    ).toBeVisible();

    // Verify "Start New Season" button is rendered
    await expect(
      page.getByRole('button', { name: /Start New Season/i }),
    ).toBeVisible();
  });

  test('season renewal section hidden when league is frozen', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({
        draftStatus: 'completed',
        currentMatchup: null,
        totalMatchups: 10,
        frozenAt: '2025-01-01T00:00:00Z',
      }),
      matchups: makeCompletedMatchups(),
      currentWeek: null,
    });

    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Wait for the page content to load
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // "Start New Season" should NOT appear for a frozen league
    await expect(
      page.getByRole('button', { name: /Start New Season/i }),
    ).not.toBeVisible();
  });
});

// ── Season Renewal — Roster Carry-Over Options ───────────────────────────────

test.describe('Season Renewal — roster carry-over options @critical', () => {
  test('renewal settings display roster carry-over options', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({
        draftStatus: 'completed',
        currentMatchup: null,
        totalMatchups: 10,
        frozenAt: null,
      }),
      matchups: makeCompletedMatchups(),
      currentWeek: null,
    });

    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Open the renewal dialog
    const startBtn = page.getByRole('button', { name: /Start New Season/i });
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    // Dialog title should reference the league name
    await expect(page.getByText(/Start New Season for/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Dialog description mentions freezing and historical record
    await expect(
      page.getByText(/frozen and kept as a historical record/i).first(),
    ).toBeVisible();

    // "How should rosters be handled?" heading is visible
    await expect(
      page.getByText(/How should rosters be handled/i).first(),
    ).toBeVisible();

    // "Hold a new draft" option is visible (and selected by default)
    await expect(page.getByText(/Hold a new draft/i).first()).toBeVisible();

    // Default selection shows draft hint text
    await expect(
      page
        .getByText(
          /All team rosters will be cleared.*commissioner can configure/i,
        )
        .first(),
    ).toBeVisible();

    // "Keep same rosters" option is visible
    await expect(page.getByText(/Keep same rosters/i).first()).toBeVisible();

    // Switch to "Keep same rosters" and verify hint text updates
    await page
      .getByText(/Keep same rosters/i)
      .first()
      .click();
    await expect(
      page.getByText(/All current player assignments will be copied/i).first(),
    ).toBeVisible();

    // Switch back to "Hold a new draft" and verify text resets
    await page
      .getByText(/Hold a new draft/i)
      .first()
      .click();
    await expect(
      page.getByText(/All team rosters will be cleared/i).first(),
    ).toBeVisible();

    // "Confirm New Season" button is visible
    await expect(
      page.getByRole('button', { name: /Confirm New Season/i }),
    ).toBeVisible();

    // "Cancel" button is visible (accessible name is "Dialog Close")
    const cancelBtn = page.getByRole('button', { name: /Dialog Close/i });
    await expect(cancelBtn).toBeVisible();

    // Cancel closes the dialog
    await cancelBtn.click();
    await expect(page.getByText(/Start New Season for/i)).not.toBeVisible({
      timeout: 5_000,
    });
  });
});

// ── Season Renewal — Non-Commissioner Access ─────────────────────────────────

test.describe('Season Renewal — non-commissioner access @regression', () => {
  test('non-commissioner cannot see renewal controls', async ({ page }) => {
    // League owned by user 2 — test user (id=1) is NOT the commissioner
    await setupGraphQL(page, {
      league: makeLeague({
        owner: 2,
        draftStatus: 'completed',
        currentMatchup: null,
        totalMatchups: 10,
        frozenAt: null,
      }),
      matchups: makeCompletedMatchups(),
      currentWeek: null,
    });

    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Wait for the page to render
    await expect(
      page.getByText('Overview', { exact: false }).first(),
    ).toBeVisible();

    // The Commissioner tab button should not be visible for non-commissioners
    const commissionerTabs = page.getByRole('button', {
      name: /commissioner/i,
    });
    await expect(commissionerTabs).not.toBeVisible();

    // "Start New Season" button should not appear anywhere on the overview page
    await expect(
      page.getByRole('button', { name: /Start New Season/i }),
    ).not.toBeVisible();
  });
});
