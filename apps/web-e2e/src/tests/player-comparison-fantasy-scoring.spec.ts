/**
 * Player Comparison – Fantasy Scoring E2E Tests (LS-5573)
 *
 * Covers the Fantasy Scoring section of /players/compare:
 *   - Section heading visibility when 2+ players are selected
 *   - All five stat rows: Fantasy Score, Avg Pts/Game, Hitter Score,
 *     Pitcher Score, Field Score
 *   - Row descriptions ("Projected season total", "Across all seasons")
 *   - Stat values formatted to one decimal place per player
 *   - "▲ BEST" indicator on the correct player column for each row
 *   - Premium gate blocks section for non-premium users
 *
 * All GraphQL responses are mocked; no live backend required.
 */

import { customAuthTest, test } from '../fixtures/pages';
import { extractOperationName, useTier } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_PLAYERS = [
  {
    __typename: 'Player',
    id: 1,
    firstName: 'Aaron',
    lastName: 'Judge',
    eligiblePositions: ['OF'],
    scoring: {
      __typename: 'PlayerScoring',
      totalScore: 850,
      avgPointsPerGame: 2.1,
      hitterScore: 80,
      pitchingScore: 0,
      fieldingScore: 5,
    },
    careerBatting: {
      games: 900,
      hits: 900,
      homeRuns: 220,
      rbi: 600,
      runs: 520,
      stolenBases: 10,
      baseOnBalls: 400,
      totalBases: 1800,
      offensiveWAR: 42.0,
    },
    averageSeasonBatting: {
      battingAverage: 0.282,
      onBasePercentage: 0.387,
      sluggingPercentage: 0.579,
    },
    careerPitching: null,
    careerAchievements: {
      allStarSelections: 5,
      mvpAwards: 2,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 3,
      worldSeriesRings: 1,
    },
  },
  {
    __typename: 'Player',
    id: 2,
    firstName: 'Shohei',
    lastName: 'Ohtani',
    eligiblePositions: ['SP', 'DH'],
    scoring: {
      __typename: 'PlayerScoring',
      totalScore: 960,
      avgPointsPerGame: 2.6,
      hitterScore: 75,
      pitchingScore: 60,
      fieldingScore: 3,
    },
    careerBatting: {
      games: 760,
      hits: 640,
      homeRuns: 175,
      rbi: 480,
      runs: 400,
      stolenBases: 50,
      baseOnBalls: 310,
      totalBases: 1400,
      offensiveWAR: 38.5,
    },
    averageSeasonBatting: {
      battingAverage: 0.274,
      onBasePercentage: 0.377,
      sluggingPercentage: 0.564,
    },
    careerPitching: {
      games: 130,
      wins: 55,
      losses: 23,
      saves: 0,
      strikeouts: 1200,
      baseOnBalls: 250,
      winPercentage: 0.705,
      era: '2.94',
    },
    careerAchievements: {
      allStarSelections: 4,
      mvpAwards: 2,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 2,
      worldSeriesRings: 0,
    },
  },
];

function makeMockPlayersResponse(players = MOCK_PLAYERS) {
  return { data: { players } };
}

function makeMockPremiumSubscriptionResponse() {
  return {
    data: {
      mySubscription: {
        __typename: 'SubscriptionInfo',
        status: 'active',
        tier: 'premium',
        currentPeriodEnd: '2026-12-31T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
        gracePeriodEndsAt: null,
      },
    },
  };
}

async function mockPlayerComparisonGraphQL(
  page: import('@playwright/test').Page,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();

    if (op === 'getplayerswithstats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeMockPlayersResponse()),
      });
    } else if (op === 'getallplayerseasonstats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { playerSeasonStats: [] } }),
      });
    } else if (op === 'getmysubscription') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeMockPremiumSubscriptionResponse()),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    }
  });
  // Pin the current user to premium via the shared entitlement fixture
  // (LS-8058). Registered after the route above so its GetUserById handler runs
  // first (Playwright LIFO); this handler's else returns {data:{}} and would
  // otherwise leave the user non-premium.
  await useTier(page, 'premium');
}

// ---------------------------------------------------------------------------
// Tests: Section visibility @smoke
// ---------------------------------------------------------------------------

test.describe('Fantasy Scoring – section visibility @smoke', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockPlayerComparisonGraphQL(page);
    await playersPage.gotoCompare();
    await playersPage.compare.expectSearchVisible();

    await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
    await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
  });

  test('shows Fantasy Scoring section heading', async ({ playersPage }) => {
    await playersPage.compare.expectSectionVisible('Fantasy Scoring', {
      exact: true,
    });
  });

  test('shows Fantasy Score row label', async ({ playersPage }) => {
    await playersPage.compare.expectText('Fantasy Score', { exact: true });
  });

  test('shows Avg Pts / Game row label', async ({ playersPage }) => {
    await playersPage.compare.expectText('Avg Pts / Game');
  });

  test('shows Hitter Score row label', async ({ playersPage }) => {
    await playersPage.compare.expectText('Hitter Score');
  });

  test('shows Pitcher Score row label', async ({ playersPage }) => {
    await playersPage.compare.expectText('Pitcher Score');
  });

  test('shows Field Score row label', async ({ playersPage }) => {
    await playersPage.compare.expectText('Field Score');
  });
});

