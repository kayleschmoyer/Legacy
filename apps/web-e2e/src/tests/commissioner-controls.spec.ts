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
