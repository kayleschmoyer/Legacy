/**
 * E2E Tests: Player Detail – Back Navigation with URL Fallback (LS-5578)
 *
 * Covers the two back-navigation paths on the player-detail route:
 *
 *  1. URL fallback  — page opened directly via `/players/:id`
 *     (location.key === 'default'): back button falls back to /players/stats.
 *  2. In-app path   — page reached by clicking a player row from /players/stats
 *     (location.key !== 'default'): back button calls navigate(-1) and returns
 *     to the previous history entry (/players/stats).
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { tierUserByIdResponse } from '../fixtures/shared-mocks';

// ── Mock Data ──────────────────────────────────────────────────────────────────

/** Minimal season stats for a batter (Mike Trout, player id 1). */
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
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
};

/** Minimal career arc response (batter). */
const CAREER_ARC_RESPONSE = {
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

/** Minimal stats-table response — one row so the player name is clickable. */
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

// ── Mock Setup ─────────────────────────────────────────────────────────────────

/**
 * Wire up GraphQL mocks for both the stats-table and player-detail routes.
 * Covers all queries that fire when starting on /players/stats and navigating
 * in-app to /players/:id.
 */
async function setupMocks(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    // Resolve premium immediately so PremiumGate doesn't intercept clicks
    // before getuserbyid cascades through the _apiIsolation fallback chain.
    getuserbyid: (route) => fulfillJson(route, tierUserByIdResponse('premium')),
    getplayercareerarc: (route) => fulfillJson(route, CAREER_ARC_RESPONSE),
    careerarcquery: (route) => fulfillJson(route, CAREER_ARC_RESPONSE),
    getallplayerseasonstats: (route) =>
      fulfillJson(route, SEASON_STATS_RESPONSE),
    getcareerbattingstats: (route) => fulfillJson(route, STATS_TABLE_RESPONSE),
    getallplayers: (route) => fulfillJson(route, STATS_TABLE_RESPONSE),
    getplayerswithstats: (route) => fulfillJson(route, STATS_TABLE_RESPONSE),
  });
}

// ── Tests: URL fallback (location.key === 'default') ──────────────────────────

test.describe('Player Detail – back navigation: URL fallback @regression', () => {
  test('back button is visible when page is opened directly via URL', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    // Direct URL navigation sets location.key === 'default'
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectBackButton();
  });

  test('back button navigates to /players/stats when page is opened directly via URL', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    // Direct URL navigation sets location.key === 'default', triggering the
    // /players/stats fallback instead of navigate(-1)
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectBackButton();

    await playersPage.detail.back();

    await playersPage.detail.waitForStatsList();
  });
});

// ── Tests: In-app navigation (navigate(-1) path) ──────────────────────────────

test.describe('Player Detail – back navigation: in-app path @regression', () => {
  test('back button is visible after navigating in-app from the stats list', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoStats();

    // Ensure the stats table rendered at least one player row
    await playersPage.stats.expectPlayerVisible('Trout');

    // Wait for the PremiumGate overlay to clear before clicking. The gate
    // renders pointerEvents="none" on the table while getuserbyid is still
    // in-flight; clicking before isPremium=true lands on the upgrade-CTA
    // overlay instead of the row handler, opening UpgradeModal rather than
    // navigating to /players/:id.
    await playersPage.premiumGate.expectAbsent();

    // In-app click: openPlayerByName clicks the player name text inside the row,
    // which bubbles to the Tamagui XStack onPress handler → navigate('/players/1')
    // → location.key !== 'default'
    await playersPage.stats.openPlayerByName('Trout');
    await playersPage.detail.expectOpen();

    await playersPage.detail.expectBackButton();
  });

  test('back button returns to /players/stats after in-app navigation from the stats list', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoStats();

    await playersPage.stats.expectPlayerVisible('Trout');

    // Wait for PremiumGate to clear (same race condition as the test above).
    await playersPage.premiumGate.expectAbsent();

    // In-app click sets location.key !== 'default', so back uses navigate(-1)
    await playersPage.stats.openPlayerByName('Trout');
    await playersPage.detail.expectOpen();

    await playersPage.detail.expectBackButton();

    await playersPage.detail.back();

    // navigate(-1) returns to the previous history entry (/players/stats)
    await playersPage.detail.waitForStatsList();
    await playersPage.stats.expectText(/MLB Player Statistics/i);
  });
});
