/**
 * Player Stats Page — Narrow-Viewport Card Feed (LS-9075)
 *
 * /players/stats now renders PlayersCardFeed at phone width instead of the
 * desktop table (previously web never imported PlayersCardFeed at all — its
 * only consumer was the native Players tab). Covers the AC directly: cards
 * at phone width, table at desktop width, same GraphQL data source either
 * way (LS-9073 already repointed the card feed at the same
 * `getCareerBattingStats` query the desktop table uses).
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

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

async function mockPlayerStatsGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();

    if (operation === 'getcareerbattingstats') {
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
    } else if (operation === 'getcareerpitchingstatscount') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { careerPitchingStatsCount: 0 } }),
      });
    } else if (operation === 'getcareerpitchingstats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { careerPitchingStats: [] } }),
      });
    } else if (operation === 'getuserleagues') {
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

test.describe('Player Stats Page — narrow-viewport card feed (LS-9075) @regression', () => {
  test('renders the card feed (not the table) at phone width', async ({
    page,
    playersPage,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await mockPlayerStatsGraphQL(page);
    await playersPage.gotoStats();

    await playersPage.stats.expectCardFeedVisible('mlb');
    await playersPage.stats.expectPlayerVisible('Barry Bonds');
  });

  test('renders the table (not the card feed) at desktop width', async ({
    page,
    playersPage,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await mockPlayerStatsGraphQL(page);
    await playersPage.gotoStats();

    await playersPage.stats.expectLoaded();
    await playersPage.stats.expectCardFeedHidden('mlb');
  });

  test('switches from table to card feed when the viewport narrows mid-session', async ({
    page,
    playersPage,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await mockPlayerStatsGraphQL(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectLoaded();

    await page.setViewportSize(MOBILE_VIEWPORT);
    await playersPage.stats.expectCardFeedVisible('mlb');
  });

  test('preserves the sport param when opening a player from the card feed', async ({
    page,
    playersPage,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await mockPlayerStatsGraphQL(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectCardFeedVisible('mlb');

    await playersPage.stats.openPlayerByName('Barry Bonds');
    await expect(page).toHaveURL(/[?&]playerId=101/);
  });
});
