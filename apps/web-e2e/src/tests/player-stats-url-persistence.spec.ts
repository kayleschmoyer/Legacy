/**
 * Player Stats — URL-Persisted Filter State (LS-5600)
 *
 * Hermetic E2E tests for the URL-persisted filter state feature on /players/stats.
 * All GraphQL requests are intercepted so tests run without a live backend.
 *
 * Coverage: view-mode restoration from ?view=, search-term restoration from
 * ?searchTerm=, URL update after tab switch, and the full round-trip
 * (apply filter → capture URL → reload → assert state restored).
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const MOCK_PAGE_INFO = {
  __typename: 'PageInfo',
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

const MOCK_BATTING_EDGES = [
  {
    __typename: 'CareerBattingEdge',
    node: {
      __typename: 'CareerBatting',
      playerId: 101,
      primaryPosition: 'LF',
      positionsPlayed: 'LF,RF',
      games: 2986,
      plateAppearances: 12606,
      atBats: 9847,
      runs: 2227,
      hits: 2935,
      doubles: 601,
      triples: 77,
      homeRuns: 762,
      rbi: 1996,
      stolenBases: 514,
      caughtStealing: 141,
      baseOnBalls: 2558,
      strikeouts: 1539,
      totalBases: 5976,
      groundedIntoDoublePlays: 144,
      hitByPitch: 95,
      sacrificeHits: 24,
      intentionalBaseOnBalls: 688,
      battingAverage: 0.298,
      onBasePercentage: 0.444,
      sluggingPercentage: 0.607,
      offensiveWAR: 162.8,
      player: {
        __typename: 'Player',
        id: 101,
        firstName: 'Barry',
        lastName: 'Bonds',
        brefId: 'bondsba01',
      },
    },
  },
];

const MOCK_PITCHING_STATS = [
  {
    __typename: 'CareerPitching',
    playerId: 201,
    wins: 354,
    losses: 184,
    games: 709,
    gamesStarted: 707,
    gamesFinished: 1,
    completeGames: 100,
    shutouts: 46,
    saves: 0,
    hits: 4672,
    runs: 1940,
    earnedRuns: 1770,
    homeRuns: 363,
    baseOnBalls: 1580,
    intentionalBaseOnBalls: 79,
    strikeouts: 4672,
    hitByPitch: 158,
    balks: 8,
    wildPitches: 153,
    battersFaced: 20016,
    outsRecorded: 13095,
    outRate: null,
    era: '3.19',
    winPercentage: 0.658,
    player: {
      __typename: 'Player',
      id: 201,
      firstName: 'Roger',
      lastName: 'Clemens',
    },
  },
];

async function mockPlayerStatsGraphQL(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route) => {
    const opName = extractOperationName(route).toLowerCase();

    if (opName === 'getcareerbattingstats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            careerBattingStats: {
              __typename: 'CareerBattingConnection',
              totalCount: 1,
              edges: MOCK_BATTING_EDGES,
              pageInfo: MOCK_PAGE_INFO,
            },
          },
        }),
      });
    } else if (opName === 'getcareerpitchingstatscount') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { careerPitchingStatsCount: 1 } }),
      });
    } else if (opName === 'getcareerpitchingstats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { careerPitchingStats: MOCK_PITCHING_STATS },
        }),
      });
    } else if (opName === 'getusers' || opName === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('Player Stats — URL-persisted filter state @regression', () => {
  test('restores Hitters view mode from ?view=hitters', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page);
    await page.goto('/players/stats?v=1&view=hitters');
    await page.waitForLoadState('load');

    await playersPage.stats.expectLoaded();
    await playersPage.stats.expectTabSelected('Hitters');
  });

  test('restores Pitchers view mode from ?view=pitchers', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page);
    await page.goto('/players/stats?v=1&view=pitchers');
    await page.waitForLoadState('load');

    await playersPage.stats.expectLoaded();
    await playersPage.stats.expectTabSelected('Pitchers');
  });

  test('defaults to Combined view when no view param present', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page);
    await page.goto('/players/stats');
    await page.waitForLoadState('load');

    await playersPage.stats.expectLoaded();
    await playersPage.stats.expectTabSelected('Combined');
  });

  test('restores search term from ?searchTerm param', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page);
    await page.goto('/players/stats?v=1&searchTerm=Bond');
    await page.waitForLoadState('load');

    await playersPage.stats.expectLoaded();
    await expect(
      page.getByPlaceholder('Search player name · min 2 chars'),
    ).toHaveValue('Bond');
  });

  test('URL updates when switching from Combined to Hitters', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page);
    await playersPage.gotoStats();

    await playersPage.stats.expectLoaded();
    await playersPage.stats.switchView('Hitters');

    await expect(page).toHaveURL(/view=hitters/);
  });

  test('URL round-trip: switch view, reload, assert tab is restored', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page);
    await playersPage.gotoStats();

    await playersPage.stats.expectLoaded();
    await playersPage.stats.switchView('Hitters');
    await expect(page).toHaveURL(/view=hitters/);

    const url = page.url();
    await page.goto(url);
    await page.waitForLoadState('load');

    await playersPage.stats.expectLoaded();
    await playersPage.stats.expectTabSelected('Hitters');
  });

  test('legacy unversioned URL is migrated and rendered correctly', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page);
    await page.goto('/players/stats?view=hitters');
    await page.waitForLoadState('load');

    await playersPage.stats.expectLoaded();
    await playersPage.stats.expectTabSelected('Hitters');
  });
});
