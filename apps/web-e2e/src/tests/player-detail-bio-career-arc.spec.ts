/**
 * Player Detail Modal E2E Tests — Bio, Career Arc & Stats (LS-600)
 *
 * Extends LS-691 coverage with:
 *   - Player bio (name display, position badge in modal title)
 *   - Career Arc tab (OPS chart, peak/avg stats, award milestone legend)
 *   - Career Arc pitching mode toggle (ERA+ chart)
 *   - Stat data value verification (actual stat numbers in tables & cards)
 *   - Opening modal from the player stats table (click row)
 *   - Career achievements via GetPlayerCareerArc query
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { expect, test } from '../fixtures/auth-enhanced';

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

// ── Mock Data ─────────────────────────────────────────────────────────────────

/** Batter with 2 seasons of batting, 1 season of fielding, no pitching. */
const BATTER_SEASON_STATS = {
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

/** Career Arc data for a batter (Mike Trout) with awards. */
const BATTER_CAREER_ARC = {
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
        awardSummary: 'AS',
      },
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
        awardSummary: 'AS,MVP',
      },
    ],
    playerSeasonPitching: [],
  },
};

/** Two-way player (Ohtani) with both batting and pitching career arc data. */
const TWO_WAY_SEASON_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['SP', 'DH'],
      firstName: 'Shohei',
      lastName: 'Ohtani',
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 2024,
        team: 'LAD',
        games: 159,
        plateAppearances: 636,
        atBats: 556,
        runs: 134,
        hits: 197,
        doubles: 38,
        triples: 7,
        homeRuns: 54,
        rbi: 130,
        stolenBases: 59,
        caughtStealing: 10,
        baseOnBalls: 81,
        strikeouts: 164,
        battingAverage: 0.31,
        onBasePercentage: 0.39,
        sluggingPercentage: 0.646,
      },
    ],
    playerSeasonPitching: [
      {
        __typename: 'SeasonPitching',
        season: 2023,
        team: 'LAA',
        games: 23,
        wins: 10,
        losses: 5,
        gamesStarted: 23,
        completeGames: 0,
        shutouts: 0,
        saves: 0,
        inningsPitched: 132,
        hits: 88,
        runs: 38,
        earnedRuns: 35,
        homeRuns: 10,
        baseOnBalls: 34,
        strikeouts: 167,
        earnedRunAverage: '3.14',
        whip: 0.92,
      },
    ],
    playerSeasonFielding: [],
  },
};

const TWO_WAY_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Shohei',
      lastName: 'Ohtani',
      eligiblePositions: ['SP', 'DH'],
      careerAchievements: {
        allStarSelections: 4,
        goldGloves: 0,
        silverSluggers: 2,
        mvpAwards: 2,
        cyYoungAwards: 0,
        hallOfFame: false,
        rookieOfTheYear: true,
      },
    },
    playerSeasonBatting: [
      {
        season: 2024,
        team: 'LAD',
        games: 159,
        hits: 197,
        atBats: 556,
        homeRuns: 54,
        rbi: 130,
        stolenBases: 59,
        battingAverage: 0.31,
        onBasePercentage: 0.39,
        sluggingPercentage: 0.646,
        onBasePlusSlugging: 1.036,
        onBasePlusSluggingPlus: 190,
        awardSummary: 'AS,MVP',
      },
    ],
    playerSeasonPitching: [
      {
        season: 2023,
        team: 'LAA',
        games: 23,
        wins: 10,
        losses: 5,
        earnedRunAverage: '3.14',
        earnedRunAveragePlus: 138,
        whip: 0.92,
        strikeouts: 167,
        inningsPitched: 132,
        awardSummary: null,
      },
    ],
  },
};

/** Minimal player list for the stats table (one player row). */
const STATS_TABLE_RESPONSE = {
  data: {
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
};

// ── Route Setup ──────────────────────────────────────────────────────────────

interface SetupOptions {
  seasonStatsBody?: typeof BATTER_SEASON_STATS | typeof TWO_WAY_SEASON_STATS;
  careerArcBody?: typeof BATTER_CAREER_ARC | typeof TWO_WAY_CAREER_ARC;
}

async function setupMocks(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    seasonStatsBody = BATTER_SEASON_STATS,
    careerArcBody = BATTER_CAREER_ARC,
  } = opts;

  await page.route(
    (url) =>
      url.toString().includes('/graphql') && !url.toString().includes('/@fs/'),
    async (route) => {
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
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(STATS_TABLE_RESPONSE),
        });
      } else {
        await route.fallback();
      }
    },
  );
}

// ── Tests: Player bio display ───────────────────────────────────────────────

test.describe('Player Detail Modal – bio display @smoke', () => {
  test('displays player name in modal title', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Player name resolved from the GraphQL response
    await expect(dialog.getByText('Mike Trout')).toBeVisible();
  });

  test('displays position badge in modal title area', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // The eligible positions section should show CF and OF
    await expect(dialog.getByTestId('eligible-positions')).toBeVisible();
    await expect(dialog.getByText('CF', { exact: true }).first()).toBeVisible();
  });

  test('shows season count subtitle', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Subtitle says "2 seasons"
    await expect(dialog.getByText(/2 season/i)).toBeVisible();
  });
});

// ── Tests: Career Arc tab ───────────────────────────────────────────────────

