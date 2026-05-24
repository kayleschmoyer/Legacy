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

import { expect } from '../fixtures/auth-enhanced';
import { test } from '../fixtures/auth-enhanced';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Mock Data ──────────────────────────────────────────────────────────────────

/** Season stats response for a batter who also plays CF (no pitching). */
const SEASON_STATS_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['CF', 'OF'],
      firstName: 'Mike',
      lastName: 'Trout',
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
      firstName: 'Walker',
      lastName: 'Buehler',
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

/** Career arc response for a batter — needed by GetPlayerCareerArc query. */
const BATTER_CAREER_ARC_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Mike',
      lastName: 'Trout',
      eligiblePositions: ['CF', 'OF'],
      careerAchievements: {
        allStarSelections: 11,
        goldGloves: 0,
        silverSluggers: 9,
        mvpAwards: 3,
        cyYoungAwards: 0,
        hallOfFame: false,
        rookieOfTheYear: true,
      },
    },
    playerSeasonBatting: [
      {
        season: 2024,
        team: 'LAA',
        games: 145,
        hits: 165,
        atBats: 550,
        homeRuns: 28,
        rbi: 85,
        stolenBases: 12,
        battingAverage: 0.3,
        onBasePercentage: 0.37,
        sluggingPercentage: 0.52,
        onBasePlusSlugging: 0.89,
        onBasePlusSluggingPlus: 142,
        awardSummary: null,
      },
      {
        season: 2023,
        team: 'LAA',
        games: 140,
        hits: 155,
        atBats: 520,
        homeRuns: 25,
        rbi: 80,
        stolenBases: 10,
        battingAverage: 0.298,
        onBasePercentage: 0.365,
        sluggingPercentage: 0.495,
        onBasePlusSlugging: 0.86,
        onBasePlusSluggingPlus: 135,
        awardSummary: null,
      },
    ],
    playerSeasonPitching: [],
  },
};

/** Career arc response for a pitcher. */
const PITCHER_CAREER_ARC_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Walker',
      lastName: 'Buehler',
      eligiblePositions: ['SP', 'RP'],
      careerAchievements: {
        allStarSelections: 1,
        goldGloves: 0,
        silverSluggers: 0,
        mvpAwards: 0,
        cyYoungAwards: 0,
        hallOfFame: false,
        rookieOfTheYear: false,
      },
    },
    playerSeasonBatting: [],
    playerSeasonPitching: [
      {
        season: 2024,
        team: 'LAD',
        games: 32,
        wins: 15,
        losses: 5,
        earnedRunAverage: '2.14',
        earnedRunAveragePlus: 175,
        whip: 0.95,
        strikeouts: 245,
        inningsPitched: 210,
        awardSummary: null,
      },
    ],
  },
};

/** Empty career arc response. */
const EMPTY_CAREER_ARC_RESPONSE = {
  data: {
    player: null,
    playerSeasonBatting: [],
    playerSeasonPitching: [],
  },
};

/** Empty stats response — no seasons recorded. */
const EMPTY_STATS_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: [],
      firstName: 'Unknown',
      lastName: 'Player',
    },
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
  /** Response body for GetPlayerCareerArc queries (auto-derived from seasonStatsBody if omitted). */
  careerArcBody?: object;
  /**
   * Optional delay in ms before fulfilling the season stats response.
   * Useful for testing loading states.
   */
  seasonStatsDelay?: number;
}

/** Derive a career arc body based on the season stats body used. */
function deriveCareerArcBody(seasonStatsBody: StatsBody): object {
  if (seasonStatsBody === PITCHER_SEASON_STATS_RESPONSE) {
    return PITCHER_CAREER_ARC_RESPONSE;
  }
  if (seasonStatsBody === EMPTY_STATS_RESPONSE) {
    return EMPTY_CAREER_ARC_RESPONSE;
  }
  if ('errors' in seasonStatsBody) {
    return EMPTY_CAREER_ARC_RESPONSE;
  }
  return BATTER_CAREER_ARC_RESPONSE;
}

