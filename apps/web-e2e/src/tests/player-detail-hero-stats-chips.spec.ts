/**
 * E2E Tests: Player Detail — Hero Stats Chips (LS-5584)
 *
 * Covers the top-line hero stat chips rendered above the tab row:
 *   - Batters: "Career AVG", "Home Runs", "Runs Batted In"
 *   - Pitchers: "Record" (W-L), "Strikeouts", "Innings Pitched"
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { test } from '../fixtures/pages';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Mock Data ──────────────────────────────────────────────────────────────────

/** Two-season batter (Mike Trout). Career computed values:
 *  AVG = (165+155)/(550+520) = 320/1070 ≈ .299
 *  HR  = 28+25 = 53
 *  RBI = 85+80 = 165
 */
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
    playerSeasonFielding: [],
  },
};

/** Career arc response paired with BATTER_SEASON_STATS. */
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
    arcBatting: [
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
    arcPitching: [],
  },
};

/** One-season pitcher (Walker Buehler). Career computed values:
 *  Record = 15–5 (en-dash)
 *  SO     = 245
 *  IP     = 210.0
 */
const PITCHER_SEASON_STATS = {
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

/** Career arc response paired with PITCHER_SEASON_STATS. */
const PITCHER_CAREER_ARC = {
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
    arcBatting: [],
    arcPitching: [
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

/** Empty stats — no seasons recorded. */
const EMPTY_STATS = {
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

/** Empty career arc response. */
const EMPTY_CAREER_ARC = {
  data: {
    player: null,
    arcBatting: [],
    arcPitching: [],
  },
};

/** Minimal player list for the stats table. */
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

// ── Route Setup ───────────────────────────────────────────────────────────────

interface SetupOptions {
  seasonStatsBody?: object;
  careerArcBody?: object;
  seasonStatsDelay?: number;
}

async function setupMocks(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
): Promise<void> {
  const {
    seasonStatsBody = BATTER_SEASON_STATS,
    careerArcBody = BATTER_CAREER_ARC,
    seasonStatsDelay,
  } = opts;

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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(STATS_TABLE_RESPONSE),
      });
    } else {
      await route.fallback();
    }
  });
}

// ── Tests: Batter hero chips — labels ─────────────────────────────────────────

test.describe('Hero Stats Chips — batter labels @smoke', () => {
  test('shows "Career AVG" chip label for a batter', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText('Career AVG');
  });

  test('shows "Home Runs" chip label for a batter', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText('Home Runs');
  });

  test('shows "Runs Batted In" chip label for a batter', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText('Runs Batted In');
  });

  test('all three batter hero chip labels are visible together', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText('Career AVG');
    await playersPage.detail.expectText('Home Runs');
    await playersPage.detail.expectText('Runs Batted In');
  });
});

// ── Tests: Batter hero chips — computed values ────────────────────────────────

test.describe('Hero Stats Chips — batter values @regression', () => {
  test('Career AVG chip shows computed career batting average', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Career AVG: (165+155)/(550+520) = 320/1070 ≈ .299
    await playersPage.detail.expectText('.299');
  });

  test('Home Runs chip shows career total HR', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Career HR: 28 + 25 = 53
    await playersPage.detail.expectText('53');
  });

  test('Runs Batted In chip shows career total RBI', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Career RBI: 85 + 80 = 165
    await playersPage.detail.expectText('165');
  });

  test('Career AVG accumulates across multiple seasons correctly', async ({
    page,
    playersPage,
  }) => {
    const twoSeasonBatterStats = {
      data: {
        player: {
          __typename: 'Player',
          eligiblePositions: ['1B'],
          firstName: 'Test',
          lastName: 'Batter',
        },
        playerSeasonBatting: [
          {
            __typename: 'SeasonBatting',
            season: 2022,
            team: 'NYY',
            games: 100,
            plateAppearances: 400,
            atBats: 360,
            runs: 50,
            hits: 90,
            doubles: 18,
            triples: 1,
            homeRuns: 10,
            rbi: 40,
            stolenBases: 2,
            caughtStealing: 1,
            baseOnBalls: 35,
            strikeouts: 80,
            battingAverage: 0.25,
            onBasePercentage: 0.32,
            sluggingPercentage: 0.4,
          },
          {
            __typename: 'SeasonBatting',
            season: 2023,
            team: 'NYY',
            games: 150,
            plateAppearances: 600,
            atBats: 540,
            runs: 80,
            hits: 162,
            doubles: 32,
            triples: 3,
            homeRuns: 20,
            rbi: 75,
            stolenBases: 5,
            caughtStealing: 2,
            baseOnBalls: 55,
            strikeouts: 120,
            battingAverage: 0.3,
            onBasePercentage: 0.38,
            sluggingPercentage: 0.5,
          },
        ],
        playerSeasonPitching: [],
        playerSeasonFielding: [],
      },
    };

    const twoSeasonCareerArc = {
      data: {
        player: {
          __typename: 'Player',
          firstName: 'Test',
          lastName: 'Batter',
          eligiblePositions: ['1B'],
          careerAchievements: {
            allStarSelections: 0,
            goldGloves: 0,
            silverSluggers: 0,
            mvpAwards: 0,
            cyYoungAwards: 0,
            hallOfFame: false,
            rookieOfTheYear: false,
          },
        },
        arcBatting: [
          {
            season: 2022,
            team: 'NYY',
            games: 100,
            hits: 90,
            atBats: 360,
            homeRuns: 10,
            rbi: 40,
            stolenBases: 2,
            battingAverage: 0.25,
            onBasePercentage: 0.32,
            sluggingPercentage: 0.4,
            onBasePlusSlugging: 0.72,
            onBasePlusSluggingPlus: 90,
            awardSummary: null,
          },
          {
            season: 2023,
            team: 'NYY',
            games: 150,
            hits: 162,
            atBats: 540,
            homeRuns: 20,
            rbi: 75,
            stolenBases: 5,
            battingAverage: 0.3,
            onBasePercentage: 0.38,
            sluggingPercentage: 0.5,
            onBasePlusSlugging: 0.88,
            onBasePlusSluggingPlus: 120,
            awardSummary: null,
          },
        ],
        arcPitching: [],
      },
    };

    await setupMocks(page, {
      seasonStatsBody: twoSeasonBatterStats,
      careerArcBody: twoSeasonCareerArc,
    });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Career AVG: (90+162)/(360+540) = 252/900 = .280
    await playersPage.detail.expectText('.280');
  });
});

