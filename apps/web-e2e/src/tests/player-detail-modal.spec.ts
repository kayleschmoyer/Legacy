/**
 * E2E Tests: Player Detail Modal (LS-691)
 *
 * Covers:
 *  - stat tables (season-by-season batting / fielding tabs)
 *  - season/career data (hero chips, career summary cards)
 *  - position eligibility badges
 *  - player nav (open via /players/:id deep link, back button returns to stats)
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect } from '@playwright/test';
import { test } from '../fixtures/auth-enhanced';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

/** Season stats response for a batter who also plays CF (no pitching). */
const SEASON_STATS_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['CF', 'OF'],
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 2024,
        team: 'LAA',
        games: 145,
        plateAppearances: 620,
        atBats: 550,
        runs: 95,
        hits: 165,
        doubles: 30,
        triples: 2,
        homeRuns: 28,
        rbi: 85,
        stolenBases: 12,
        caughtStealing: 3,
        baseOnBalls: 60,
        strikeouts: 110,
        battingAverage: 0.3,
        onBasePercentage: 0.37,
        sluggingPercentage: 0.52,
      },
      {
        __typename: 'SeasonBatting',
        season: 2023,
        team: 'LAA',
        games: 140,
        plateAppearances: 590,
        atBats: 520,
        runs: 88,
        hits: 155,
        doubles: 28,
        triples: 1,
        homeRuns: 25,
        rbi: 80,
        stolenBases: 10,
        caughtStealing: 2,
        baseOnBalls: 65,
        strikeouts: 105,
        battingAverage: 0.298,
        onBasePercentage: 0.365,
        sluggingPercentage: 0.495,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [
      {
        __typename: 'SeasonFielding',
        season: 2024,
        team: 'LAA',
        position: 'CF',
        games: 140,
        gamesStarted: 138,
        inningsDefended: 1260,
        putouts: 380,
        assists: 8,
        errors: 2,
        doublePlays: 3,
        fieldingPercentage: 0.995,
      },
    ],
  },
};

/** Season stats response for a pitcher (no batting data). */
const PITCHER_SEASON_STATS_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['SP', 'RP'],
    },
    playerSeasonBatting: [],
    playerSeasonPitching: [
      {
        __typename: 'SeasonPitching',
        season: 2024,
        team: 'LAD',
        games: 32,
        wins: 15,
        losses: 5,
        gamesStarted: 32,
        completeGames: 2,
        shutouts: 1,
        saves: 0,
        inningsPitched: 210,
        hits: 155,
        runs: 55,
        earnedRuns: 50,
        homeRuns: 12,
        baseOnBalls: 45,
        strikeouts: 245,
        earnedRunAverage: '2.14',
        whip: 0.95,
      },
    ],
    playerSeasonFielding: [],
  },
};

