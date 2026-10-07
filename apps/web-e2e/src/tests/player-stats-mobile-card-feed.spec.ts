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

/** Season-stats/career-arc data backing the player-detail modal (LS-5581) —
 *  needed once a card-feed test actually opens the modal rather than only
 *  checking the URL param changed. */
const SEASON_STATS_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['LF'],
      firstName: 'Barry',
      lastName: 'Bonds',
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 2001,
        team: 'SFG',
        games: 153,
        plateAppearances: 664,
        atBats: 476,
        runs: 129,
        hits: 156,
        doubles: 32,
        triples: 2,
        homeRuns: 73,
        rbi: 137,
        stolenBases: 13,
        caughtStealing: 3,
        baseOnBalls: 177,
        strikeouts: 93,
        battingAverage: 0.328,
        onBasePercentage: 0.515,
        sluggingPercentage: 0.863,
      },
    ],
  },
};

const CAREER_ARC_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Barry',
      lastName: 'Bonds',
      eligiblePositions: ['LF'],
      careerAchievements: {
        allStarSelections: 14,
        goldGloves: 8,
        silverSluggers: 12,
        mvpAwards: 7,
        cyYoungAwards: 0,
        hallOfFame: false,
        rookieOfTheYear: false,
      },
    },
    playerSeasonBatting: [
      {
        season: 2001,
        team: 'SFG',
        games: 153,
        hits: 156,
        atBats: 476,
        homeRuns: 73,
        rbi: 137,
        stolenBases: 13,
        battingAverage: 0.328,
        onBasePercentage: 0.515,
        sluggingPercentage: 0.863,
        onBasePlusSlugging: 1.378,
      },
    ],
  },
};

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
    } else if (operation === 'getallplayerseasonstats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SEASON_STATS_RESPONSE),
      });
    } else if (operation === 'getplayercareerarc') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CAREER_ARC_RESPONSE),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

const FEED_PAGE_SIZE = 25;
const FEED_TOTAL = 50;

/** One synthetic career-batting edge for the paged card-feed fixture. */
function pagedBattingEdge(n: number) {
  const base = MOCK_BATTING_EDGES[0].node;
  return {
    __typename: 'CareerBattingEdge',
    node: {
      ...base,
      playerId: 1000 + n,
      player: {
        ...base.player,
        id: 1000 + n,
        firstName: 'Feed',
        lastName: `Player ${n}`,
      },
    },
  };
}

/**
 * Two-page `getCareerBattingStats` mock (LS-10682): the first request (no
 * `after`) returns players 1–25 with `hasNextPage: true`, the follow-up
 * (`after: 'cursor-25'`) returns 26–50 and ends the connection. Every other
 * operation falls through to {@link mockPlayerStatsGraphQL}'s handlers.
 */
async function mockPagedCareerBattingStats(
  page: import('@playwright/test').Page,
) {
  await mockPlayerStatsGraphQL(page);
  await page.route(isGraphQLEndpoint, async (route) => {
    if (extractOperationName(route).toLowerCase() !== 'getcareerbattingstats') {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as {
      variables?: { after?: string | null };
    } | null;
    const variables = body?.variables ?? {};
    const start =
      variables.after === `cursor-${FEED_PAGE_SIZE}` ? 1 + FEED_PAGE_SIZE : 1;
    const end = Math.min(start + FEED_PAGE_SIZE - 1, FEED_TOTAL);
    const edges = [];
    for (let n = start; n <= end; n += 1) edges.push(pagedBattingEdge(n));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          careerBattingStats: {
            __typename: 'CareerBattingConnection',
            totalCount: FEED_TOTAL,
            edges,
            pageInfo: {
              ...MOCK_PAGE_INFO,
              hasNextPage: end < FEED_TOTAL,
              endCursor: `cursor-${end}`,
            },
          },
        },
      }),
    });
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

  test('tapping a card opens the same player-detail modal desktop row-click uses', async ({
    page,
    playersPage,
  }) => {
    // Card-feed equivalent of `player-stats-row-click-modal.spec.ts` (LS-9732
    // gap 2): `PlayerFeedCard`'s `onPress` wires to the same
    // `handleCardPlayerPress` -> `?playerId=` -> `PlayerDetailModal` path the
    // desktop grid row click uses (PlayerStatsPage.tsx). The URL-param
    // assertion already existed here; this adds the modal-actually-opened
    // assertion that was missing.
    await page.setViewportSize(MOBILE_VIEWPORT);
    await mockPlayerStatsGraphQL(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectCardFeedVisible('mlb');

    await playersPage.stats.openPlayerByName('Barry Bonds');
    await expect(page).toHaveURL(/[?&]playerId=101/);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();
    await playersPage.detail.expectText('Barry Bonds');

    await playersPage.detail.close();
    await playersPage.detail.expectClosed();
  });

  test('position/search filter state round-trips through the URL at phone width', async ({
    page,
    playersPage,
  }) => {
    // Card-feed equivalent of `player-stats-url-persistence.spec.ts` (LS-9732
    // gap 2): the card feed has its own URL-persisted filter state —
    // `position`/`searchTerm` query params (`useCardFeedUrlState`,
    // PlayerStatsCardFeed.tsx) — distinct from the desktop table's `view=`
    // tab param, which the card feed has no concept of (no Hitters/Pitchers/
    // Combined tabs in the card presentation).
    await page.setViewportSize(MOBILE_VIEWPORT);
    await mockPlayerStatsGraphQL(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectCardFeedVisible('mlb');

    const search = page.getByTestId('players-stats-card-feed-mlb-search');
    await search.fill('Bonds');
    await expect(page).toHaveURL(/[?&]searchTerm=Bonds/);

    // A reload with the same URL restores the filter into the input.
    await page.reload();
    await playersPage.stats.expectCardFeedVisible('mlb');
    await expect(
      page.getByTestId('players-stats-card-feed-mlb-search'),
    ).toHaveValue('Bonds');
  });

  test('scrolling to the bottom at phone width loads the next page of cards (LS-10682)', async ({
    page,
    playersPage,
  }) => {
    await page.setViewportSize({ width: 375, height: 504 });
    await mockPagedCareerBattingStats(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectCardFeedVisible('mlb');
    await playersPage.stats.expectPlayerVisible('Feed Player 25');

    // Scroll the way a phone user does — wheel/touch over the list until the
    // page bottom — rather than calling scrollIntoView on the list element.
    await page.mouse.move(187, 300);
    for (let i = 0; i < 20; i += 1) {
      await page.mouse.wheel(0, 2000);
    }

    await playersPage.stats.expectPlayerVisible('Feed Player 26');
  });

  test('the card feed offers a keyboard-accessible Load more control (LS-10682)', async ({
    page,
    playersPage,
  }) => {
    await page.setViewportSize({ width: 375, height: 504 });
    await mockPagedCareerBattingStats(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectCardFeedVisible('mlb');

    const loadMore = page.getByRole('button', { name: 'Load more players' });
    await loadMore.focus();
    await page.keyboard.press('Enter');

    await playersPage.stats.expectPlayerVisible('Feed Player 50');
    await expect(loadMore).toHaveCount(0);
  });

  // Share (gap 2, third affordance): PlayersCardFeed has no share/export
  // control by design (PlayerStatsCardFeed.tsx: "the card presentation has
  // no Export/Share controls... adding bespoke export/share UI to the mobile
  // card list is new, undesigned surface"). No card-feed equivalent of
  // `player-stats-share.spec.ts` exists to cover — documented here per
  // LS-9732 AC2 rather than adding a test for UI that doesn't exist.
});
