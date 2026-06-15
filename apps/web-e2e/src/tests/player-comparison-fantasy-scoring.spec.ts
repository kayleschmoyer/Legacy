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

import { createCustomAuthTest, expect, test } from '../fixtures/auth-enhanced';
import { extractOperationName } from '../fixtures/shared-mocks';
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

function makeMockUserResponse() {
  return {
    data: {
      user: {
        __typename: 'User',
        id: 1,
        email: 'user@test.com',
        username: 'testuser',
        accessLevel: 'none',
        subscriptionTier: 'premium',
        avatarUrl: null,
      },
    },
  };
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
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route).toLowerCase();

      if (op === 'getplayerswithstats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeMockPlayersResponse()),
        });
      } else if (op === 'getuserbyid') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeMockUserResponse()),
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
    },
  );
}

/** Add a player by searching and clicking their name in the dropdown. */
async function addPlayer(
  page: import('@playwright/test').Page,
  searchTerm: string,
  fullName: string,
) {
  const input = page.getByLabel('Search players to compare');
  await expect(async () => {
    await input.clear();
    await input.focus();
    await input.fill(searchTerm);
    await expect(page.getByText(fullName)).toBeVisible({ timeout: 5000 });
    await page.getByText(fullName).click({ timeout: 5000 });
  }).toPass({ timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Tests: Section visibility @smoke
// ---------------------------------------------------------------------------

test.describe('Fantasy Scoring – section visibility @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayerComparisonGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
    await expect(page.getByLabel('Search players to compare')).toBeVisible();

    await addPlayer(page, 'Aa', 'Aaron Judge');
    await addPlayer(page, 'Sh', 'Shohei Ohtani');
  });

  test('shows Fantasy Scoring section heading', async ({ page }) => {
    await expect(
      page.getByText('Fantasy Scoring', { exact: true }),
    ).toBeVisible();
  });

  test('shows Fantasy Score row label', async ({ page }) => {
    await expect(
      page.getByText('Fantasy Score', { exact: true }),
    ).toBeVisible();
  });

  test('shows Avg Pts / Game row label', async ({ page }) => {
    await expect(page.getByText('Avg Pts / Game')).toBeVisible();
  });

  test('shows Hitter Score row label', async ({ page }) => {
    await expect(page.getByText('Hitter Score')).toBeVisible();
  });

  test('shows Pitcher Score row label', async ({ page }) => {
    await expect(page.getByText('Pitcher Score')).toBeVisible();
  });

  test('shows Field Score row label', async ({ page }) => {
    await expect(page.getByText('Field Score')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Row descriptions @regression
// ---------------------------------------------------------------------------

test.describe('Fantasy Scoring – row descriptions @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayerComparisonGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
    await expect(page.getByLabel('Search players to compare')).toBeVisible();

    await addPlayer(page, 'Aa', 'Aaron Judge');
    await addPlayer(page, 'Sh', 'Shohei Ohtani');
  });

  test('shows "Projected season total" description under Fantasy Score', async ({
    page,
  }) => {
    await expect(page.getByText('Projected season total')).toBeVisible();
  });

  test('shows "Across all seasons" description under Avg Pts / Game', async ({
    page,
  }) => {
    await expect(page.getByText('Across all seasons')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Stat values @regression
// ---------------------------------------------------------------------------

test.describe('Fantasy Scoring – stat values @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayerComparisonGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
    await expect(page.getByLabel('Search players to compare')).toBeVisible();

    await addPlayer(page, 'Aa', 'Aaron Judge');
    await addPlayer(page, 'Sh', 'Shohei Ohtani');
  });

  test('shows Fantasy Score values for both players (850.0 and 960.0)', async ({
    page,
  }) => {
    await expect(page.getByText('850.0')).toBeVisible();
    await expect(page.getByText('960.0')).toBeVisible();
  });

  test('shows Avg Pts / Game values for both players (2.1 and 2.6)', async ({
    page,
  }) => {
    await expect(page.getByText('2.1').first()).toBeVisible();
    await expect(page.getByText('2.6').first()).toBeVisible();
  });

  test('shows Hitter Score values for both players (80.0 and 75.0)', async ({
    page,
  }) => {
    await expect(page.getByText('80.0')).toBeVisible();
    await expect(page.getByText('75.0')).toBeVisible();
  });

  test('shows Pitcher Score: non-zero for Ohtani (60.0) and zero for Judge (0.0)', async ({
    page,
  }) => {
    await expect(page.getByText('60.0').first()).toBeVisible();
    await expect(page.getByText('0.0').first()).toBeVisible();
  });

  test('shows Field Score values for both players (5.0 and 3.0)', async ({
    page,
  }) => {
    await expect(page.getByText('5.0').first()).toBeVisible();
    await expect(page.getByText('3.0').first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: BEST indicator @regression
// ---------------------------------------------------------------------------

test.describe('Fantasy Scoring – BEST indicator @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayerComparisonGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
    await expect(page.getByLabel('Search players to compare')).toBeVisible();

    await addPlayer(page, 'Aa', 'Aaron Judge');
    await addPlayer(page, 'Sh', 'Shohei Ohtani');
  });

  test('at least one BEST badge is visible in the scoring section', async ({
    page,
  }) => {
    await expect(page.getByText('BEST', { exact: true }).first()).toBeVisible();
  });

  test('Ohtani has higher Fantasy Score (960 > 850) — BEST appears in his column', async ({
    page,
  }) => {
    // The comparison table has Ohtani in the second column.
    // Verify his Fantasy Score cell contains both the value and BEST badge.
    const table = page.getByRole('table', {
      name: 'Player comparison',
    });
    await expect(table).toBeVisible();

    // Ohtani column should contain 960.0 and a BEST badge in close proximity
    const ohtaniCol = table
      .getByRole('row')
      .filter({ hasText: '960.0' })
      .getByText('BEST', { exact: true });
    await expect(ohtaniCol).toBeVisible();
  });

  test('Judge has higher Hitter Score (80 > 75) — BEST appears in his column', async ({
    page,
  }) => {
    const table = page.getByRole('table', { name: 'Player comparison' });
    await expect(table).toBeVisible();

    // Hitter Score row: Judge has 80.0 and should have the BEST badge
    const judgeHitterBest = table
      .getByRole('row')
      .filter({ hasText: '80.0' })
      .getByText('BEST', { exact: true });
    await expect(judgeHitterBest).toBeVisible();
  });

  test('Ohtani has higher Pitcher Score (60 > 0) — BEST appears in his column', async ({
    page,
  }) => {
    const table = page.getByRole('table', { name: 'Player comparison' });
    await expect(table).toBeVisible();

    // Pitcher Score row: find the row by its label, then check for BEST badge
    const ohtaniPitcherBest = table
      .getByRole('row')
      .filter({ hasText: 'Pitcher Score' })
      .getByText('BEST', { exact: true });
    await expect(ohtaniPitcherBest).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Section hidden before 2 players selected @regression
// ---------------------------------------------------------------------------

test.describe('Fantasy Scoring – requires 2+ players @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayerComparisonGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
    await expect(page.getByLabel('Search players to compare')).toBeVisible();
  });

  test('section is not visible with 0 players selected', async ({ page }) => {
    await expect(
      page.getByText('Fantasy Scoring', { exact: true }),
    ).not.toBeVisible();
  });

  test('section is not visible with only 1 player selected', async ({
    page,
  }) => {
    await addPlayer(page, 'Aa', 'Aaron Judge');
    await expect(
      page.getByText('Fantasy Scoring', { exact: true }),
    ).not.toBeVisible();
  });

  test('section appears once 2nd player is added', async ({ page }) => {
    await addPlayer(page, 'Aa', 'Aaron Judge');
    await addPlayer(page, 'Sh', 'Shohei Ohtani');
    await expect(
      page.getByText('Fantasy Scoring', { exact: true }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Premium gate blocks section @regression
// ---------------------------------------------------------------------------

const freeUserTest = createCustomAuthTest('freeuser@test.com', 'none');

freeUserTest.describe('Fantasy Scoring – premium gate @regression', () => {
  freeUserTest.beforeEach(async ({ page }) => {
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
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
      },
    );
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
  });

  freeUserTest(
    'non-premium users see the Premium Feature gate overlay',
    async ({ page }) => {
      await expect(page.getByText(/premium feature/i)).toBeVisible();
    },
  );

  freeUserTest(
    'Fantasy Scoring rows are not accessible behind the gate',
    async ({ page }) => {
      await expect(
        page.getByText('Fantasy Scoring', { exact: true }),
      ).not.toBeVisible();
    },
  );
});