/** Empty stats response — no seasons recorded. */
const EMPTY_STATS_RESPONSE = {
  data: {
    player: { __typename: 'Player', eligiblePositions: [] },
    playerSeasonBatting: [],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
};

// ── Route Setup ───────────────────────────────────────────────────────────────

type StatsBody =
  | typeof SEASON_STATS_RESPONSE
  | typeof PITCHER_SEASON_STATS_RESPONSE
  | typeof EMPTY_STATS_RESPONSE
  | { errors: Array<{ message: string }> };

interface SetupOptions {
  /** Response body for GetAllPlayerSeasonStats queries (default: SEASON_STATS_RESPONSE). */
  seasonStatsBody?: StatsBody;
  /**
   * Optional delay in ms before fulfilling the season stats response.
   * Useful for testing loading states.
   */
  seasonStatsDelay?: number;
}

async function setupPlayerDetailMocks(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const { seasonStatsBody = SEASON_STATS_RESPONSE, seasonStatsDelay } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('getallplayerseasonsta')) {
      if (seasonStatsDelay) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, seasonStatsDelay),
        );
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(seasonStatsBody),
      });
    } else if (
      postData.includes('getcareerbattingsta') ||
      postData.includes('getallplayers') ||
      postData.includes('getplayerswithstat')
    ) {
      // Return a minimal player list with one player so rows render.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            // GetCareerBattingStats — connection format
            careerBattingStats: {
              __typename: 'CareerBattingConnection',
              totalCount: 1,
              edges: [
                {
                  __typename: 'CareerBattingEdge',
                  node: {
                    __typename: 'CareerBatting',
                    playerId: 1,
                    primaryPosition: 'CF',
                    positionsPlayed: null,
                    games: 1131,
                    plateAppearances: 5101,
                    atBats: 4289,
                    runs: 894,
                    hits: 1559,
                    doubles: 315,
                    triples: 48,
                    homeRuns: 368,
                    rbi: 817,
                    stolenBases: 211,
                    caughtStealing: 57,
                    baseOnBalls: 774,
                    strikeouts: 1034,
                    totalBases: 2988,
                    groundedIntoDoublePlays: 76,
                    hitByPitch: 35,
                    sacrificeHits: 3,
                    intentionalBaseOnBalls: 231,
                    battingAverage: 0.304,
                    onBasePercentage: 0.41,
                    sluggingPercentage: 0.582,
                    offensiveWAR: 72.9,
                    player: {
                      __typename: 'Player',
                      id: 1,
                      firstName: 'Mike',
                      lastName: 'Trout',
                      brefId: 'troutmi01',
                    },
                  },
                },
              ],
              pageInfo: {
                __typename: 'PageInfo',
                hasNextPage: false,
                hasPreviousPage: false,
                startCursor: null,
                endCursor: null,
              },
            },
            // GetAllPlayers — flat array format
            players: [
              {
                __typename: 'Player',
                id: 1,
                firstName: 'Mike',
                lastName: 'Trout',
                brefId: 'troutmi01',
                statsLastFetchedAt: null,
              },
            ],
          },
        }),
      });
    } else {
      await route.fallback();
    }
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Player Detail Modal @regression', () => {
  test('renders when navigating to the /players/:id deep-link route', async ({
    page,
  }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    // The modal is always open on the /players/:id route
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
  });

  test('displays career hero stats — AVG, HR, RBI chips', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Wait for stats to load (spinner should disappear)
    await expect(
      page.getByText('Loading player statistics…'),
    ).not.toBeVisible();

    // Hero stat chips (label text rendered inside HeroStat components)
    await expect(dialog.getByText('AVG')).toBeVisible();
    await expect(dialog.getByText('HR')).toBeVisible();
    await expect(dialog.getByText('RBI')).toBeVisible();

    // Computed career AVG from 2 seasons: (165+155)/(550+520) = 320/1070 ≈ .299
    const avgChip = dialog.getByText('.299');
    await expect(avgChip).toBeVisible();
  });

  test('shows eligible position badges', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(
      page.getByText('Loading player statistics…'),
    ).not.toBeVisible();

    // "Eligible Positions" label
    await expect(dialog.getByText('Eligible Positions')).toBeVisible();

    // CF and OF position badges
    const cfBadge = dialog
      .getByText('CF', { exact: true })
      .or(dialog.locator('text=CF'))
      .first();
    await expect(cfBadge).toBeVisible();

    const ofBadge = dialog
      .getByText('OF', { exact: true })
      .or(dialog.locator('text=OF'))
      .first();
    await expect(ofBadge).toBeVisible();
  });

  test('shows Career Batting summary card', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(
      page.getByText('Loading player statistics…'),
    ).not.toBeVisible();

    // Career Batting stat card title
    await expect(dialog.getByText('Career Batting')).toBeVisible();

    // Key row labels in the batting card
    await expect(dialog.getByText('Batting Average')).toBeVisible();
    await expect(dialog.getByText('Home Runs')).toBeVisible();
    await expect(dialog.getByText('RBI')).toBeVisible();
  });

  test('shows season-by-season batting table with correct headers', async ({
    page,
  }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(
      page.getByText('Loading player statistics…'),
    ).not.toBeVisible();

    // The batting tab should be active by default since the player has batting data
    // Verify column headers in the batting table
    await expect(dialog.getByText('YEAR')).toBeVisible();
    await expect(dialog.getByText('G', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText('PA')).toBeVisible();
    await expect(dialog.getByText('AB')).toBeVisible();
    await expect(dialog.getByText('H', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText('HR', { exact: true }).first()).toBeVisible();
    await expect(
      dialog.getByText('RBI', { exact: true }).first(),
    ).toBeVisible();
    await expect(dialog.getByText('SB')).toBeVisible();
    await expect(dialog.getByText('AVG', { exact: true })).toBeVisible();

    // Both season rows should appear
    await expect(dialog.getByText('2024', { exact: true })).toBeVisible();
    await expect(dialog.getByText('2023', { exact: true })).toBeVisible();
  });

  test('switching to Fielding tab shows fielding table', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(
      page.getByText('Loading player statistics…'),
    ).not.toBeVisible();

    // Click the Fielding tab
    const fieldingTab = dialog.getByText('Fielding', { exact: true });
    await expect(fieldingTab).toBeVisible();
    await fieldingTab.click({ force: true });
    await page.waitForTimeout(300);

    // Fielding table headers
    await expect(dialog.getByText('POS')).toBeVisible();
    await expect(dialog.getByText('INN')).toBeVisible();
    await expect(dialog.getByText('PO')).toBeVisible();
    await expect(dialog.getByText('A', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText('E', { exact: true }).first()).toBeVisible();
  });

  test('shows loading spinner while stats are fetching', async ({ page }) => {
    // Set a delay so we can catch the loading state
    await setupPlayerDetailMocks(page, { seasonStatsDelay: 1500 });
    await page.goto('/players/1');
    await page.waitForLoadState('domcontentloaded');

    // The spinner / loading text should be visible before data arrives
    await expect(page.getByText('Loading player statistics…')).toBeVisible();

    // Eventually data loads and spinner disappears
    await expect(
      page.getByText('Loading player statistics…'),
    ).not.toBeVisible();
  });

  test('closes when the Close button is clicked', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // The X / Close button in BaseModal has aria-label="Close"
    const closeButton = dialog.getByRole('button', { name: 'Close' });
    await closeButton.click({ force: true });

    // After close, the page-level PlayerDetailPage navigates to /players/stats
    await page.waitForURL('**/players/stats');
  });
});