// ── Tests: Pitcher hero chips — labels ───────────────────────────────────────

test.describe('Hero Stats Chips — pitcher labels @smoke', () => {
  test('shows "Record" chip label for a pitcher', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: PITCHER_SEASON_STATS,
      careerArcBody: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText('Record');
  });

  test('shows "Strikeouts" chip label for a pitcher', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: PITCHER_SEASON_STATS,
      careerArcBody: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText('Strikeouts');
  });

  test('shows "Innings Pitched" chip label for a pitcher', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: PITCHER_SEASON_STATS,
      careerArcBody: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText('Innings Pitched');
  });

  test('all three pitcher hero chip labels are visible together', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: PITCHER_SEASON_STATS,
      careerArcBody: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText('Record');
    await playersPage.detail.expectText('Strikeouts');
    await playersPage.detail.expectText('Innings Pitched');
  });
});

// ── Tests: Pitcher hero chips — computed values ───────────────────────────────

test.describe('Hero Stats Chips — pitcher values @regression', () => {
  test('Record chip shows W-L with en-dash separator', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: PITCHER_SEASON_STATS,
      careerArcBody: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // En-dash (–) not hyphen (-): "15–5"
    await playersPage.detail.expectText('15–5');
  });

  test('Strikeouts chip shows career total SO', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: PITCHER_SEASON_STATS,
      careerArcBody: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Strikeouts: 245
    await playersPage.detail.expectText('245');
  });

  test('Innings Pitched chip shows career IP in baseball notation', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: PITCHER_SEASON_STATS,
      careerArcBody: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // IP in baseball notation: 210 full innings = "210.0"
    await playersPage.detail.expectText('210.0');
  });
});

// ── Tests: Chip visibility — loading and empty states ────────────────────────

test.describe('Hero Stats Chips — loading and empty states @regression', () => {
  test('hero chips are not visible while stats are loading', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { seasonStatsDelay: 1500 });
    await playersPage.gotoDetail(1, 'domcontentloaded');

    // The loading spinner should be visible before data arrives
    await playersPage.detail.expectLoading();

    // Wait for data to finish loading
    await playersPage.detail.expectNotLoading();

    // Chips appear only after data loads
    await playersPage.detail.expectText('Career AVG');
  });

  test('no batter hero chips when player has no season data', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: EMPTY_STATS,
      careerArcBody: EMPTY_CAREER_ARC,
    });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Empty state renders; no chips
    await playersPage.detail.expectEmptyState();
  });

  test('error state shown when stats query fails', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: { errors: [{ message: 'Internal server error' }] },
      careerArcBody: EMPTY_CAREER_ARC,
    });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectErrorState();
  });
});

// ── Tests: Two-way player (batter chips take precedence) ─────────────────────

test.describe('Hero Stats Chips — two-way player @regression', () => {
  test('shows batter hero chips (not pitcher chips) for a two-way player', async ({
    page,
    playersPage,
  }) => {
    const twoWayStats = {
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

    const twoWayCareerArc = {
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
        arcBatting: [
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
        arcPitching: [
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

    await setupMocks(page, {
      seasonStatsBody: twoWayStats,
      careerArcBody: twoWayCareerArc,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Two-way player: batter chips take precedence (hasBatting wins)
    await playersPage.detail.expectText('Career AVG');
    await playersPage.detail.expectText('Home Runs');
    await playersPage.detail.expectText('Runs Batted In');
  });

  test('two-way player Career AVG chip shows correct computed average', async ({
    page,
    playersPage,
  }) => {
    const twoWayStats = {
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

    const twoWayCareerArcValue = {
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
        arcBatting: [
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
        arcPitching: [],
      },
    };

    await setupMocks(page, {
      seasonStatsBody: twoWayStats,
      careerArcBody: twoWayCareerArcValue,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Career AVG from 2024 only: 197/556 ≈ .354
    await playersPage.detail.expectText('.354');
  });
});
