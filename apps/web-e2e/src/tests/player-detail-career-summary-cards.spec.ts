/**
 * E2E Tests: Player Detail — Career Summary Cards (LS-5580)
 *
 * Covers career batting and pitching summary cards on the Player Detail page:
 *   - Career Batting card: all stat labels (Games, AVG, Home Runs, RBI, Hits,
 *     Stolen Bases) and computed career totals for hitters
 *   - Career Pitching card: all stat labels (Games, Record, Innings, Strikeouts)
 *     and computed career totals for pitchers
 *   - Two-way player: both batting and pitching cards render simultaneously
 *   - Cards absent when no season stats exist
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Mock Data ─────────────────────────────────────────────────────────────────

/** Two-season batter (Mike Trout). Career totals:
 *   Games 285 · AVG .299 · HR 53 · RBI 165 · Hits 320 · SB 22
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

/** Minimal career arc body to satisfy the GetPlayerCareerArc query for a batter. */
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

/** One-season pitcher (Walker Buehler). Career totals:
 *   Games 32 · Record 15–5 · Innings 210.0 · SO 245
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

/** Minimal career arc body for a pitcher. */
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

/** Two-way player (Shohei Ohtani) with one batting season and one pitching season.
 *  Batting card totals: Games 159 · AVG .354 · HR 54 · RBI 130 · Hits 197 · SB 59
 *  Pitching card totals: Games 23 · Record 10–5 · Innings 132.0 · SO 167
 */
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
        battingAverage: 0.354,
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

/** Career arc body for a two-way player. */
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
        battingAverage: 0.354,
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

/** Empty stats — no seasons recorded; career summary cards must not render. */
const EMPTY_SEASON_STATS = {
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

/** Minimal stats-table response (used for GetCareerBattingStats / GetAllPlayers). */
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
            totalBases: 620,
            groundedIntoDoublePlays: 15,
            hitByPitch: 10,
            sacrificeHits: 1,
            intentionalBaseOnBalls: 40,
            battingAverage: 0.299,
            onBasePercentage: 0.368,
            sluggingPercentage: 0.507,
            offensiveWAR: 30.1,
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
  seasonStatsBody?: object;
  careerArcBody?: object;
}

async function setupMocks(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    seasonStatsBody = BATTER_SEASON_STATS,
    careerArcBody = BATTER_CAREER_ARC,
  } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const opName = extractOperationName(route).toLowerCase();

    if (opName === 'getplayercareerarc') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(careerArcBody),
      });
    } else if (opName === 'getallplayerseasonstats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(seasonStatsBody),
      });
    } else if (
      opName === 'getcareerbattingstats' ||
      opName === 'getallplayers' ||
      opName === 'getplayerswithstats'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(STATS_TABLE_RESPONSE),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Tests: Career Batting card ────────────────────────────────────────────────

test.describe('Career Summary Cards — hitter @regression', () => {
  test('career-batting-card is present for a hitter', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerBattingCard();
  });

  test('shows "Career Batting" section title', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText('Career Batting');
  });

  test('shows all batting stat labels — Games, AVG, Home Runs, RBI, Hits, Stolen Bases', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerBattingCard();

    await playersPage.detail.expectText('Games');
    await playersPage.detail.expectText('AVG');
    await playersPage.detail.expectText('Home Runs');
    await playersPage.detail.expectText('RBI');
    await playersPage.detail.expectText('Hits');
    await playersPage.detail.expectText('Stolen Bases');
  });

  test('shows computed career batting average (.299 from 2 seasons)', async ({
    page,
    playersPage,
  }) => {
    // AVG = (165 + 155) / (550 + 520) = 320 / 1070 ≈ 0.299
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerBattingCard();
    await playersPage.detail.expectText('.299');
  });

  test('shows total career games (285)', async ({ page, playersPage }) => {
    // 145 + 140 = 285
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerBattingCard();
    await playersPage.detail.expectText('285');
  });

  test('shows total career home runs (53)', async ({ page, playersPage }) => {
    // 28 + 25 = 53
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerBattingCard();
    await playersPage.detail.expectText('53');
  });

  test('shows total career RBI (165)', async ({ page, playersPage }) => {
    // 85 + 80 = 165
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerBattingCard();
    await playersPage.detail.expectText('165');
  });

  test('shows total career hits (320)', async ({ page, playersPage }) => {
    // 165 + 155 = 320
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerBattingCard();
    await playersPage.detail.expectText('320');
  });

  test('shows total career stolen bases (22)', async ({
    page,
    playersPage,
  }) => {
    // 12 + 10 = 22
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerBattingCard();
    await playersPage.detail.expectText('22');
  });

  test('shows "Aggregated across 2 seasons" meta under batting card', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText(/Aggregated across 2 seasons/i);
  });
});

