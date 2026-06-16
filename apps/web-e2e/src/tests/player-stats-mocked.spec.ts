/**
 * Player Stats Page E2E Tests (Mocked GraphQL)
 *
 * Covers the Player Stats page at /players/stats with all GraphQL
 * queries mocked so tests run without a live backend.
 * Complements the existing player-stats.spec.ts (live-backend tests).
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { expect, test, unauthTest } from '../fixtures/pages';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/** URL predicate for the GraphQL API endpoint */

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
  {
    __typename: 'CareerBattingEdge',
    node: {
      __typename: 'CareerBatting',
      playerId: 102,
      primaryPosition: 'RF',
      positionsPlayed: 'RF',
      games: 3562,
      plateAppearances: 13791,
      atBats: 11551,
      runs: 2174,
      hits: 3630,
      doubles: 792,
      triples: 59,
      homeRuns: 1,
      rbi: 1903,
      stolenBases: 301,
      caughtStealing: 131,
      baseOnBalls: 1865,
      strikeouts: 1383,
      totalBases: 5101,
      groundedIntoDoublePlays: 357,
      hitByPitch: 154,
      sacrificeHits: 34,
      intentionalBaseOnBalls: 298,
      battingAverage: 0.314,
      onBasePercentage: 0.401,
      sluggingPercentage: 0.441,
      offensiveWAR: 128.1,
      player: {
        __typename: 'Player',
        id: 102,
        firstName: 'Pete',
        lastName: 'Rose',
        brefId: 'rosepe01',
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
  opts: {
    battingError?: boolean;
    battingEmpty?: boolean;
    pitchingError?: boolean;
    pitchingEmpty?: boolean;
  } = {},
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('getcareerbattingstats')) {
      if (opts.battingError) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Failed to load batting stats' }],
            data: { careerBattingStats: null },
          }),
        });
      } else if (opts.battingEmpty) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              careerBattingStats: {
                __typename: 'CareerBattingConnection',
                totalCount: 0,
                edges: [],
                pageInfo: MOCK_PAGE_INFO,
              },
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              careerBattingStats: {
                __typename: 'CareerBattingConnection',
                totalCount: 2,
                edges: MOCK_BATTING_EDGES,
                pageInfo: MOCK_PAGE_INFO,
              },
            },
          }),
        });
      }
    } else if (postData.includes('getcareerpitchingstatscount')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { careerPitchingStatsCount: opts.pitchingEmpty ? 0 : 1 },
        }),
      });
    } else if (postData.includes('getcareerpitchingstats')) {
      if (opts.pitchingError) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Failed to load pitching stats' }],
            data: { careerPitchingStats: null },
          }),
        });
      } else if (opts.pitchingEmpty) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { careerPitchingStats: [] } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { careerPitchingStats: MOCK_PITCHING_STATS },
          }),
        });
      }
    } else if (
      postData.includes('getusers') ||
      postData.includes('getuserleagues')
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

test.describe('Player Stats Page (mocked) — navigation @smoke', () => {
  test('navigates to /players/stats without errors', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page);
    await playersPage.gotoStats();

    await expect(page).toHaveURL('/players/stats');
    await playersPage.expectNoApplicationError();
  });
});

test.describe('Player Stats Page (mocked) – page structure @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockPlayerStatsGraphQL(page);
    await playersPage.gotoStats();
  });

  test('shows "MLB Player Statistics" heading', async ({ playersPage }) => {
    await playersPage.stats.expectLoaded();
  });

  test('shows Hitters tab', async ({ playersPage }) => {
    await playersPage.stats.expectTabVisible('Hitters');
  });

  test('shows Pitchers tab', async ({ playersPage }) => {
    await playersPage.stats.expectTabVisible('Pitchers');
  });

  test('shows batting stats heading in batting tab', async ({
    playersPage,
  }) => {
    await playersPage.stats.expectBattingLeaders();
  });

  test('shows player name from mocked batting data', async ({
    playersPage,
  }) => {
    await playersPage.stats.expectPlayerVisible('Barry Bonds');
  });

  test('shows multiple players from mocked batting data', async ({
    playersPage,
  }) => {
    await playersPage.stats.expectPlayerVisible('Barry Bonds');
    await playersPage.stats.expectPlayerVisible('Pete Rose');
  });

  test('shows HR value from mocked batting data', async ({ playersPage }) => {
    // Barry Bonds row (playerId=101) renders his 762 HR total.
    await playersPage.stats.expectRowValue(101, '762');
  });

  test('shows search input for batting stats', async ({ playersPage }) => {
    await playersPage.stats.expectSearchVisible();
  });
});

test.describe('Player Stats Page (mocked) – pitching tab @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockPlayerStatsGraphQL(page);
    await playersPage.gotoStats();
    await playersPage.stats.switchView('Pitchers');
  });

  test('shows pitching stats heading after switching tabs', async ({
    playersPage,
  }) => {
    await playersPage.stats.expectPitchingLeaders();
  });

  test('shows pitcher name from mocked pitching data', async ({
    playersPage,
  }) => {
    await playersPage.stats.expectPlayerVisible('Roger Clemens');
  });

  test('shows ERA value for pitcher', async ({ playersPage }) => {
    await playersPage.stats.expectText('3.19');
  });

  test('shows search input for pitching stats', async ({ playersPage }) => {
    await playersPage.stats.expectSearchVisible();
  });
});