async function setupPlayerDetailMocks(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const { seasonStatsBody = SEASON_STATS_RESPONSE, seasonStatsDelay } = opts;
  const careerArcBody =
    opts.careerArcBody ?? deriveCareerArcBody(seasonStatsBody);

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (
      postData.includes('getplayercareerarc') ||
      postData.includes('careerarcquery')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(careerArcBody),
      });
    } else if (postData.includes('getallplayerseasonsta')) {
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
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
  });

  test('displays career hero stats — AVG, HR, RBI chips', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Wait for stats to load (spinner should disappear)
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Hero stat chips (label text rendered inside HeroStat components)
    await expect(dialog.getByText('AVG').first()).toBeVisible();
    await expect(dialog.getByText('HR').first()).toBeVisible();
    await expect(dialog.getByText('RBI').first()).toBeVisible();

    // Computed career AVG from 2 seasons: (165+155)/(550+520) = 320/1070 ≈ .299
    const avgChip = dialog.getByText('.299').first();
    await expect(avgChip).toBeVisible();
  });

  test('shows eligible position badges', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // "Eligible Positions" label
    await expect(dialog.getByTestId('eligible-positions')).toBeVisible();

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

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Career Batting stat card title
    await expect(dialog.getByTestId('career-batting-card')).toBeVisible();

    // Key row labels in the batting card
    await expect(dialog.getByText('AVG').first()).toBeVisible();
    await expect(dialog.getByText('Home Runs')).toBeVisible();
    await expect(dialog.getByText('RBI').first()).toBeVisible();
  });

  test('shows season-by-season batting table with correct headers', async ({
    page,
  }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Switch to the Batting tab (Career Arc is the default when arc data is available)
    const battingTab = dialog.getByText('Batting', { exact: true }).first();
    await expect(battingTab).toBeVisible();
    await battingTab.click({ force: true });
    await expect(dialog.getByText('YEAR')).toBeVisible();

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
    await expect(
      dialog.getByText('AVG', { exact: true }).first(),
    ).toBeVisible();

    // Both season rows should appear
    await expect(dialog.getByText('2024', { exact: true })).toBeVisible();
    await expect(dialog.getByText('2023', { exact: true })).toBeVisible();
  });

  test('switching to Fielding tab shows fielding table', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Click the Fielding tab
    const fieldingTab = dialog.getByText('Fielding', { exact: true }).first();
    await expect(fieldingTab).toBeVisible();
    await fieldingTab.click({ force: true });
    await expect(dialog.getByText('POS').first()).toBeVisible();

    // Fielding table headers
    await expect(dialog.getByText('POS').first()).toBeVisible();
    await expect(dialog.getByText('INN').first()).toBeVisible();
    await expect(dialog.getByText('PO').first()).toBeVisible();
    await expect(dialog.getByText('A', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText('E', { exact: true }).first()).toBeVisible();
  });

  test('shows loading spinner while stats are fetching', async ({ page }) => {
    // Set a delay so we can catch the loading state
    await setupPlayerDetailMocks(page, { seasonStatsDelay: 1500 });
    await page.goto('/players/1');
    await page.waitForLoadState('domcontentloaded');

    // The spinner / loading text should be visible before data arrives
    await expect(page.getByTestId('player-detail-loading')).toBeVisible();

    // Eventually data loads and spinner disappears
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();
  });

  test('closes when the Close button is clicked', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
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

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Eligible positions for a pitcher
    await expect(dialog.getByText('SP').first()).toBeVisible();

    // Career Pitching card
    await expect(dialog.getByTestId('career-pitching-card')).toBeVisible();

    // Pitching hero chips
    await expect(dialog.getByText('W-L').first()).toBeVisible();
    await expect(dialog.getByText('SO').first()).toBeVisible();

    // Click the Pitching tab to show season-by-season table
    const pitchingTab = dialog.getByText('Pitching', { exact: true }).first();
    await expect(pitchingTab).toBeVisible();
    await pitchingTab.click({ force: true });
    await expect(dialog.getByText('ERA').first()).toBeVisible();

    // Season-by-season pitching table headers
    await expect(dialog.getByText('ERA').first()).toBeVisible();
    await expect(dialog.getByText('IP').first()).toBeVisible();
    await expect(dialog.getByText('BB').first()).toBeVisible();
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

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    await expect(dialog.getByTestId('player-detail-empty')).toBeVisible();
  });

  test('shows error state when the stats query fails', async ({ page }) => {
    await setupPlayerDetailMocks(page, {
      seasonStatsBody: {
        errors: [{ message: 'Internal server error' }],
      },
    });
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    await expect(dialog.getByTestId('player-detail-error')).toBeVisible();
  });

  test('pressing Escape closes the modal and navigates back', async ({
    page,
  }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
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

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    // The PlayerDetailPage renders a "← Back" button
    const backButton = page.getByRole('button', {
      name: /← back/i,
    });
    await expect(backButton).toBeVisible();
    // dispatchEvent bypasses overlay interception from the open dialog
    await backButton.dispatchEvent('click');

    await page.waitForURL('**/players/stats');
    // The stats page heading is a styled div, not a semantic heading element
    await expect(
      page.getByText(/MLB Player Statistics/i).first(),
    ).toBeVisible();
  });

  test('batting tab switches back from fielding tab', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Switch to Fielding
    await dialog
      .getByText('Fielding', { exact: true })
      .first()
      .click({ force: true });
    await expect(dialog.getByText('POS').first()).toBeVisible();

    // Switch back to Batting
    await dialog
      .getByText('Batting', { exact: true })
      .first()
      .click({ force: true });

    // Batting table headers should reappear
    await expect(dialog.getByText('YEAR')).toBeVisible();
    await expect(
      dialog.getByText('AVG', { exact: true }).first(),
    ).toBeVisible();
  });

  test('season data rows contain expected year values', async ({ page }) => {
    await setupPlayerDetailMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Season subtitle says "2 seasons"
    await expect(dialog.getByText(/2 season/i).first()).toBeVisible();

    // Switch to Batting tab to verify season rows
    const battingTab = dialog.getByText('Batting', { exact: true }).first();
    await expect(battingTab).toBeVisible();
    await battingTab.click({ force: true });
    await expect(dialog.getByText('2024', { exact: true })).toBeVisible();

    // Both season years are in the batting table
    await expect(dialog.getByText('2024', { exact: true })).toBeVisible();
    await expect(dialog.getByText('2023', { exact: true })).toBeVisible();
  });
});
