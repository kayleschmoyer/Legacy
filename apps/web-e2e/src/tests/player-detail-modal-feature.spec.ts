/**
 * E2E Tests: Player Detail Modal — Core Feature (LS-5585)
 *
 * Covers the "Feature: Player Detail Modal" QA story (child of LS-5287):
 *   - Modal auto-opens when navigating to /players/:id
 *   - Player header renders name, seasons count, and position badge
 *   - Close (×) button dismisses the modal and returns to /players/stats
 *   - Escape key dismisses the modal and returns to /players/stats
 *   - Loading spinner is visible while season stats resolve
 *   - Error state is visible when the stats query fails
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Mock Data ──────────────────────────────────────────────────────────────────

/** Two-season batter response — drives name, eyebrow text, and position band. */
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

/** Career arc with matching batter data — so arc queries resolve cleanly. */
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

/** Minimal player-list fallback so GetAllPlayers / GetCareerBattingStats resolve. */
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

interface SetupOpts {
  seasonStatsBody?: object;
  careerArcBody?: object;
  seasonStatsDelay?: number;
}

async function setupMocks(
  page: import('@playwright/test').Page,
  opts: SetupOpts = {},
) {
  const {
    seasonStatsBody = BATTER_SEASON_STATS,
    careerArcBody = BATTER_CAREER_ARC,
    seasonStatsDelay,
  } = opts;

  await createGraphQLRouter(page, {
    getplayercareerarc: (route) => fulfillJson(route, careerArcBody),
    careerarcquery: (route) => fulfillJson(route, careerArcBody),
    getallplayerseasonstats: async (route) => {
      if (seasonStatsDelay) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, seasonStatsDelay),
        );
      }
      await fulfillJson(route, seasonStatsBody);
    },
    getcareerbattingstats: (route) => fulfillJson(route, PLAYER_LIST_RESPONSE),
    getallplayers: (route) => fulfillJson(route, PLAYER_LIST_RESPONSE),
    getplayerswithstats: (route) => fulfillJson(route, PLAYER_LIST_RESPONSE),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Player Detail Modal — Auto-open @regression', () => {
  test('modal opens automatically when navigating to /players/:id', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
  });
});

test.describe('Player Detail Modal — Player Header @regression', () => {
  test('shows the player name in the modal header', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Name is resolved from firstName + lastName returned by the stats query.
    await playersPage.detail.expectText('Mike Trout');
  });

  test('shows seasons count in the eyebrow text', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Eyebrow format: "Player · 2 Seasons · 2023–2024"
    await playersPage.detail.expectText(/2 season/i);
  });

  test('shows year range in the eyebrow text', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Range covers the min and max season years from the stats response.
    await playersPage.detail.expectText(/2023/);
    await playersPage.detail.expectText(/2024/);
  });

  test('shows eligible position badges in the positions band', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectEligiblePositions();
    await playersPage.detail.expectText('CF', { exact: true });
    await playersPage.detail.expectText('OF', { exact: true });
  });

  test('shows player initials in the avatar', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Initials derived from "Mike Trout" → "MT"
    await playersPage.detail.expectText('MT', { exact: true });
  });
});

test.describe('Player Detail Modal — Dismiss @regression', () => {
  test('Close (×) button dismisses the modal and navigates to /players/stats', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.close();

    await playersPage.detail.waitForStatsList();
    await playersPage.detail.expectClosed();
  });

  test('Escape key dismisses the modal and navigates to /players/stats', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.pressEscape();

    await playersPage.detail.waitForStatsList();
    await playersPage.detail.expectClosed();
  });

  test('back button navigates to /players/stats and shows the stats heading', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectBackButton();
    await playersPage.detail.back();

    await playersPage.detail.waitForStatsList();
    // expectStatsSurfaceVisible (LS-9712) resolves the desktop table vs. the
    // phone-width card feed by the actual viewport, unlike a hardcoded
    // desktop-only "MLB Player Statistics" text check (LS-9075/LS-9326).
    await playersPage.stats.expectStatsSurfaceVisible();
  });
});