test.describe('Player Detail Modal – Pitcher @regression', () => {
  test('shows Career Pitching card and pitching tab for a pitcher', async ({
    page,
  }) => {
    await setupPlayerDetailMocks(page, {
      seasonStatsBody: PITCHER_SEASON_STATS_RESPONSE,
    });
    await page.goto('/players/2');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(
      page.getByText('Loading player statistics…'),
    ).not.toBeVisible();

    // Eligible positions for a pitcher
    await expect(dialog.getByText('SP')).toBeVisible();

    // Career Pitching card
    await expect(dialog.getByText('Career Pitching')).toBeVisible();

    // Pitching hero chips
    await expect(dialog.getByText('W-L')).toBeVisible();
    await expect(dialog.getByText('SO')).toBeVisible();

    // Season-by-season pitching table headers
    await expect(dialog.getByText('ERA')).toBeVisible();
    await expect(dialog.getByText('IP')).toBeVisible();
    await expect(dialog.getByText('BB')).toBeVisible();
  });
});

test.describe('Player Detail Modal — Edge Cases @regression', () => {
  test('shows empty state when no season stats are available', async ({
    page,
  }) => {
    await setupPlayerDetailMocks(page, {
      seasonStatsBody: EMPTY_STATS_RESPONSE,
    });
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(
      page.getByText('Loading player statistics…'),
    ).not.toBeVisible();

    await expect(dialog.getByText('No season statistics found')).toBeVisible();
  });

  test('shows error state when the stats query fails', async ({ page }) => {
    await setupPlayerDetailMocks(page, {
      seasonStatsBody: {
        errors: [{ message: 'Internal server error' }],
      },
    });
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(
      page.getByText('Loading player statistics…'),
    ).not.toBeVisible();

    await expect(dialog.getByText('Error loading stats')).toBeVisible();
  });

  test('pressing Escape closes the modal and navigates back', async ({
    page,
  }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');

    // Navigate back to player stats list
    await page.waitForURL('**/players/stats');
  });

  test('player nav: back button returns to /players/stats', async ({
    page,
  }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // The PlayerDetailPage renders a "← Back to Player Statistics" button
    const backButton = page.getByRole('button', {
      name: /back to player statistics/i,
    });
    await expect(backButton).toBeVisible();
    await backButton.click();

    await page.waitForURL('**/players/stats');
    await expect(
      page.getByRole('heading', { name: /player statistics/i }),
    ).toBeVisible();
  });

  test('batting tab switches back from fielding tab', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(
      page.getByText('Loading player statistics…'),
    ).not.toBeVisible();

    // Switch to Fielding
    await dialog.getByText('Fielding', { exact: true }).click({ force: true });
    await page.waitForTimeout(300);
    await expect(dialog.getByText('POS')).toBeVisible();

    // Switch back to Batting
    await dialog.getByText('Batting', { exact: true }).click({ force: true });
    await page.waitForTimeout(300);

    // Batting table headers should reappear
    await expect(dialog.getByText('YEAR')).toBeVisible();
    await expect(dialog.getByText('AVG', { exact: true })).toBeVisible();
  });

  test('season data rows contain expected year values', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(
      page.getByText('Loading player statistics…'),
    ).not.toBeVisible();

    // Season subtitle says "2 seasons"
    await expect(dialog.getByText(/2 season/i)).toBeVisible();

    // Both season years are in the batting table
    await expect(dialog.getByText('2024', { exact: true })).toBeVisible();
    await expect(dialog.getByText('2023', { exact: true })).toBeVisible();
  });
});
