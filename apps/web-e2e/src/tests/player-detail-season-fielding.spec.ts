/**
 * E2E Tests: Player Detail Modal — Season Fielding Stats Table (LS-5587)
 *
 * Covers the season-by-season fielding stats table on the Fielding tab:
 *   - Column headers: POS, G, INN, PO, A, E
 *   - Season row data values (position, games, innings, putouts, assists, errors)
 *   - Section title "Season by Season · Fielding"
 *   - Multiple fielding seasons render as multiple rows
 *   - Fielding tab absent when player has no fielding data (pitcher)
 *   - Multi-position aggregation within the same season
 *   - "Newest first" ordering metadata
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { expect, test } from '../fixtures/pages';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Mock Data ──────────────────────────────────────────────────────────────────

/** Batter with a single season of fielding data at CF. */
const BATTER_ONE_FIELDING_SEASON = {
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

/** Batter with two seasons of fielding data. */
const BATTER_TWO_FIELDING_SEASONS = {
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
      {
        __typename: 'SeasonFielding',
        season: 2023,
        team: 'LAA',
        position: 'CF',
        games: 135,
        gamesStarted: 133,
        inningsDefended: 1205,
        putouts: 360,
        assists: 6,
        errors: 3,
        doublePlays: 2,
        fieldingPercentage: 0.992,
      },
    ],
  },
};

/**
 * Player who played two positions in one season (CF and LF). The modal
 * aggregates both rows into one combined entry when season matches.
 * Combined 2024: games 100+40=140, inn 900+355=1255, po 260+85=345,
 * a 5+2=7, e 1+1=2, position "CF, LF".
 */
const MULTI_POSITION_SAME_SEASON = {
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
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [
      {
        __typename: 'SeasonFielding',
        season: 2024,
        team: 'LAA',
        position: 'CF',
        games: 100,
        gamesStarted: 98,
        inningsDefended: 900,
        putouts: 260,
        assists: 5,
        errors: 1,
        doublePlays: 2,
        fieldingPercentage: 0.996,
      },
      {
        __typename: 'SeasonFielding',
        season: 2024,
        team: 'LAA',
        position: 'LF',
        games: 40,
        gamesStarted: 38,
        inningsDefended: 355,
        putouts: 85,
        assists: 2,
        errors: 1,
        doublePlays: 0,
        fieldingPercentage: 0.989,
      },
    ],
  },
};

/**
 * Two positions in one season where the raw sum of baseball-notation innings
 * overflows an out boundary: CF(5.1) + LF(5.2) = 10.3 as a raw number, but
 * ipToOuts(5.1)+ipToOuts(5.2) = 16+17 = 33 outs = 11.0 innings.
 * This fixture verifies LS-6987: the INN column must use baseball notation
 * conversion, not raw decimal display.
 */
const MULTI_POSITION_FRACTIONAL_INN = {
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
        games: 100,
        plateAppearances: 410,
        atBats: 360,
        runs: 60,
        hits: 105,
        doubles: 18,
        triples: 1,
        homeRuns: 15,
        rbi: 55,
        stolenBases: 5,
        caughtStealing: 1,
        baseOnBalls: 40,
        strikeouts: 75,
        battingAverage: 0.292,
        onBasePercentage: 0.36,
        sluggingPercentage: 0.47,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [
      {
        __typename: 'SeasonFielding',
        season: 2024,
        team: 'LAA',
        position: 'CF',
        games: 60,
        gamesStarted: 60,
        inningsDefended: 5.1,
        putouts: 120,
        assists: 2,
        errors: 1,
        doublePlays: 1,
        fieldingPercentage: 0.992,
      },
      {
        __typename: 'SeasonFielding',
        season: 2024,
        team: 'LAA',
        position: 'LF',
        games: 40,
        gamesStarted: 38,
        inningsDefended: 5.2,
        putouts: 80,
        assists: 1,
        errors: 0,
        doublePlays: 0,
        fieldingPercentage: 1.0,
      },
    ],
  },
};

/** Pitcher with no fielding data — the Fielding tab must not appear. */
const PITCHER_NO_FIELDING = {
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

/** Minimal career arc for a batter (powers the GetPlayerCareerArc query). */
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
    ],
    playerSeasonPitching: [],
  },
};

/** Minimal career arc for a pitcher. */
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

// ── Route Setup ───────────────────────────────────────────────────────────────

interface SetupOptions {
  seasonStatsBody?: object;
  careerArcBody?: object;
}

async function setupMocks(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    seasonStatsBody = BATTER_ONE_FIELDING_SEASON,
    careerArcBody = BATTER_CAREER_ARC,
  } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('"getplayercareerarc"')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(careerArcBody),
      });
    } else if (postData.includes('"getallplayerseasonstats"')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(seasonStatsBody),
      });
    } else if (
      postData.includes('"getcareerbattingstats"') ||
      postData.includes('"getallplayers"') ||
      postData.includes('"getplayerswithstats"')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
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
        }),
      });
    } else {
      await route.fallback();
    }
  });
}

// ── Tests: Column headers ─────────────────────────────────────────────────────

