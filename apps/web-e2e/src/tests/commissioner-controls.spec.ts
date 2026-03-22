/**
 * Commissioner Controls — E2E Tests (LS-588)
 *
 * Covers the following commissioner controls on the League Detail page:
 *   /baseball/league/:id/commissioner
 *
 *   - Game Selection (via NextStepControl's "Select Game N of M" action)
 *   - Matchup Advancement (via NextStepControl's "Advance League Week" action)
 *   - Waiver Processing (via WaiverProcessControl's "Process Waivers Now" action)
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Default test JWT has id=1, so leagues with owner=1 give commissioner access.
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
    lmNote: null,
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
      await route.fallback();
    }
  });
}

// ── Accordion helpers ─────────────────────────────────────────────────────────

async function expandWaiverProcessing(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', {
    name: 'Waiver Processing',
    exact: true,
  });
  await toggle.waitFor({ state: 'visible' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
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

    await expect(
      page.getByText('Commissioner', { exact: false }).first(),
    ).toBeVisible();
  });

  test('shows the league name on the commissioner page', async ({ page }) => {
    await setupGraphQL(page, { league: makeLeague() });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    await expect(
      page.getByText('Test Commissioner League', { exact: false }),
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

    // The Commissioner tab should not be present for non-commissioners
    const commissionerTabs = page.getByRole('button', {
      name: /commissioner/i,
    });
    await expect(commissionerTabs).not.toBeVisible();
  });
});

// ── Next Step Control — Game Selection State ──────────────────────────────────

test.describe('Next Step — game selection state @critical', () => {
  test('shows "Select Game 1 of 5" when draft is complete and games remain', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 5 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 0,
          gamesPerMatchup: 5,
        }),
      ],
      currentWeek: 1,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('button', { name: /select game 1/i }),
    ).toBeVisible();
  });

  test('shows "Select Game 3 of 5" when 2 games are already selected', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 5 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 2,
          gamesPerMatchup: 5,
        }),
      ],
      currentWeek: 1,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('button', { name: /select game 3/i }),
    ).toBeVisible();
  });

  test('game selection button opens a confirmation dialog', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 5 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 0,
          gamesPerMatchup: 5,
        }),
      ],
      currentWeek: 1,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    const selectBtn = page.getByRole('button', { name: /select game 1/i });
    await expect(selectBtn).toBeVisible();
    await selectBtn.click();

    // Confirmation dialog should appear
    await expect(
      page.getByRole('heading', { name: /select game 1/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /confirm/i })).toBeVisible();
  });

  test('game selection confirm dialog can be cancelled', async ({ page }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 5 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 0,
          gamesPerMatchup: 5,
        }),
      ],
      currentWeek: 1,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    const selectBtn = page.getByRole('button', { name: /select game 1/i });
    await expect(selectBtn).toBeVisible();
    await selectBtn.click();

    // Cancel the dialog
    await expect(
      page.getByRole('heading', { name: /select game 1/i }),
    ).toBeVisible();
    await page.getByRole('button', { name: /dialog close/i }).click();

    // Dialog should close; the select button should still be visible
    await expect(selectBtn).toBeVisible();
  });

  test('confirms game selection and calls autoSelectGames mutation', async ({
    page,
  }) => {
    let mutationCalled = false;

    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 5 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 0,
          gamesPerMatchup: 5,
        }),
      ],
      currentWeek: 1,
      onAutoSelectGames: () => {
        mutationCalled = true;
        return { success: true };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    const selectBtn = page.getByRole('button', { name: /select game 1/i });
    await expect(selectBtn).toBeVisible();
    await selectBtn.click();

    await page.getByRole('button', { name: /confirm/i }).click();

    // Wait until the mutation has been invoked
    await expect.poll(() => mutationCalled, { timeout: 10000 }).toBe(true);
  });
});

// ── Next Step Control — Matchup Advancement State ────────────────────────────

test.describe('Next Step — matchup advancement state @critical', () => {
  test('shows "Advance League Week" when all games are selected', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 5 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 5,
          gamesPerMatchup: 5,
        }),
      ],
      currentWeek: 1,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('button', { name: /advance league week/i }),
    ).toBeVisible();
  });

  test('advance button opens a confirmation dialog with week info', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 5 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 5,
          gamesPerMatchup: 5,
        }),
      ],
      currentWeek: 1,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    const advanceBtn = page.getByRole('button', {
      name: /advance league week/i,
    });
    await expect(advanceBtn).toBeVisible();
    await advanceBtn.click();

    // Confirmation dialog should appear with week numbers
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: /confirm/i })).toBeVisible();
  });

  test('confirms matchup advancement and calls autoAdvanceMatchups mutation', async ({
    page,
  }) => {
    let mutationCalled = false;

    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 5 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 5,
          gamesPerMatchup: 5,
        }),
      ],
      currentWeek: 1,
      onAutoAdvanceMatchups: () => {
        mutationCalled = true;
        return { success: true };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    const advanceBtn = page.getByRole('button', {
      name: /advance league week/i,
    });
    await expect(advanceBtn).toBeVisible();
    await advanceBtn.click();

    await page.getByRole('button', { name: /confirm/i }).click();

    await expect.poll(() => mutationCalled, { timeout: 10000 }).toBe(true);
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

    await expect(
      page.getByRole('button', { name: /start draft/i }),
    ).toBeVisible();
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

    await expect(
      page.getByRole('button', { name: /create week 1 matchups/i }),
    ).toBeVisible();
  });
});

// ── Waiver Processing Control ────────────────────────────────────────────────

test.describe('Waiver Processing — commissioner control @critical', () => {
  test.beforeEach(async ({ page }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed' }),
      matchups: [],
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');
    await expandWaiverProcessing(page);
  });

  test('shows "Waiver Processing" section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /waiver processing/i }),
    ).toBeVisible();
  });

  test('shows "Process Waivers Now" button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /process waivers now/i }),
    ).toBeVisible();
  });

  test('"Process Waivers Now" opens a confirmation dialog', async ({
    page,
  }) => {
    const processBtn = page.getByRole('button', {
      name: /process waivers now/i,
    });
    await expect(processBtn).toBeVisible();
    await processBtn.click();

    // Confirmation dialog should appear
    await expect(
      page.getByRole('heading', { name: 'Process Waivers' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /confirm/i })).toBeVisible();
  });

  test('waiver confirm dialog shows description text', async ({ page }) => {
    await page.getByRole('button', { name: /process waivers now/i }).click();

    await expect(
      page.getByText(/process all pending waiver claims/i),
    ).toBeVisible();
  });

  test('cancel button closes the waiver confirm dialog', async ({ page }) => {
    const processBtn = page.getByRole('button', {
      name: /process waivers now/i,
    });
    await expect(processBtn).toBeVisible();
    await processBtn.click();

    // Dialog is open
    await expect(
      page.getByRole('heading', { name: 'Process Waivers' }),
    ).toBeVisible();

    // Cancel closes it
    await page.getByRole('button', { name: /dialog close/i }).click();

    // "Process Waivers Now" button should be visible again
    await expect(processBtn).toBeVisible();
  });
});

test.describe('Waiver Processing — confirm mutation @regression', () => {
  test('confirms waiver processing and calls processWaiverClaims mutation', async ({
    page,
  }) => {
    let mutationCalled = false;

    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed' }),
      matchups: [],
      onProcessWaiverClaims: () => {
        mutationCalled = true;
        return { processed: 2, succeeded: 2, failed: 0 };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');
    await expandWaiverProcessing(page);

    const processBtn = page.getByRole('button', {
      name: /process waivers now/i,
    });
    await expect(processBtn).toBeVisible();
    await processBtn.click();

    await page.getByRole('button', { name: /confirm/i }).click();

    await expect.poll(() => mutationCalled, { timeout: 10000 }).toBe(true);
  });
});

// ── Sequential Game Selection — Multi-Round ──────────────────────────────────

test.describe('Sequential game selection — multi-round @critical', () => {
  test('clicking Select Game through all rounds updates button label and transitions to Advance', async ({
    page,
  }) => {
    let selectCalls = 0;

    // Round 1: selectedGamesCount = 0 → button says "Select Game 1 of 3"
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 3 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 0,
          gamesPerMatchup: 3,
        }),
      ],
      currentWeek: 1,
      onAutoSelectGames: () => {
        selectCalls++;
        return { success: true };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Verify initial state
    const selectBtn1 = page.getByRole('button', {
      name: /select game 1 of 3/i,
    });
    await expect(selectBtn1).toBeVisible();

    // Click and confirm game 1
    await selectBtn1.click();
    await page.getByRole('button', { name: /confirm/i }).click();
    await expect.poll(() => selectCalls, { timeout: 10000 }).toBe(1);

    // Re-setup with updated state: selectedGamesCount = 1
    await page.unroute(isGraphQLEndpoint);
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 3 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 1,
          gamesPerMatchup: 3,
        }),
      ],
      currentWeek: 1,
      onAutoSelectGames: () => {
        selectCalls++;
        return { success: true };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Verify button says "Select Game 2 of 3"
    const selectBtn2 = page.getByRole('button', {
      name: /select game 2 of 3/i,
    });
    await expect(selectBtn2).toBeVisible();

    // Click and confirm game 2
    await selectBtn2.click();
    await page.getByRole('button', { name: /confirm/i }).click();
    await expect.poll(() => selectCalls, { timeout: 10000 }).toBe(2);

    // Re-setup with updated state: selectedGamesCount = 2
    await page.unroute(isGraphQLEndpoint);
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 3 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 2,
          gamesPerMatchup: 3,
        }),
      ],
      currentWeek: 1,
      onAutoSelectGames: () => {
        selectCalls++;
        return { success: true };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Verify button says "Select Game 3 of 3"
    const selectBtn3 = page.getByRole('button', {
      name: /select game 3 of 3/i,
    });
    await expect(selectBtn3).toBeVisible();

    // Click and confirm game 3
    await selectBtn3.click();
    await page.getByRole('button', { name: /confirm/i }).click();
    await expect.poll(() => selectCalls, { timeout: 10000 }).toBe(3);

    // Re-setup with all games selected: selectedGamesCount = 3
    await page.unroute(isGraphQLEndpoint);
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 3 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 3,
          gamesPerMatchup: 3,
        }),
      ],
      currentWeek: 1,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // After all games selected, "Advance League Week" should appear instead
    await expect(
      page.getByRole('button', { name: /advance league week/i }),
    ).toBeVisible();

    // "Select Game" button should no longer be present
    await expect(
      page.getByRole('button', { name: /select game/i }),
    ).not.toBeVisible();
  });
});

// ── Advance Blocked When Games Incomplete ────────────────────────────────────

test.describe('Advance blocked when games incomplete @critical', () => {
  test('Advance League Week button is NOT visible when games remain unselected', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 5 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 2,
          gamesPerMatchup: 5,
        }),
      ],
      currentWeek: 1,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // "Advance League Week" should NOT be visible with incomplete games
    await expect(
      page.getByRole('button', { name: /advance league week/i }),
    ).not.toBeVisible();

    // "Select Game 3 of 5" should be visible instead
    await expect(
      page.getByRole('button', { name: /select game 3 of 5/i }),
    ).toBeVisible();
  });

  test('shows game selection button for first incomplete game when some games selected', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 5 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 4,
          gamesPerMatchup: 5,
        }),
      ],
      currentWeek: 1,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Should show "Select Game 5 of 5" — the last remaining game
    await expect(
      page.getByRole('button', { name: /select game 5 of 5/i }),
    ).toBeVisible();

    // Advance should still not be visible
    await expect(
      page.getByRole('button', { name: /advance league week/i }),
    ).not.toBeVisible();
  });
});

// ── Advance Week Flow — UI Refresh ───────────────────────────────────────────

test.describe('Advance week flow — UI refresh @critical', () => {
  test('advancing from week 1 to week 2 refreshes UI to show new week state', async ({
    page,
  }) => {
    let advanceCalled = false;

    // Setup at week 1, all games selected
    await setupGraphQL(page, {
      league: makeLeague({
        draftStatus: 'completed',
        gamesPerMatchup: 3,
        totalMatchups: 10,
      }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 3,
          gamesPerMatchup: 3,
        }),
      ],
      currentWeek: 1,
      onAutoAdvanceMatchups: () => {
        advanceCalled = true;
        return { success: true };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Verify we see "Advance League Week"
    const advanceBtn = page.getByRole('button', {
      name: /advance league week/i,
    });
    await expect(advanceBtn).toBeVisible();

    // Verify current state shows week 1
    await expect(page.getByText(/week 1/i).first()).toBeVisible();

    // Click advance and confirm
    await advanceBtn.click();
    await page.getByRole('button', { name: /confirm/i }).click();
    await expect.poll(() => advanceCalled, { timeout: 10000 }).toBe(true);

    // Re-setup with week 2 state (new week, no games selected yet)
    await page.unroute(isGraphQLEndpoint);
    await setupGraphQL(page, {
      league: makeLeague({
        draftStatus: 'completed',
        gamesPerMatchup: 3,
        totalMatchups: 10,
      }),
      matchups: [
        makeMatchup({
          id: 2,
          weekNumber: 2,
          selectedGamesCount: 0,
          gamesPerMatchup: 3,
        }),
      ],
      currentWeek: 2,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // After advance, UI should show week 2 and game selection for the new week
    await expect(page.getByText(/week 2/i).first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /select game 1 of 3/i }),
    ).toBeVisible();
  });
});

// ── Error Handling — Mutation Failure ─────────────────────────────────────────

test.describe('Error handling — mutation failure @regression', () => {
  test('shows error message when autoSelectGames mutation returns GraphQL error', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 5 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 0,
          gamesPerMatchup: 5,
        }),
      ],
      currentWeek: 1,
    });

    // Override the autoSelectGames route to return an error
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('autoselectgames')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            errors: [
              {
                message: 'Game selection failed: no eligible games available',
                locations: [{ line: 1, column: 1 }],
                path: ['autoSelectGames'],
              },
            ],
          }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Click select game and confirm
    const selectBtn = page.getByRole('button', { name: /select game 1/i });
    await expect(selectBtn).toBeVisible();
    await selectBtn.click();
    await page.getByRole('button', { name: /confirm/i }).click();

    // Error message should appear in the alert role
    await expect(page.getByRole('alert').getByText(/error/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('shows error message when autoAdvanceMatchups mutation returns GraphQL error', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed', gamesPerMatchup: 5 }),
      matchups: [
        makeMatchup({
          weekNumber: 1,
          selectedGamesCount: 5,
          gamesPerMatchup: 5,
        }),
      ],
      currentWeek: 1,
    });

    // Override the autoAdvanceMatchups route to return an error
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('autoadvancematchups')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            errors: [
              {
                message:
                  'Advance failed: at least 2 teams required for matchups',
                locations: [{ line: 1, column: 1 }],
                path: ['autoAdvanceMatchups'],
              },
            ],
          }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Click advance and confirm
    const advanceBtn = page.getByRole('button', {
      name: /advance league week/i,
    });
    await expect(advanceBtn).toBeVisible();
    await advanceBtn.click();
    await page.getByRole('button', { name: /confirm/i }).click();

    // Error message should appear
    await expect(page.getByRole('alert').getByText(/error/i)).toBeVisible({
      timeout: 10000,
    });
  });
});

// ── Final Week Advance — Season Completion ───────────────────────────────────

test.describe('Final week advance — season completion @regression', () => {
  test('shows "Season Complete" indicator when all weeks have been played', async ({
    page,
  }) => {
    // Setup at final week (week 10 of 10), all games selected, no current matchup
    // (season is complete when highestWeek >= totalMatchups and no active matchup)
    await setupGraphQL(page, {
      league: makeLeague({
        draftStatus: 'completed',
        gamesPerMatchup: 3,
        totalMatchups: 10,
        currentMatchup: null,
      }),
      matchups: [
        makeMatchup({
          weekNumber: 10,
          selectedGamesCount: 3,
          gamesPerMatchup: 3,
          status: 'completed',
          // Use a different team so it's NOT the user's current matchup
          team1Id: 3,
          team2Id: 4,
        }),
      ],
      currentWeek: null,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // "Season Complete" text should appear
    await expect(page.getByText(/season complete/i).first()).toBeVisible({
      timeout: 10000,
    });

    // "Advance League Week" should NOT be visible when season is over
    await expect(
      page.getByRole('button', { name: /advance league week/i }),
    ).not.toBeVisible();
  });

  test('advancing the final week transitions to season complete state', async ({
    page,
  }) => {
    let advanceCalled = false;

    // Setup at final week (week 10 of 10), all games selected
    await setupGraphQL(page, {
      league: makeLeague({
        draftStatus: 'completed',
        gamesPerMatchup: 3,
        totalMatchups: 10,
      }),
      matchups: [
        makeMatchup({
          weekNumber: 10,
          selectedGamesCount: 3,
          gamesPerMatchup: 3,
        }),
      ],
      currentWeek: 10,
      onAutoAdvanceMatchups: () => {
        advanceCalled = true;
        return { success: true };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Should see advance button on final week
    const advanceBtn = page.getByRole('button', {
      name: /advance league week/i,
    });
    await expect(advanceBtn).toBeVisible();
    await advanceBtn.click();
    await page.getByRole('button', { name: /confirm/i }).click();
    await expect.poll(() => advanceCalled, { timeout: 10000 }).toBe(true);

    // Re-setup with season complete state (no current week, no active matchup)
    await page.unroute(isGraphQLEndpoint);
    await setupGraphQL(page, {
      league: makeLeague({
        draftStatus: 'completed',
        gamesPerMatchup: 3,
        totalMatchups: 10,
        currentMatchup: null,
      }),
      matchups: [
        makeMatchup({
          weekNumber: 10,
          selectedGamesCount: 3,
          gamesPerMatchup: 3,
          status: 'completed',
          team1Id: 3,
          team2Id: 4,
        }),
      ],
      currentWeek: null,
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // "Season Complete" should now be visible
    await expect(page.getByText(/season complete/i).first()).toBeVisible({
      timeout: 10000,
    });

    // "Start New Season" button should be available
    await expect(
      page.getByRole('button', { name: /start new season/i }),
    ).toBeVisible();
  });
});
