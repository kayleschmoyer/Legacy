/**
 * E2E Tests: Player Detail – Zero-Flicker Player Switching (LS-5589)
 *
 * Verifies that Apollo's `previousData` strategy prevents blank/loading
 * frames when switching between players. Specifically:
 *   - No loading indicator on direct navigation when mock responds immediately
 *   - Loading indicator IS shown only when no prior data exists and response is slow
 *   - No loading indicator on re-navigation to a previously visited player
 *     (Apollo cache-first: `data` is defined immediately on second mount)
 *   - Correct player data shown after batter → pitcher switch (no stale data)
 *
 * Navigation from stats table → /players/:id uses React Router SPA navigation
 * (`navigate('/players/:id')`), which keeps `PlayerDetailPage` mounted when
 * switching between two /players/:id URLs — `previousData` is preserved.
 * For the cache test, back + re-click re-mounts the component, but Apollo's
 * in-memory cache means `data` resolves synchronously (no network, no spinner).
 *
 * ADR-0015: no `route.continue()`, all mocks use `route.fulfill()`.
 */

import { expect, test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Mock Data ──────────────────────────────────────────────────────────────────

/** Season stats for player 1 (Mike Trout, batter, CF/OF). */
const PLAYER_1_SEASON_STATS = {
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

/** Season stats for player 2 (Walker Buehler, pitcher, SP/RP). */
const PLAYER_2_SEASON_STATS = {
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

/** Career arc for player 1 (batter). */
const PLAYER_1_CAREER_ARC = {
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

/** Career arc for player 2 (pitcher). */
const PLAYER_2_CAREER_ARC = {
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

/** Stats-table response with both players so clicking either name works. */
const TWO_PLAYER_STATS_TABLE = {
  data: {
    careerBattingStats: {
      __typename: 'CareerBattingConnection',
      totalCount: 2,
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
        {
          __typename: 'CareerBattingEdge',
          node: {
            __typename: 'CareerBatting',
            playerId: 2,
            primaryPosition: 'SP',
            positionsPlayed: null,
            games: 32,
            plateAppearances: 0,
            atBats: 0,
            runs: 0,
            hits: 0,
            doubles: 0,
            triples: 0,
            homeRuns: 0,
            rbi: 0,
            stolenBases: 0,
            caughtStealing: 0,
            baseOnBalls: 0,
            strikeouts: 0,
            totalBases: 0,
            groundedIntoDoublePlays: 0,
            hitByPitch: 0,
            sacrificeHits: 0,
            intentionalBaseOnBalls: 0,
            battingAverage: 0,
            onBasePercentage: 0,
            sluggingPercentage: 0,
            offensiveWAR: 0,
            player: {
              __typename: 'Player',
              id: 2,
              firstName: 'Walker',
              lastName: 'Buehler',
              brefId: 'buehwa01',
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
      {
        __typename: 'Player',
        id: 2,
        firstName: 'Walker',
        lastName: 'Buehler',
        brefId: 'buehwa01',
        statsLastFetchedAt: null,
      },
    ],
  },
};

// ── Route Setup ───────────────────────────────────────────────────────────────

interface MockOptions {
  /** Delay (ms) before fulfilling GetAllPlayerSeasonStats for player 1. */
  player1StatsDelay?: number;
  /** Delay (ms) before fulfilling GetAllPlayerSeasonStats for player 2. */
  player2StatsDelay?: number;
}

/**
 * Install per-player-id GraphQL mocks using exact operation name dispatch.
 * Reads `variables.playerId` from the parsed request to serve the correct
 * player data. Falls back to the shared baseline for any other operation.
 */
async function setupSwitchingMocks(
  page: import('@playwright/test').Page,
  opts: MockOptions = {},
) {
  await createGraphQLRouter(page, {
    getplayercareerarc: (route, { variables }) =>
      fulfillJson(
        route,
        (variables.playerId as number) === 2
          ? PLAYER_2_CAREER_ARC
          : PLAYER_1_CAREER_ARC,
      ),

    // Alias used by some older query documents
    careerarcquery: (route, { variables }) =>
      fulfillJson(
        route,
        (variables.playerId as number) === 2
          ? PLAYER_2_CAREER_ARC
          : PLAYER_1_CAREER_ARC,
      ),

    getallplayerseasonstats: async (route, { variables }) => {
      const playerId = variables.playerId as number;
      if (playerId === 1 && opts.player1StatsDelay) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, opts.player1StatsDelay),
        );
      }
      if (playerId === 2 && opts.player2StatsDelay) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, opts.player2StatsDelay),
        );
      }
      await fulfillJson(
        route,
        playerId === 2 ? PLAYER_2_SEASON_STATS : PLAYER_1_SEASON_STATS,
      );
    },

    getcareerbattingstats: (route) =>
      fulfillJson(route, TWO_PLAYER_STATS_TABLE),

    getallplayers: (route) => fulfillJson(route, TWO_PLAYER_STATS_TABLE),

    getplayerswithstats: (route) => fulfillJson(route, TWO_PLAYER_STATS_TABLE),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Player Detail – zero-flicker player switching @regression', () => {
  test('shows player data without blank state on direct navigation', async ({
    page,
    playersPage,
  }) => {
    // Mock responds immediately — data arrives before the component has a
    // chance to render a loading spinner (or `displayData` = previousData holds
    // stale data on SPA re-renders). Either way no loading indicator is shown.
    await setupSwitchingMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();
    await playersPage.detail.expectText('Mike Trout');
  });

  test('shows loading indicator only while data is being fetched @smoke', async ({
    page,
    playersPage,
  }) => {
    // A 300 ms mock delay combined with domcontentloaded means the page shell
    // renders before the GraphQL response arrives, exposing the spinner.
    await setupSwitchingMocks(page, { player1StatsDelay: 300 });
    await playersPage.gotoDetail(1, 'domcontentloaded');

    // Loading indicator must be visible while the slow response is in-flight
    await playersPage.detail.expectLoading();

    // Once the mock responds the spinner must clear and data must appear
    await playersPage.detail.expectNotLoading();
    await playersPage.detail.expectText('Mike Trout');
  });

  test('no loading indicator on re-navigation to a previously visited player', async ({
    page,
    playersPage,
  }) => {
    // Apollo stores the GetAllPlayerSeasonStats response for playerId=1 in its
    // in-memory cache after the first visit. On the second mount of
    // PlayerDetailPage for the same id, `data` is defined synchronously —
    // `loading && !displayData` is false from the first render.
    await setupSwitchingMocks(page);

    // First visit: full data load via SPA navigation from the stats table.
    // expectNotLoading() + expectText() confirm the dialog is open and data is
    // loaded before close() is called — this primes the Apollo in-memory cache.
    await playersPage.gotoStats();
    await playersPage.stats.openPlayerByName('Trout');
    await playersPage.detail.expectNotLoading();
    await playersPage.detail.expectText('Mike Trout');

    // Close modal to return to stats, then re-open the same player.
    // back() targets the "← Back" button which only exists on the direct-URL
    // route; close() is the correct method when entering via the stats table.
    await playersPage.detail.close();
    await playersPage.detail.expectClosed();
    await playersPage.stats.openPlayerByName('Trout');

    // Second visit: cache hit — loading indicator must never appear
    await playersPage.detail.expectNotLoading();
    await playersPage.detail.expectText('Mike Trout');
  });

  test('shows correct player data after switching from batter to pitcher', async ({
    page,
    playersPage,
  }) => {
    // Open player 1 (batter) then switch to player 2 (pitcher) via the stats
    // table. Batting hero labels (AVG, HR, RBI) must be replaced by pitching
    // labels (Strikeouts, Innings Pitched). Trout's name must not be visible.
    await setupSwitchingMocks(page);

    // Navigate to player 1 (batter)
    await playersPage.gotoStats();
    await playersPage.stats.openPlayerByName('Trout');
    await playersPage.detail.expectNotLoading();
    await playersPage.detail.expectText('Mike Trout');
    await playersPage.detail.expectText('AVG');
    await playersPage.detail.expectCareerBattingCard();

    // Close modal to return to stats, then open player 2 (pitcher).
    // back() targets the "← Back" button which only exists on the direct-URL
    // route; close() is the correct method when entering via the stats table.
    await playersPage.detail.close();
    await playersPage.detail.expectClosed();
    await playersPage.stats.openPlayerByName('Buehler');
    await playersPage.detail.expectNotLoading();

    // Pitcher data must be shown
    await playersPage.detail.expectText('Walker Buehler');
    await playersPage.detail.expectText('Strikeouts');
    await playersPage.detail.expectCareerPitchingCard();

    // Stale batter name must no longer be visible in the modal
    await playersPage.detail.expectTextAbsent('Mike Trout');
  });
});