// ---------------------------------------------------------------------------
// Tests: Row descriptions @regression
// ---------------------------------------------------------------------------

test.describe('Fantasy Scoring – row descriptions @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockPlayerComparisonGraphQL(page);
    await playersPage.gotoCompare();
    await playersPage.compare.expectSearchVisible();

    await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
    await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
  });

  test('shows "Projected season total" description under Fantasy Score', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectText('Projected season total');
  });

  test('shows "Across all seasons" description under Avg Pts / Game', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectText('Across all seasons');
  });
});

// ---------------------------------------------------------------------------
// Tests: Stat values @regression
// ---------------------------------------------------------------------------

test.describe('Fantasy Scoring – stat values @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockPlayerComparisonGraphQL(page);
    await playersPage.gotoCompare();
    await playersPage.compare.expectSearchVisible();

    await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
    await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
  });

  test('shows Fantasy Score values for both players (850.0 and 960.0)', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectText('850.0');
    await playersPage.compare.expectText('960.0');
  });

  test('shows Avg Pts / Game values for both players (2.1 and 2.6)', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectText('2.1');
    await playersPage.compare.expectText('2.6');
  });

  test('shows Hitter Score values for both players (80.0 and 75.0)', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectText('80.0');
    await playersPage.compare.expectText('75.0');
  });

  test('shows Pitcher Score: non-zero for Ohtani (60.0) and zero for Judge (0.0)', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectText('60.0');
    await playersPage.compare.expectText('0.0');
  });

  test('shows Field Score values for both players (5.0 and 3.0)', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectText('5.0');
    await playersPage.compare.expectText('3.0');
  });
});

// ---------------------------------------------------------------------------
// Tests: BEST indicator @regression
// ---------------------------------------------------------------------------

test.describe('Fantasy Scoring – BEST indicator @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockPlayerComparisonGraphQL(page);
    await playersPage.gotoCompare();
    await playersPage.compare.expectSearchVisible();

    await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
    await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
  });

  test('at least one BEST badge is visible in the scoring section', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectAnyBest();
  });

  test('Ohtani has higher Fantasy Score (960 > 850) — BEST appears in his column', async ({
    playersPage,
  }) => {
    // The comparison table has Ohtani in the second column. Verify his Fantasy
    // Score cell (row containing 960.0) carries the BEST badge.
    await playersPage.compare.expectBestInTableRowWithValue('960.0');
  });

  test('Judge has higher Hitter Score (80 > 75) — BEST appears in his column', async ({
    playersPage,
  }) => {
    // Hitter Score row: Judge has 80.0 and should have the BEST badge
    await playersPage.compare.expectBestInTableRowWithValue('80.0');
  });

  test('Ohtani has higher Pitcher Score (60 > 0) — BEST appears in his column', async ({
    playersPage,
  }) => {
    // Pitcher Score row: find the row by its label, then check for BEST badge
    await playersPage.compare.expectBestInTableRow('Pitcher Score');
  });
});

// ---------------------------------------------------------------------------
// Tests: Section hidden before 2 players selected @regression
// ---------------------------------------------------------------------------

test.describe('Fantasy Scoring – requires 2+ players @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockPlayerComparisonGraphQL(page);
    await playersPage.gotoCompare();
    await playersPage.compare.expectSearchVisible();
  });

  test('section is not visible with 0 players selected', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectSectionHidden('Fantasy Scoring', {
      exact: true,
    });
  });

  test('section is not visible with only 1 player selected', async ({
    playersPage,
  }) => {
    await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
    await playersPage.compare.expectSectionHidden('Fantasy Scoring', {
      exact: true,
    });
  });

  test('section appears once 2nd player is added', async ({ playersPage }) => {
    await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
    await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
    await playersPage.compare.expectSectionVisible('Fantasy Scoring', {
      exact: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Premium gate blocks section @regression
// ---------------------------------------------------------------------------

const freeUserTest = customAuthTest('freeuser@test.com', 'none');

freeUserTest.describe(
  'Fantasy Scoring Projections – premium gate @regression',
  () => {
    freeUserTest.beforeEach(async ({ page, playersPage }) => {
      await page.route(isGraphQLEndpoint, async (route) => {
        if (extractOperationName(route).toLowerCase() === 'getmysubscription') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { mySubscription: null } }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: {} }),
          });
        }
      });
      // Pin the current user to free via the shared entitlement fixture
      // (LS-8058) so the inline premium upgrade CTA renders. Registered after
      // the route above so its GetUserById handler runs first (Playwright LIFO).
      await useTier(page, 'free');
      await playersPage.gotoCompare();
    });

    freeUserTest(
      'non-premium users see the inline premium upgrade CTA (LS-7012)',
      async ({ playersPage }) => {
        // PremiumGate overlay removed (LS-7012): free users now see the full
        // page. The inline PremiumBanner's Upgrade button is the premium signal.
        await playersPage.compare.expectPremiumUpgradeCta();
      },
    );
  },
);
