/**
 * E2E Tests: Player Detail — Season Batting Stats Table (LS-5586)
 *
 * Covers:
 *  - All column headers: YEAR, G, PA, AB, H, HR, RBI, SB, AVG, OBP, SLG
 *  - Season row data values (correct numbers per season)
 *  - Newest-first sort order
 *  - Multiple seasons rendered
 *  - On-the-fly calculated stats (AVG = H/AB, OBP = (H+BB)/PA, SLG = (HR×4+H)/AB)
 *  - Section heading "Season by Season · Batting"
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { expect, test } from '../fixtures/pages';
import {
  BASELINE_GRAPHQL_RESPONSES,
  extractOperationName,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Mock Data ──────────────────────────────────────────────────────────────────

/**
 * Batter with two seasons — used to verify columns, sort order, and values.
 *
 * Computed values:
 *   2024: AVG = 165/550 = .300  OBP = (165+60)/620 = .363  SLG = (28×4+165)/550 = .504
 *   2023: AVG = 155/520 = .298  OBP = (155+65)/590 = .373  SLG = (25×4+155)/520 = .490
 */
const TWO_SEASON_BATTER = {
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
        onBasePercentage: 0.363,
        sluggingPercentage: 0.504,
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
        onBasePercentage: 0.373,
        sluggingPercentage: 0.49,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
};

/** Single-season batter — verifies a 1-season table renders exactly one data row. */
const SINGLE_SEASON_BATTER = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['1B'],
      firstName: 'Freddie',
      lastName: 'Freeman',
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 2022,
        team: 'LAD',
        games: 159,
        plateAppearances: 700,
        atBats: 612,
        runs: 117,
        hits: 199,
        doubles: 47,
        triples: 2,
        homeRuns: 21,
        rbi: 100,
        stolenBases: 13,
        caughtStealing: 4,
        baseOnBalls: 84,
        strikeouts: 105,
        battingAverage: 0.325,
        onBasePercentage: 0.407,
        sluggingPercentage: 0.511,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
};

/** Career arc stub — minimal, needed by the GetPlayerCareerArc query. */
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
        onBasePercentage: 0.363,
        sluggingPercentage: 0.504,
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
        onBasePercentage: 0.373,
        sluggingPercentage: 0.49,
        onBasePlusSlugging: 0.86,
        onBasePlusSluggingPlus: 135,
        awardSummary: null,
      },
    ],
    playerSeasonPitching: [],
  },
};

const SINGLE_SEASON_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Freddie',
      lastName: 'Freeman',
      eligiblePositions: ['1B'],
      careerAchievements: {
        allStarSelections: 6,
        goldGloves: 1,
        silverSluggers: 4,
        mvpAwards: 1,
        cyYoungAwards: 0,
        hallOfFame: false,
        rookieOfTheYear: false,
      },
    },
    playerSeasonBatting: [
      {
        season: 2022,
        team: 'LAD',
        games: 159,
        hits: 199,
        atBats: 612,
        homeRuns: 21,
        rbi: 100,
        stolenBases: 13,
        battingAverage: 0.325,
        onBasePercentage: 0.407,
        sluggingPercentage: 0.511,
        onBasePlusSlugging: 0.918,
        onBasePlusSluggingPlus: 156,
        awardSummary: null,
      },
    ],
    playerSeasonPitching: [],
  },
};

/** Minimal player list required by GetCareerBattingStats / GetAllPlayers queries. */
const PLAYER_LIST_RESPONSE = {
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
            games: 285,
            plateAppearances: 1210,
            atBats: 1070,
            runs: 183,
            hits: 320,
            doubles: 58,
            triples: 3,
            homeRuns: 53,
            rbi: 165,
            stolenBases: 22,
            caughtStealing: 5,
            baseOnBalls: 125,
            strikeouts: 215,
            totalBases: 638,
            groundedIntoDoublePlays: 14,
            hitByPitch: 7,
            sacrificeHits: 0,
            intentionalBaseOnBalls: 18,
            battingAverage: 0.299,
            onBasePercentage: 0.368,
            sluggingPercentage: 0.497,
            offensiveWAR: 12.4,
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
}

