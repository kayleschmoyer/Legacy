/**
 * Player Stats Page E2E Tests (Mocked GraphQL)
 *
 * Covers the Player Stats page at /players/stats with all GraphQL
 * queries mocked so tests run without a live backend.
 * Complements the existing player-stats.spec.ts (live-backend tests).
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
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
  test('navigates to /players/stats without errors', async ({ page }) => {
    await mockPlayerStatsGraphQL(page);
    await page.goto('/players/stats');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/players/stats');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

test.describe('Player Stats Page (mocked) – page structure @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayerStatsGraphQL(page);
    await page.goto('/players/stats');
    await page.waitForLoadState('load');
  });

  test('shows "MLB Player Statistics" heading', async ({ page }) => {
    await expect(page.getByText('MLB Player Statistics')).toBeVisible();
  });

  test('shows Hitters tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Hitters' })).toBeVisible();
  });

  test('shows Pitchers tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Pitchers' })).toBeVisible();
  });

  test('shows batting stats heading in batting tab', async ({ page }) => {
    await expect(page.getByText('MLB Career Batting Leaders')).toBeVisible();
  });

  test('shows player name from mocked batting data', async ({ page }) => {
    await expect(page.getByText('Barry Bonds')).toBeVisible();
  });

  test('shows multiple players from mocked batting data', async ({ page }) => {
    await expect(page.getByText('Barry Bonds')).toBeVisible();
    await expect(page.getByText('Pete Rose')).toBeVisible();
  });

  test('shows HR value from mocked batting data', async ({ page }) => {
    // Barry Bonds 762 HR
    await expect(page.getByText('762')).toBeVisible();
  });

  test('shows search input for batting stats', async ({ page }) => {
    await expect(
      page.getByPlaceholder('Search player name · min 2 chars'),
    ).toBeVisible();
  });
});

test.describe('Player Stats Page (mocked) – pitching tab @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayerStatsGraphQL(page);
    await page.goto('/players/stats');
    await page.waitForLoadState('load');
    await page.getByRole('tab', { name: 'Pitchers' }).click();
  });

  test('shows pitching stats heading after switching tabs', async ({
    page,
  }) => {
    await expect(page.getByText('MLB Career Pitching Leaders')).toBeVisible();
  });

  test('shows pitcher name from mocked pitching data', async ({ page }) => {
    await expect(page.getByText('Roger Clemens')).toBeVisible();
  });

  test('shows ERA value for pitcher', async ({ page }) => {
    await expect(page.getByText('3.19')).toBeVisible();
  });

  test('shows search input for pitching stats', async ({ page }) => {
    await expect(
      page.getByPlaceholder('Search player name · min 2 chars'),
    ).toBeVisible();
  });
});

test.describe('Player Stats Page (mocked) — empty states @regression', () => {
  test('shows empty state when no batting players', async ({ page }) => {
    await mockPlayerStatsGraphQL(page, { battingEmpty: true });
    await page.goto('/players/stats');
    await page.waitForLoadState('load');

    await expect(page.getByText('No players found')).toBeVisible();
  });

  test('shows empty state when no pitchers', async ({ page }) => {
    await mockPlayerStatsGraphQL(page, { pitchingEmpty: true });
    await page.goto('/players/stats');
    await page.waitForLoadState('load');

    await page.getByRole('tab', { name: 'Pitchers' }).click();
    await expect(page.getByText('No pitchers found')).toBeVisible();
  });
});

test.describe('Player Stats Page (mocked) — error states @regression', () => {
  test('shows error state when batting query fails', async ({ page }) => {
    await mockPlayerStatsGraphQL(page, { battingError: true });
    await page.goto('/players/stats');
    await page.waitForLoadState('load');

    await expect(page.getByText('Error Loading Statistics')).toBeVisible();
  });

  test('shows error state when pitching query fails', async ({ page }) => {
    await mockPlayerStatsGraphQL(page, { pitchingError: true });
    await page.goto('/players/stats');
    await page.waitForLoadState('load');

    await page.getByRole('tab', { name: 'Pitchers' }).click();
    await expect(page.getByText('Error Loading Statistics')).toBeVisible();
  });

  test('page does not crash on stats query failures', async ({ page }) => {
    await mockPlayerStatsGraphQL(page, {
      battingError: true,
      pitchingError: true,
    });
    await page.goto('/players/stats');
    await page.waitForLoadState('load');

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
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
    unauthTest.beforeEach(async ({ page }) => {
      await mockPlayerStatsGraphQL(page);
      await page.goto('/players/stats');
      await page.waitForLoadState('load');
    });

    unauthTest(
      'shows "MLB Player Statistics" heading on /players/stats when not authenticated',
      async ({ page }) => {
        await expect(page.getByText('MLB Player Statistics')).toBeVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      'does not show the marketing landing page on /players/stats when not authenticated',
      async ({ page }) => {
        await expect(page.getByText(/build your dynasty/i)).not.toBeVisible();
      },
    );

    unauthTest(
      'shows player stats data on /players/stats when not authenticated',
      async ({ page }) => {
        await expect(page.getByText('Barry Bonds')).toBeVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      'shows Hitters and Pitchers tabs on /players/stats when not authenticated',
      async ({ page }) => {
        await expect(page.getByRole('tab', { name: 'Hitters' })).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByRole('tab', { name: 'Pitchers' })).toBeVisible();
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
    unauthTest.beforeEach(async ({ page }) => {
      await mockPlayerStatsGraphQL(page);
      await page.goto('/players/stats');
      await page.waitForLoadState('load');
    });

    unauthTest(
      'URL stays at /players/stats for unauthenticated users — no auth-guard redirect',
      async ({ page }) => {
        await expect(page).toHaveURL('/players/stats', { timeout: 15_000 });
      },
    );

    unauthTest(
      'does not show marketing landing page for unauthenticated users on /players/stats',
      async ({ page }) => {
        await expect(page.getByText(/build your dynasty/i)).not.toBeVisible();
        await expect(page.getByText(/dominate your league/i)).not.toBeVisible();
      },
    );

    unauthTest(
      'shows player statistics content — not a 404 page — for unauthenticated users',
      async ({ page }) => {
        await expect(
          page.getByRole('heading', { name: /mlb player statistics/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );
  },
);