test.describe('Season Fielding Stats Table — column headers @regression', () => {
  test('shows POS, G, INN, PO, A, E column headers in the Fielding tab', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('POS');

    await playersPage.detail.expectText('POS');
    await playersPage.detail.expectText('G', { exact: true });
    await playersPage.detail.expectText('INN');
    await playersPage.detail.expectText('PO');
    await playersPage.detail.expectText('A', { exact: true });
    await playersPage.detail.expectText('E', { exact: true });
  });

  test('section title "Season by Season · Fielding" is visible', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('Season by Season · Fielding');
  });

  test('"Newest first" ordering metadata is visible', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('Newest first');
  });
});

// ── Tests: Season row data values ─────────────────────────────────────────────

test.describe('Season Fielding Stats Table — data values @regression', () => {
  test('fielding row displays the season year', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('POS');

    // Season year from mock data
    await playersPage.detail.expectText('2024', { exact: true });
  });

  test('POS column shows the fielding position (CF)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('POS');

    // position: 'CF' from mock data
    await playersPage.detail.expectText('CF', { exact: true });
  });

  test('G column shows games played (140)', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('G', { exact: true });

    // games: 140 from mock data
    await playersPage.detail.expectText('140');
  });

  test('INN column shows innings defended (1260)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('INN');

    // inningsDefended: 1260 from mock data
    await playersPage.detail.expectText('1260');
  });

  test('PO column shows putouts (380)', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('PO');

    // putouts: 380 from mock data
    await playersPage.detail.expectText('380');
  });

  test('A column shows assists (8)', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('A', { exact: true });

    // assists: 8 from mock data
    await playersPage.detail.expectText('8');
  });

  test('E column shows errors (2)', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('E', { exact: true });

    // errors: 2 from mock data
    await playersPage.detail.expectText('2');
  });
});

// ── Tests: Multiple fielding seasons ─────────────────────────────────────────

test.describe('Season Fielding Stats Table — multiple seasons @regression', () => {
  test('renders a row for each fielding season (2024 and 2023)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { seasonStatsBody: BATTER_TWO_FIELDING_SEASONS });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('POS');

    // Both season years must appear in the table
    await playersPage.detail.expectText('2024', { exact: true });
    await playersPage.detail.expectText('2023', { exact: true });
  });

  test('2023 fielding row shows correct PO, A, E values', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { seasonStatsBody: BATTER_TWO_FIELDING_SEASONS });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('POS');

    // 2023: putouts=360, assists=6, errors=3
    await playersPage.detail.expectText('360');
    await playersPage.detail.expectText('6');
    await playersPage.detail.expectText('3');
  });

  test('2023 fielding row shows innings defended (1205)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { seasonStatsBody: BATTER_TWO_FIELDING_SEASONS });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('INN');

    // inningsDefended: 1205 for 2023 season
    await playersPage.detail.expectText('1205');
  });
});

// ── Tests: Multi-position same season aggregation ─────────────────────────────

test.describe('Season Fielding Stats Table — multi-position aggregation @regression', () => {
  test('aggregates G, INN, PO, A, E when player has two positions in one season', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { seasonStatsBody: MULTI_POSITION_SAME_SEASON });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('POS');

    // CF(100g) + LF(40g) = 140 total games
    await playersPage.detail.expectText('140');
    // CF(900) + LF(355) = 1255 total innings
    await playersPage.detail.expectText('1255');
    // CF(260) + LF(85) = 345 total putouts
    await playersPage.detail.expectText('345');
    // CF(5) + LF(2) = 7 total assists
    await playersPage.detail.expectText('7');
    // CF(1) + LF(1) = 2 total errors
    await playersPage.detail.expectText('2');
  });

  test('combined POS cell lists all positions played in the season', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { seasonStatsBody: MULTI_POSITION_SAME_SEASON });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('POS');

    // The modal appends positions in encounter order: "CF, LF"
    await playersPage.detail.expectText(/CF.*LF/);
  });

  test('two-position season collapses into one row (not two separate rows)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { seasonStatsBody: MULTI_POSITION_SAME_SEASON });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('POS');

    // Only one season year should appear (one combined row, not two)
    const yearLocator = page
      .locator('div[role="dialog"]')
      .getByText('2024', { exact: true });
    await expect(yearLocator).toHaveCount(1);
  });
});

// ── Tests: Baseball-notation INN formatting (LS-6987) ─────────────────────────

test.describe('Season Fielding Stats Table — INN baseball notation @regression', () => {
  test('INN accumulates fractional outs correctly across positions (5.1 + 5.2 = 11.0, not 10.3)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { seasonStatsBody: MULTI_POSITION_FRACTIONAL_INN });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Fielding');
    await playersPage.detail.expectText('INN');

    // CF(5.1 = 16 outs) + LF(5.2 = 17 outs) = 33 outs = 11.0 innings.
    // Raw decimal addition (5.1 + 5.2 = 10.3) would wrongly display "10.3".
    await playersPage.detail.expectText('11.0');
  });
});

// ── Tests: Fielding tab absent for pitcher ────────────────────────────────────

test.describe('Season Fielding Stats Table — pitcher has no fielding tab @regression', () => {
  test('Fielding tab is not rendered when player has no fielding data', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: PITCHER_NO_FIELDING,
      careerArcBody: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // The pitcher's Pitching tab must appear
    await playersPage.detail.expectText('Pitching', { exact: true });

    // The Fielding tab must be absent for a pitcher with no fielding data
    const fieldingTab = page
      .locator('div[role="dialog"]')
      .getByText('Fielding', { exact: true });
    await expect(fieldingTab).toHaveCount(0);
  });
});