test.describe('Player Detail Modal — Loading State @regression', () => {
  test('shows a loading spinner while season stats are fetching', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { seasonStatsDelay: 1500 });
    await playersPage.gotoDetail(1, 'domcontentloaded');

    await playersPage.detail.expectLoading();
  });

  test('hides the loading spinner once stats have resolved', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { seasonStatsDelay: 1500 });
    await playersPage.gotoDetail(1, 'domcontentloaded');

    // First the spinner is visible…
    await playersPage.detail.expectLoading();
    // …then it clears when data arrives.
    await playersPage.detail.expectNotLoading();
  });
});

test.describe('Player Detail Modal — Error State @regression', () => {
  test('shows an error state when the season stats query returns errors', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: {
        errors: [{ message: 'Internal server error' }],
      },
    });
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();
    await playersPage.detail.expectErrorState();
  });

  test('error state suppresses position badges and career stat cards', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: {
        errors: [{ message: 'Internal server error' }],
      },
    });
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectErrorState();

    await playersPage.detail.expectEligiblePositionsNotVisible();
    await playersPage.detail.expectCareerBattingCardNotVisible();
  });
});

// ── Tests: Mid-year trade (duplicate season) ──────────────────────────────────

/** Player traded mid-season: two batting rows for the same year, different teams. */
const TRADE_SEASON_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['1B'],
      firstName: 'Traded',
      lastName: 'Player',
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 2023,
        team: 'NYY',
        games: 80,
        plateAppearances: 330,
        atBats: 290,
        runs: 45,
        hits: 80,
        doubles: 15,
        triples: 1,
        homeRuns: 12,
        rbi: 38,
        stolenBases: 2,
        caughtStealing: 1,
        baseOnBalls: 38,
        strikeouts: 70,
        battingAverage: 0.276,
        onBasePercentage: 0.36,
        sluggingPercentage: 0.455,
      },
      {
        __typename: 'SeasonBatting',
        season: 2023,
        team: 'LAD',
        games: 60,
        plateAppearances: 240,
        atBats: 210,
        runs: 32,
        hits: 55,
        doubles: 10,
        triples: 0,
        homeRuns: 8,
        rbi: 25,
        stolenBases: 1,
        caughtStealing: 0,
        baseOnBalls: 28,
        strikeouts: 50,
        battingAverage: 0.262,
        onBasePercentage: 0.345,
        sluggingPercentage: 0.41,
      },
      {
        __typename: 'SeasonBatting',
        season: 2024,
        team: 'LAD',
        games: 150,
        plateAppearances: 620,
        atBats: 545,
        runs: 88,
        hits: 158,
        doubles: 30,
        triples: 2,
        homeRuns: 25,
        rbi: 80,
        stolenBases: 5,
        caughtStealing: 2,
        baseOnBalls: 68,
        strikeouts: 120,
        battingAverage: 0.29,
        onBasePercentage: 0.37,
        sluggingPercentage: 0.48,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
};

const TRADE_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Traded',
      lastName: 'Player',
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
    playerSeasonBatting: [
      {
        season: 2023,
        team: 'NYY',
        games: 80,
        hits: 80,
        atBats: 290,
        homeRuns: 12,
        rbi: 38,
        stolenBases: 2,
        battingAverage: 0.276,
        onBasePercentage: 0.36,
        sluggingPercentage: 0.455,
        onBasePlusSlugging: 0.815,
        onBasePlusSluggingPlus: 115,
        awardSummary: null,
      },
    ],
    playerSeasonPitching: [],
  },
};

test.describe('Player Detail Modal — Mid-year trade (LS-6984) @regression', () => {
  test('two batting rows for the same season with different teams are shown as separate rows', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TRADE_SEASON_STATS,
      careerArcBody: TRADE_CAREER_ARC,
    });
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Batting');

    // Both trade legs must appear as distinct rows
    await playersPage.detail.expectText('2023 NYY');
    await playersPage.detail.expectText('2023 LAD');
    // The other season is also present
    await playersPage.detail.expectText('2024 LAD');
  });

  test('seasons count in eyebrow text counts unique years, not team-rows', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TRADE_SEASON_STATS,
      careerArcBody: TRADE_CAREER_ARC,
    });
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Three batting rows (NYY-2023, LAD-2023, LAD-2024) but only 2 unique seasons
    await playersPage.detail.expectText('2 Season');
  });
});