test.describe('Player Stats Page (mocked) — empty states @regression', () => {
  test('shows empty state when no batting players', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page, { battingEmpty: true });
    await playersPage.gotoStats();

    await playersPage.stats.expectMessage('No players found');
  });

  test('shows empty state when no pitchers', async ({ page, playersPage }) => {
    await mockPlayerStatsGraphQL(page, { pitchingEmpty: true });
    await playersPage.gotoStats();

    await playersPage.stats.switchView('Pitchers');
    await playersPage.stats.expectMessage('No pitchers found');
  });
});

test.describe('Player Stats Page (mocked) — error states @regression', () => {
  test('shows error state when batting query fails', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page, { battingError: true });
    await playersPage.gotoStats();

    await playersPage.stats.expectMessage('Error Loading Statistics');
  });

  test('shows error state when pitching query fails', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page, { pitchingError: true });
    await playersPage.gotoStats();

    await playersPage.stats.switchView('Pitchers');
    await playersPage.stats.expectMessage('Error Loading Statistics');
  });

  test('page does not crash on stats query failures', async ({
    page,
    playersPage,
  }) => {
    await mockPlayerStatsGraphQL(page, {
      battingError: true,
      pitchingError: true,
    });
    await playersPage.gotoStats();

    await playersPage.expectNoApplicationError();
  });
});

// ---------------------------------------------------------------------------
// LS-3501: /players/stats is a public route. Unauthenticated users must see the
// player statistics content — not the "Build Your Dynasty" marketing landing page
// rendered by EnhancedAuthGuard for protected routes. The route is listed in
// publicPaths (LS-3548); these tests lock in the unauthenticated rendering so
// a regression cannot go undetected.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Player Stats page — unauthenticated visitor (LS-3501) @regression',
  () => {
    unauthTest.beforeEach(async ({ page, playersPage }) => {
      await mockPlayerStatsGraphQL(page);
      await playersPage.gotoStats();
    });

    unauthTest(
      'shows "MLB Player Statistics" heading on /players/stats when not authenticated',
      async ({ playersPage }) => {
        await playersPage.stats.expectLoaded(15_000);
      },
    );

    unauthTest(
      'does not show the marketing landing page on /players/stats when not authenticated',
      async ({ playersPage }) => {
        // LS-3785's editorial subtitle on the stats page now contains the
        // phrase "build your dynasty on the numbers that actually happened",
        // so a /build your dynasty/i regex matches the stats page itself.
        // "Dominate Your League" appears only on the marketing landing page,
        // making it a reliable marketing-only signal.
        await playersPage.stats.expectMarketingLandingHidden();
      },
    );

    unauthTest(
      'shows player stats data on /players/stats when not authenticated',
      async ({ playersPage }) => {
        await playersPage.stats.expectPlayerVisible('Barry Bonds', 15_000);
      },
    );

    unauthTest(
      'shows Hitters and Pitchers tabs on /players/stats when not authenticated',
      async ({ playersPage }) => {
        await playersPage.stats.expectTabVisible('Hitters', 15_000);
        await playersPage.stats.expectTabVisible('Pitchers');
      },
    );
  },
);

// ---------------------------------------------------------------------------
// LS-3498: [functional] 404 error on /players/stats endpoint.
// An automated audit crawler navigated to /players/stats unauthenticated and
// received a functional 404 — EnhancedAuthGuard had not listed the route in
// publicPaths, so it intercepted the request and rendered the "Build Your
// Dynasty" marketing landing page while the URL showed /players/stats. Adding
// the route to publicPaths (LS-3548) resolved the redirect. These tests lock
// in the corrected URL behaviour: the browser must remain at /players/stats
// (no auth-guard redirect to /) and the marketing landing page must never
// appear for unauthenticated visitors to this public route.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Player Stats page — functional 404 regression (LS-3498) @regression',
  () => {
    unauthTest.beforeEach(async ({ page, playersPage }) => {
      await mockPlayerStatsGraphQL(page);
      await playersPage.gotoStats();
    });

    unauthTest(
      'URL stays at /players/stats for unauthenticated users — no auth-guard redirect',
      async ({ page }) => {
        await expect(page).toHaveURL('/players/stats', { timeout: 15_000 });
      },
    );

    unauthTest(
      'does not show marketing landing page for unauthenticated users on /players/stats',
      async ({ playersPage }) => {
        // "Dominate Your League" appears only on the marketing landing page.
        // The /build your dynasty/i regex would false-match LS-3785's
        // editorial subtitle on the stats page itself.
        await playersPage.stats.expectMarketingLandingHidden();
      },
    );

    unauthTest(
      'shows player statistics content — not a 404 page — for unauthenticated users',
      async ({ playersPage }) => {
        // The stats title renders as a styled div (not a semantic heading), so
        // assert the content by text; a 404 / marketing page would not render
        // the "MLB Player Statistics" title at all.
        await playersPage.stats.expectLoaded(15_000);
      },
    );
  },
);
