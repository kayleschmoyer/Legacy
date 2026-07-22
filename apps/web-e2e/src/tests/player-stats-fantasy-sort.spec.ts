/**
 * MLB Player Stats — sortable fantasy points columns (LS-8569)
 *
 * Batting and pitching default fantasy scoring is a linear combination of
 * stored career columns, so — unlike football's display-only FPTS — both MLB
 * grids expose a real, sortable FPTS/FPTS-G pair leading their stat columns
 * (parity with LS-8566's NFL grid).
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/pages';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const MOCK_PAGE_INFO = {
  __typename: 'PageInfo',
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

const BONDS_BATTING = {
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
  fantasyPoints: 11267.5,
  fantasyPointsPerGame: 3.77,
  player: {
    __typename: 'Player',
    id: 101,
    firstName: 'Barry',
    lastName: 'Bonds',
    brefId: 'bondsba01',
  },
};

const CLEMENS_PITCHING = {
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
  fantasyPoints: 3874,
  fantasyPointsPerGame: 5.46,
  player: {
    __typename: 'Player',
    id: 201,
    firstName: 'Roger',
    lastName: 'Clemens',
  },
};

async function mockPlayerStatsGraphQL(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('"getcareerbattingstats"')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            careerBattingStats: {
              __typename: 'CareerBattingConnection',
              totalCount: 1,
              edges: [{ __typename: 'CareerBattingEdge', node: BONDS_BATTING }],
              pageInfo: MOCK_PAGE_INFO,
            },
          },
        }),
      });
    } else if (postData.includes('"getcareerpitchingstatscount"')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { careerPitchingStatsCount: 1 } }),
      });
    } else if (postData.includes('"getcareerpitchingstats"')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { careerPitchingStats: [CLEMENS_PITCHING] },
        }),
      });
    } else if (
      postData.includes('"getusers"') ||
      postData.includes('"getuserleagues"')
    ) {
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

/**
 * Promise for the next GraphQL request whose parsed body matches `predicate`.
 * Create BEFORE the triggering action (goto / click).
 */
function waitForRequestVariables(
  page: import('@playwright/test').Page,
  operationName: string,
  predicate: (variables: Record<string, unknown>) => boolean = () => true,
): Promise<Record<string, unknown>> {
  return page
    .waitForRequest((request) => {
      if (!request.url().includes('/graphql')) return false;
      const postData = request.postData();
      if (!postData) return false;
      try {
        const parsed = JSON.parse(postData) as {
          operationName?: string;
          variables?: Record<string, unknown>;
        };
        return (
          parsed.operationName === operationName &&
          predicate(parsed.variables ?? {})
        );
      } catch {
        return false;
      }
    })
    .then((request) => {
      const parsed = JSON.parse(request.postData() ?? '{}') as {
        variables?: Record<string, unknown>;
      };
      return parsed.variables ?? {};
    });
}

test.describe('Player Stats Page — FPTS/FPTS-G columns (LS-8569) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayerStatsGraphQL(page);
  });

  test('batting grid renders sortable FPTS and FPTS/G column headers', async ({
    page,
    playersPage,
  }) => {
    await playersPage.gotoStats();
    await playersPage.stats.switchView('Hitters');
    await playersPage.stats.expectColumnHeader('FPTS');
    await playersPage.stats.expectColumnHeader('FPTS/G');
    await expect(page.getByTestId('player-row-101')).toContainText('11268');
  });

  test('clicking the batting FPTS header commits orderBy totalScore desc and persists it to the URL', async ({
    page,
    playersPage,
  }) => {
    await playersPage.gotoStats();
    await playersPage.stats.switchView('Hitters');

    const sortRequest = waitForRequestVariables(
      page,
      'GetCareerBattingStats',
      (v) => v.orderBy === 'totalScore',
    );
    await playersPage.stats.clickColumnHeader('FPTS');

    const variables = await sortRequest;
    expect(variables.orderDirection).toBe('desc');
    await expect(page).toHaveURL(/sortBy=totalScore/);
    await expect(page).toHaveURL(/sortDir=desc/);
  });

  test('clicking the batting FPTS/G header commits orderBy avgPointsPerGame desc', async ({
    page,
    playersPage,
  }) => {
    await playersPage.gotoStats();
    await playersPage.stats.switchView('Hitters');

    const sortRequest = waitForRequestVariables(
      page,
      'GetCareerBattingStats',
      (v) => v.orderBy === 'avgPointsPerGame',
    );
    await playersPage.stats.clickColumnHeader('FPTS/G');

    const variables = await sortRequest;
    expect(variables.orderDirection).toBe('desc');
    await expect(page).toHaveURL(/sortBy=avgPointsPerGame/);
  });

  test('pitching grid renders sortable FPTS and FPTS/G column headers', async ({
    playersPage,
  }) => {
    await playersPage.gotoStats();
    await playersPage.stats.switchView('Pitchers');
    await playersPage.stats.expectColumnHeader('FPTS');
    await playersPage.stats.expectColumnHeader('FPTS/G');
    await playersPage.stats.expectText('3874');
  });

  test('clicking the pitching FPTS header commits a new orderBy=fantasyPoints request', async ({
    page,
    playersPage,
  }) => {
    await playersPage.gotoStats();
    await playersPage.stats.switchView('Pitchers');

    const sortRequest = waitForRequestVariables(
      page,
      'GetCareerPitchingStats',
      (v) => v.orderBy === 'fantasyPoints',
    );
    await playersPage.stats.clickColumnHeader('FPTS');

    const variables = await sortRequest;
    expect(variables.orderDirection).toBe('desc');
  });
});