async function setupMocks(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    seasonStatsBody = TWO_SEASON_BATTER,
    careerArcBody = BATTER_CAREER_ARC,
  } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (op === 'GetPlayerCareerArc' || op === 'CareerArcQuery') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(careerArcBody),
      });
    } else if (op === 'GetAllPlayerSeasonStats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(seasonStatsBody),
      });
    } else if (
      op === 'GetCareerBattingStats' ||
      op === 'GetAllPlayers' ||
      op === 'GetPlayersWithStats'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PLAYER_LIST_RESPONSE),
      });
    } else {
      const baselineResponse = BASELINE_GRAPHQL_RESPONSES[op.toLowerCase()];
      if (baselineResponse !== undefined) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(baselineResponse),
        });
      } else {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: `Unmocked GraphQL operation: ${op}` }],
          }),
        });
      }
    }
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Season Batting Table — column headers @regression', () => {
  test('renders all expected column headers', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');

    await playersPage.detail.expectText('YEAR');
    await playersPage.detail.expectText('G', { exact: true });
    await playersPage.detail.expectText('PA');
    await playersPage.detail.expectText('AB');
    await playersPage.detail.expectText('H', { exact: true });
    await playersPage.detail.expectText('HR', { exact: true });
    await playersPage.detail.expectText('RBI', { exact: true });
    await playersPage.detail.expectText('SB');
    await playersPage.detail.expectText('AVG', { exact: true });
    await playersPage.detail.expectText('OBP', { exact: true });
    await playersPage.detail.expectText('SLG', { exact: true });
  });

  test('shows "Season by Season · Batting" section heading', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');
    await playersPage.detail.expectText(/Season by Season/i);
  });
});

test.describe('Season Batting Table — row data @regression', () => {
  test('shows both season rows for a two-season player', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');
    await playersPage.detail.expectText('2024', { exact: true });
    await playersPage.detail.expectText('2023', { exact: true });
  });

  test('2024 season row shows correct games, HR, and RBI', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Switch to Batting tab to reveal season table
    await playersPage.detail.switchTab('Batting');
    await playersPage.detail.expectText('2024', { exact: true });

    // 2024 mock: games=145, HR=28, RBI=85
    await playersPage.detail.expectText('145');
    await playersPage.detail.expectText('28');
    await playersPage.detail.expectText('85');
  });

  test('2023 season row shows correct games and stolen bases', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');
    await playersPage.detail.expectText('2023', { exact: true });

    // 2023 mock: games=140, SB=10
    await playersPage.detail.expectText('140');
    await playersPage.detail.expectText('10');
  });

  test('single-season player shows exactly one data row', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: SINGLE_SEASON_BATTER,
      careerArcBody: SINGLE_SEASON_CAREER_ARC,
    });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');
    await playersPage.detail.expectText('2022', { exact: true });

    // Only the 2022 row — neither 2024 nor 2023 should appear in the dialog
    const dialog = playersPage.detail.dialog;
    await expect(dialog.getByText('2024', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('2023', { exact: true })).toHaveCount(0);
  });
});

test.describe('Season Batting Table — sort order @regression', () => {
  test('newest season (2024) appears before older season (2023)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');

    const dialog = playersPage.detail.dialog;

    const box2024 = await dialog
      .getByText('2024', { exact: true })
      .first()
      .boundingBox();
    const box2023 = await dialog
      .getByText('2023', { exact: true })
      .first()
      .boundingBox();

    // 2024 row must render higher on screen (smaller y) than the 2023 row
    expect(box2024).not.toBeNull();
    expect(box2023).not.toBeNull();
    if (box2024 && box2023) {
      expect(box2024.y).toBeLessThan(box2023.y);
    }
  });
});

test.describe('Season Batting Table — calculated stats @regression', () => {
  test('shows correct computed AVG for 2024 season (H/AB)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');

    // AVG = 165 / 550 = 0.300 → ".300"
    await playersPage.detail.expectText('.300');
  });

  test('shows correct computed AVG for 2023 season (H/AB)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');

    // AVG = 155 / 520 = 0.29807 → ".298"
    await playersPage.detail.expectText('.298');
  });

  test('shows correct computed OBP for 2024 season ((H+BB)/PA)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');

    // OBP = (165 + 60) / 620 = 225 / 620 = 0.36290 → ".363"
    await playersPage.detail.expectText('.363');
  });

  test('shows correct computed OBP for 2023 season ((H+BB)/PA)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');

    // OBP = (155 + 65) / 590 = 220 / 590 = 0.37288 → ".373"
    await playersPage.detail.expectText('.373');
  });

  test('shows correct computed SLG for 2024 season ((HR×4+H)/AB)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');

    // SLG = (28×4 + 165) / 550 = 277 / 550 = 0.50363 → ".504"
    await playersPage.detail.expectText('.504');
  });

  test('shows correct computed SLG for 2023 season ((HR×4+H)/AB)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');

    // SLG = (25×4 + 155) / 520 = 255 / 520 = 0.49038 → ".490"
    await playersPage.detail.expectText('.490');
  });
});

test.describe('Season Batting Table — multiple seasons @regression', () => {
  test('season count subtitle reflects the correct number of seasons', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Subtitle says "2 seasons"
    await playersPage.detail.expectText(/2 season/i);
  });

  test('all columns still appear with multiple seasons loaded', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');

    // Full column set present regardless of season count
    await playersPage.detail.expectText('OBP', { exact: true });
    await playersPage.detail.expectText('SLG', { exact: true });
    await playersPage.detail.expectText('AVG', { exact: true });

    // Both seasons visible
    await playersPage.detail.expectText('2024', { exact: true });
    await playersPage.detail.expectText('2023', { exact: true });
  });
});