// ── Tests: Career Pitching card ───────────────────────────────────────────────

test.describe('Career Summary Cards — pitcher @regression', () => {
  test('career-pitching-card is present for a pitcher', async ({
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

    await playersPage.detail.expectCareerPitchingCard();
  });

  test('shows "Career Pitching" section title', async ({
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

    await playersPage.detail.expectText('Career Pitching');
  });

  test('shows all pitching stat labels — Games, Record, Innings, Strikeouts', async ({
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

    await playersPage.detail.expectCareerPitchingCard();

    await playersPage.detail.expectText('Games');
    await playersPage.detail.expectText('Record');
    await playersPage.detail.expectText('Innings');
    await playersPage.detail.expectText('Strikeouts');
  });

  test('shows total career games pitched (32)', async ({
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

    await playersPage.detail.expectCareerPitchingCard();
    await playersPage.detail.expectText('32');
  });

  test('shows win-loss record (15–5 with em dash)', async ({
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

    await playersPage.detail.expectCareerPitchingCard();
    // Record rendered as "wins–losses" using an em dash (U+2013)
    await playersPage.detail.expectText('15–5');
  });

  test('shows total innings pitched (210.0)', async ({ page, playersPage }) => {
    // inningsPitched 210 → ipToOuts(210) = 630 → outsToBaseballIP(630) = "210.0"
    await setupMocks(page, {
      seasonStatsBody: PITCHER_SEASON_STATS,
      careerArcBody: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerPitchingCard();
    await playersPage.detail.expectText('210.0');
  });

  test('shows total career strikeouts (245)', async ({ page, playersPage }) => {
    await setupMocks(page, {
      seasonStatsBody: PITCHER_SEASON_STATS,
      careerArcBody: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerPitchingCard();
    await playersPage.detail.expectText('245');
  });

  test('shows "Aggregated across 1 season" meta (singular) under pitching card', async ({
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

    await playersPage.detail.expectText(/Aggregated across 1 season[^s]/i);
  });

  test('batting card is absent for a pitcher', async ({
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

    // No batting data → batting card must not render
    await playersPage.detail.expectCareerPitchingCard();
    const battingCard = playersPage.detail.dialog.getByTestId(
      'career-batting-card',
    );
    await battingCard.waitFor({ state: 'hidden' });
  });
});

// ── Tests: Two-way player ─────────────────────────────────────────────────────

test.describe('Career Summary Cards — two-way player @regression', () => {
  test('shows both batting and pitching summary cards for a two-way player', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerBattingCard();
    await playersPage.detail.expectCareerPitchingCard();
  });

  test('batting card shows Ohtani career batting totals (159 G, 54 HR, 130 RBI)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerBattingCard();
    await playersPage.detail.expectText('159');
    await playersPage.detail.expectText('54');
    await playersPage.detail.expectText('130');
  });

  test('pitching card shows Ohtani career pitching totals (23 G, 10–5 record)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerPitchingCard();
    await playersPage.detail.expectText('23');
    // Record: 10 wins – 5 losses (em dash)
    await playersPage.detail.expectText('10–5');
  });
});

// ── Tests: Hidden when no stats ───────────────────────────────────────────────

test.describe('Career Summary Cards — hidden when no stats @regression', () => {
  test('batting card is absent when player has no season data', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: EMPTY_SEASON_STATS,
      careerArcBody: {
        data: {
          player: null,
          arcBatting: [],
          arcPitching: [],
        },
      },
    });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    const battingCard = playersPage.detail.dialog.getByTestId(
      'career-batting-card',
    );
    await battingCard.waitFor({ state: 'hidden' });
  });

  test('pitching card is absent when player has no season data', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: EMPTY_SEASON_STATS,
      careerArcBody: {
        data: {
          player: null,
          arcBatting: [],
          arcPitching: [],
        },
      },
    });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    const pitchingCard = playersPage.detail.dialog.getByTestId(
      'career-pitching-card',
    );
    await pitchingCard.waitFor({ state: 'hidden' });
  });
});