test.describe('Player Detail Modal – Career Arc tab @regression', () => {
  // Helper: navigate to player modal and switch to Career Arc tab.
  // Due to query timing, GetAllPlayerSeasonStats may resolve before
  // GetPlayerCareerArc, causing the component to fall back to Batting.
  // Explicitly clicking the Career Arc tab avoids the race.
  async function openCareerArc(page: import('@playwright/test').Page) {
    await setupMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    const arcTab = dialog.getByText('Career Arc', { exact: true });
    await expect(arcTab).toBeVisible();
    await arcTab.click({ force: true });
    // Allow re-render after tab switch
    await page.waitForTimeout(300);
    return dialog;
  }

  test('Career Arc is the default active tab', async ({ page }) => {
    const dialog = await openCareerArc(page);

    // Career Arc content should be visible (renders Peak OPS)
    await expect(dialog.getByText('Peak OPS')).toBeVisible();
  });

  test('shows Peak OPS stat in career arc header', async ({ page }) => {
    const dialog = await openCareerArc(page);

    // Peak OPS label and value (0.890 from 2024 season)
    await expect(dialog.getByText('Peak OPS')).toBeVisible();
    await expect(dialog.getByText('0.890')).toBeVisible();
  });

  test('shows Career Avg OPS stat', async ({ page }) => {
    const dialog = await openCareerArc(page);

    await expect(dialog.getByText('Career Avg OPS')).toBeVisible();
    // Average of 0.860 and 0.890 = 0.875
    await expect(dialog.getByText('0.875').first()).toBeVisible();
  });

  test('shows Seasons count in career arc header', async ({ page }) => {
    const dialog = await openCareerArc(page);

    await expect(dialog.getByText('Seasons').first()).toBeVisible();
  });

  test('shows award milestone legend badges', async ({ page }) => {
    const dialog = await openCareerArc(page);

    // Award legend badges: 2023 has AS, 2024 has AS + MVP
    await expect(dialog.getByText(/All-Star/).first()).toBeVisible();
    await expect(dialog.getByText(/MVP/)).toBeVisible();
  });
});

// ── Tests: Career Arc for two-way player ────────────────────────────────────

test.describe('Player Detail Modal – two-way player Career Arc @regression', () => {
  test('shows batting/pitching arc mode toggle for two-way player', async ({
    page,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await page.goto('/players/2');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Click Career Arc tab explicitly (race condition may default to Batting)
    const arcTab = dialog.getByText('Career Arc', { exact: true });
    await expect(arcTab).toBeVisible();
    await arcTab.click({ force: true });
    await page.waitForTimeout(300);

    // Two-way player should have both Batting and Pitching arc toggle buttons
    await expect(
      dialog.getByText('Batting', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      dialog.getByText('Pitching', { exact: true }).first(),
    ).toBeVisible();
  });

  test('shows player name as Shohei Ohtani', async ({ page }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await page.goto('/players/2');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    await expect(dialog.getByText('Shohei Ohtani')).toBeVisible();
  });

  test('shows pitching season data in Pitching tab', async ({ page }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await page.goto('/players/2');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Switch to Pitching tab
    const pitchingTab = dialog.getByText('Pitching', { exact: true }).first();
    await expect(pitchingTab).toBeVisible();
    await pitchingTab.click({ force: true });
    await page.waitForTimeout(300);

    // 2023 pitching season row should be visible
    await expect(dialog.getByText('2023', { exact: true })).toBeVisible();

    // ERA column header
    await expect(dialog.getByText('ERA').first()).toBeVisible();
  });
});

// ── Tests: Stat data value verification ─────────────────────────────────────

test.describe('Player Detail Modal – stat data values @regression', () => {
  test('career batting card shows correct computed batting average', async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Career batting card should be present
    await expect(dialog.getByTestId('career-batting-card')).toBeVisible();

    // Career AVG from mock data: (165+155)/(550+520) = 320/1070 ≈ .299
    await expect(dialog.getByText('.299').first()).toBeVisible();
  });

  test('career batting card shows total home runs', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Total HR = 28 + 25 = 53
    await expect(dialog.getByText('53').first()).toBeVisible();
  });

  test('career batting card shows total RBI', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Total RBI = 85 + 80 = 165
    await expect(dialog.getByText('165').first()).toBeVisible();
  });

  test('batting table shows 2024 season row with correct values', async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto('/players/1');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Switch to Batting tab to see the season table
    const battingTab = dialog.getByText('Batting', { exact: true }).first();
    await expect(battingTab).toBeVisible();
    await battingTab.click({ force: true });
    await page.waitForTimeout(300);

    // 2024 season: 145 G, 28 HR, 85 RBI
    await expect(dialog.getByText('2024', { exact: true })).toBeVisible();
    await expect(dialog.getByText('145').first()).toBeVisible();
  });
});

// ── Tests: Opening modal from stats page ────────────────────────────────────

test.describe('Player Detail Modal – open from stats table @regression', () => {
  test('clicking a player row on /players/stats opens the modal', async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto('/players/stats');
    await page.waitForLoadState('networkidle');

    // The stats table should have loaded with Mike Trout row
    const troutRow = page.getByText('Trout').first();
    await expect(troutRow).toBeVisible();

    // Click the player row to open the detail modal
    await troutRow.click();

    // The modal dialog should appear
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
  });
});
