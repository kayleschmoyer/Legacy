/**
 * E2E Tests: Player Switch Performance Budget (LS-6994)
 *
 * Asserts that switching between player detail modals meets a render
 * time budget:
 *
 *   - Cold switch  (first load, Apollo cache miss): < 2 000 ms
 *   - Cached switch (same player revisited, Apollo cache hit): < 2 000 ms
 *
 * Elapsed time is measured in the Node.js test process with `Date.now()`.
 * Using `performance.now()` stored on `window` is not viable across a full
 * page navigation — the JS context is replaced by `page.goto()`, so any value
 * written to `window` before the call is gone when the new document loads.
 *
 * All GraphQL traffic is fulfilled hermetically; no real network calls are
 * made (ADR-0015 §6). Uses `route.fulfill()` exclusively — no `route.continue()`.
 */

import { expect, test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import type { PlayersPage } from '../pages';

// ── Mock Data ──────────────────────────────────────────────────────────────────

const TROUT_STATS = {
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

const JUDGE_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['RF', 'OF'],
      firstName: 'Aaron',
      lastName: 'Judge',
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 2024,
        team: 'NYY',
        games: 158,
        plateAppearances: 680,
        atBats: 570,
        runs: 122,
        hits: 181,
        doubles: 28,
        triples: 1,
        homeRuns: 58,
        rbi: 144,
        stolenBases: 10,
        caughtStealing: 2,
        baseOnBalls: 100,
        strikeouts: 175,
        battingAverage: 0.317,
        onBasePercentage: 0.422,
        sluggingPercentage: 0.701,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
};

const TROUT_CAREER_ARC = {
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
    ],
    arcPitching: [],
  },
};

const JUDGE_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Aaron',
      lastName: 'Judge',
      eligiblePositions: ['RF', 'OF'],
      careerAchievements: {
        allStarSelections: 7,
        goldGloves: 3,
        silverSluggers: 5,
        mvpAwards: 2,
        cyYoungAwards: 0,
        hallOfFame: false,
        rookieOfTheYear: false,
      },
    },
    arcBatting: [
      {
        season: 2024,
        team: 'NYY',
        games: 158,
        hits: 181,
        atBats: 570,
        homeRuns: 58,
        rbi: 144,
        stolenBases: 10,
        battingAverage: 0.317,
        onBasePercentage: 0.422,
        sluggingPercentage: 0.701,
        onBasePlusSlugging: 1.123,
        onBasePlusSluggingPlus: 208,
        awardSummary: null,
      },
    ],
    arcPitching: [],
  },
};

const PLAYER_LIST_RESPONSE = {
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
            primaryPosition: 'RF',
            positionsPlayed: null,
            games: 1100,
            plateAppearances: 4800,
            atBats: 4000,
            runs: 850,
            hits: 1300,
            doubles: 250,
            triples: 15,
            homeRuns: 400,
            rbi: 950,
            stolenBases: 50,
            caughtStealing: 15,
            baseOnBalls: 700,
            strikeouts: 1100,
            totalBases: 2900,
            groundedIntoDoublePlays: 60,
            hitByPitch: 40,
            sacrificeHits: 2,
            intentionalBaseOnBalls: 150,
            battingAverage: 0.284,
            onBasePercentage: 0.39,
            sluggingPercentage: 0.575,
            offensiveWAR: 65.2,
            player: {
              __typename: 'Player',
              id: 2,
              firstName: 'Aaron',
              lastName: 'Judge',
              brefId: 'judgeaa01',
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
        firstName: 'Aaron',
        lastName: 'Judge',
        brefId: 'judgeaa01',
        statsLastFetchedAt: null,
      },
    ],
  },
};

// ── Route Setup ───────────────────────────────────────────────────────────────

async function setupMocks(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    getplayercareerarc: (route, { variables }) => {
      const playerId =
        typeof variables['playerId'] === 'number'
          ? variables['playerId']
          : undefined;
      return fulfillJson(
        route,
        playerId === 2 ? JUDGE_CAREER_ARC : TROUT_CAREER_ARC,
      );
    },
    careerarcquery: (route, { variables }) => {
      const playerId =
        typeof variables['playerId'] === 'number'
          ? variables['playerId']
          : undefined;
      return fulfillJson(
        route,
        playerId === 2 ? JUDGE_CAREER_ARC : TROUT_CAREER_ARC,
      );
    },
    getallplayerseasonstats: (route, { variables }) => {
      const playerId =
        typeof variables['playerId'] === 'number'
          ? variables['playerId']
          : undefined;
      return fulfillJson(route, playerId === 2 ? JUDGE_STATS : TROUT_STATS);
    },
    getcareerbattingstats: (route) => fulfillJson(route, PLAYER_LIST_RESPONSE),
    getallplayers: (route) => fulfillJson(route, PLAYER_LIST_RESPONSE),
    getplayerswithstats: (route) => fulfillJson(route, PLAYER_LIST_RESPONSE),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Navigate to a player detail route and measure the elapsed time (in ms) from
 * the moment navigation is initiated until the player name is visible in the
 * modal. Timing is measured in the Node.js process with `Date.now()`.
 */
async function measureSwitchMs(
  page: import('@playwright/test').Page,
  playersPage: PlayersPage,
  playerId: number,
  expectedName: string,
): Promise<number> {
  const startMs = Date.now();
  await page.goto(`/players/${playerId}`, { waitUntil: 'commit' });
  await playersPage.detail.waitForPlayerName(expectedName);
  return Date.now() - startMs;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Player Switch Performance Budget @performance', () => {
  test('cold player switch renders within 2000 ms budget', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);

    // Warm up the page at /players/stats so the app shell is ready.
    await playersPage.gotoStats();

    // Cold switch — player 1 (Mike Trout) has never been visited; Apollo cache
    // is empty for this player's data.
    const coldMs = await measureSwitchMs(page, playersPage, 1, 'Mike Trout');

    // Fail loudly with the actual value so regressions are easy to diagnose.
    expect(
      coldMs,
      `Cold player-switch took ${coldMs.toFixed(1)} ms — budget is 2000 ms`,
    ).toBeLessThan(2000);
  });

  test('cached player switch renders within 2000 ms budget', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);

    // Warm the app shell.
    await playersPage.gotoStats();

    // Prime the Apollo cache by visiting player 1, then player 2.
    await measureSwitchMs(page, playersPage, 1, 'Mike Trout');
    await measureSwitchMs(page, playersPage, 2, 'Aaron Judge');

    // Cached switch — navigate back to player 1 whose data is now in the
    // Apollo in-memory cache; no GraphQL round-trip should be needed.
    const cachedMs = await measureSwitchMs(page, playersPage, 1, 'Mike Trout');

    expect(
      cachedMs,
      `Cached player-switch took ${cachedMs.toFixed(1)} ms — budget is 2000 ms`,
    ).toBeLessThan(2000);
  });
});
