/**
 * Player Comparison Page E2E Tests (LS-676)
 *
 * Covers /players/compare:
 *   - Page structure (heading, search input, initial empty state)
 *   - Player search and add via mocked GraphQL
 *   - Side-by-side comparison table (requires 2+ players)
 *   - Remove player (X chip button)
 *   - Premium gate UX for non-premium users
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import {
  adminTest,
  createCustomAuthTest,
  expect,
  test,
  unauthTest,
} from '../fixtures/auth-enhanced';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

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
  {
    __typename: 'Player',
    id: 3,
    firstName: 'Mookie',
    lastName: 'Betts',
    eligiblePositions: ['OF'],
    scoring: {
      __typename: 'PlayerScoring',
      totalScore: 810,
      avgPointsPerGame: 1.95,
      hitterScore: 74,
      pitchingScore: 0,
      fieldingScore: 9,
    },
    careerBatting: {
      games: 1050,
      hits: 1150,
      homeRuns: 195,
      rbi: 580,
      runs: 700,
      stolenBases: 120,
      baseOnBalls: 520,
      totalBases: 1900,
      offensiveWAR: 54.0,
    },
    averageSeasonBatting: {
      battingAverage: 0.294,
      onBasePercentage: 0.371,
      sluggingPercentage: 0.511,
    },
    careerPitching: null,
    careerAchievements: {
      allStarSelections: 6,
      mvpAwards: 1,
      cyYoungAwards: 0,
      goldGloves: 5,
      silverSluggers: 4,
      worldSeriesRings: 2,
    },
  },
];

/** Mock response for PlayersWithStats search query */
function makeMockPlayersResponse(players = MOCK_PLAYERS) {
  return {
    data: { players },
  };
}

/** Mock response for getUserById — returns premium subscription tier */
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

/** Sets up GraphQL mocks for the Player Comparison page (premium user). */
async function mockPlayerComparisonGraphQL(
  page: import('@playwright/test').Page,
) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (
        postData.includes('getplayerswithstats') ||
        postData.includes('playerswithstats')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeMockPlayersResponse()),
        });
      } else if (
        postData.includes('getuserbyid') ||
        postData.includes('userbyid')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeMockUserResponse()),
        });
      } else if (
        postData.includes('getallplayerseasonstats') ||
        postData.includes('allplayerseasonstats') ||
        postData.includes('playerseasonstats')
      ) {
        // Season-by-season breakdown query fired after players are selected
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { playerSeasonStats: [] } }),
        });
      } else if (
        postData.includes('getmysubscription') ||
        postData.includes('mysubscription')
      ) {
        // PremiumGate requires an active premium subscription
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
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
          }),
        });
      } else {
        // Safe default: return empty data instead of hitting the real backend
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: {} }),
        });
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Tests: Page structure (basic load smoke — includes GetUserById mock)
// ---------------------------------------------------------------------------

test.describe('Player Comparison – page structure @smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Mock GetUserById so useIsPremium doesn't hit a real backend
    await mockPlayerComparisonGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
  });

  test('loads the player comparison page without errors', async ({ page }) => {
    await expect(page).toHaveURL('/players/compare');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

test.describe('Player Comparison – page structure (premium) @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayerComparisonGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
  });

  test('shows Player Comparison heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /player comparison/i }).first(),
    ).toBeVisible();
  });

  test('shows search input for adding players', async ({ page }) => {
    await expect(page.getByLabel('Search players to compare')).toBeVisible();
  });

  test('shows placeholder text in search input', async ({ page }) => {
    await expect(page.getByPlaceholder('Search for a player…')).toBeVisible();
  });

  test('shows "Select Players" label with count', async ({ page }) => {
    await expect(page.getByText(/Select Players \(0\/4\)/)).toBeVisible();
  });

  test('shows minimum player hint when fewer than 2 selected', async ({
    page,
  }) => {
    await expect(
      page.getByText(/add at least 2 players to see the comparison table/i),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Player search & add @regression
// ---------------------------------------------------------------------------

adminTest.describe('Player Comparison – player search @regression', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockPlayerComparisonGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
    await expect(page.getByLabel('Search players to compare')).toBeVisible();
  });

  adminTest('search input accepts text input', async ({ page }) => {
    const input = page.getByLabel('Search players to compare');
    await input.fill('Aa');
    await expect(input).toHaveValue('Aa');
  });

  adminTest(
    'search results appear when query is 2+ characters',
    async ({ page }) => {
      const input = page.getByLabel('Search players to compare');
      await input.fill('Aa');
      // Wait for the dropdown results from the mock
      await expect(page.getByText('Aaron Judge')).toBeVisible();
    },
  );

  adminTest(
    'search result shows player name and position',
    async ({ page }) => {
      const input = page.getByLabel('Search players to compare');
      await input.fill('Aa');
      await expect(page.getByText('Aaron Judge')).toBeVisible();
      await expect(page.getByText('OF').first()).toBeVisible();
    },
  );

  adminTest(
    'selecting a player from results adds them as a chip',
    async ({ page }) => {
      const input = page.getByLabel('Search players to compare');
      await input.fill('Aa');
      await page.getByText('Aaron Judge').click();

      // Player count should now be 1/4
      await expect(page.getByText(/Select Players \(1\/4\)/)).toBeVisible();
      // Player chip appears
      await expect(page.getByText('Aaron Judge').first()).toBeVisible();
    },
  );

  adminTest('adding a second player updates count to 2/4', async ({ page }) => {
    const input = page.getByLabel('Search players to compare');

    // Add first player
    await input.fill('Aa');
    await page.getByText('Aaron Judge').click();

    // Add second player (retry fill+click — dropdown can close from stale blur)
    await expect(async () => {
      await input.fill('Sh');
      await page.getByText('Shohei Ohtani').click({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    await expect(page.getByText(/Select Players \(2\/4\)/)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Comparison table shown when 2+ players selected @regression
// ---------------------------------------------------------------------------

adminTest.describe('Player Comparison – comparison table @regression', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockPlayerComparisonGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
    await expect(page.getByLabel('Search players to compare')).toBeVisible();

    const input = page.getByLabel('Search players to compare');

    // Add first player
    await input.fill('Aa');
    await expect(page.getByText('Aaron Judge')).toBeVisible();
    await page.getByText('Aaron Judge').click();

    // Add second player (retry fill+click — dropdown can close from stale blur)
    await expect(async () => {
      await input.fill('Sh');
      await page.getByText('Shohei Ohtani').click({ timeout: 2000 });
    }).toPass({ timeout: 15000 });
  });

  adminTest(
    'minimum player hint disappears once 2 players are selected',
    async ({ page }) => {
      await expect(
        page.getByText(/add at least 2 players to see the comparison table/i),
      ).not.toBeVisible();
    },
  );

  adminTest('shows Fantasy Scoring Projections section', async ({ page }) => {
    await expect(page.getByText(/fantasy scoring projections/i)).toBeVisible();
  });

  adminTest('shows Career Batting section', async ({ page }) => {
    await expect(page.getByText(/career batting/i)).toBeVisible();
  });

  adminTest('shows Career Achievements section', async ({ page }) => {
    await expect(page.getByText(/career achievements/i)).toBeVisible();
  });

  adminTest('shows player names in comparison header', async ({ page }) => {
    await expect(page.getByText('Aaron Judge').first()).toBeVisible();
    await expect(page.getByText('Shohei Ohtani').first()).toBeVisible();
  });

  adminTest('shows Avg Pts / Game stat row', async ({ page }) => {
    await expect(page.getByText('Avg Pts / Game')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Remove player @regression
// ---------------------------------------------------------------------------

adminTest.describe('Player Comparison – remove player @regression', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockPlayerComparisonGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
    await expect(page.getByLabel('Search players to compare')).toBeVisible();

    // Add one player
    const input = page.getByLabel('Search players to compare');
    await input.fill('Aa');
    await expect(page.getByText('Aaron Judge')).toBeVisible();
    await page.getByText('Aaron Judge').click();
  });

  adminTest('Remove button has correct aria-label', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /remove aaron judge/i }),
    ).toBeVisible();
  });

  adminTest(
    'clicking Remove button removes the player chip',
    async ({ page }) => {
      await page.getByRole('button', { name: /remove aaron judge/i }).click();

      // Count returns to 0/4
      await expect(page.getByText(/Select Players \(0\/4\)/)).toBeVisible();
    },
  );

  adminTest(
    'minimum player hint reappears after removing second player',
    async ({ page }) => {
      // Add a second player (retry fill+click — dropdown can detach during re-render)
      const input = page.getByLabel('Search players to compare');
      await expect(async () => {
        await input.fill('Sh');
        await page.getByText('Shohei Ohtani').click({ timeout: 2000 });
      }).toPass({ timeout: 15000 });

      // Now remove one
      await page.getByRole('button', { name: /remove aaron judge/i }).click();

      await expect(
        page.getByText(/add at least 2 players to see the comparison table/i),
      ).toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// Tests: Premium gate for non-premium users @regression
// ---------------------------------------------------------------------------

// Use a custom auth fixture with accessLevel 'none' so useIsPremium doesn't
// short-circuit to true (the global-setup user may be an admin).
const freeUserTest = createCustomAuthTest('freeuser@test.com', 'none');

freeUserTest.describe('Player Comparison – premium gate @regression', () => {
  freeUserTest.beforeEach(async ({ page }) => {
    // Mock getUserById to return non-premium user (subscriptionTier 'free')
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        const postData = route.request().postData()?.toLowerCase() ?? '';
        if (postData.includes('getuserbyid') || postData.includes('userbyid')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                user: {
                  __typename: 'User',
                  id: 1,
                  email: 'freeuser@test.com',
                  username: 'freeuser',
                  accessLevel: 'none',
                  subscriptionTier: 'free',
                  avatarUrl: null,
                },
              },
            }),
          });
        } else if (
          postData.includes('getmysubscription') ||
          postData.includes('mysubscription')
        ) {
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
    'shows Premium Feature overlay for non-premium users',
    async ({ page }) => {
      await expect(page.getByText(/premium feature/i)).toBeVisible();
    },
  );

  freeUserTest(
    'shows upgrade button in premium gate overlay',
    async ({ page }) => {
      await expect(
        page.getByRole('button', { name: /upgrade/i }),
      ).toBeVisible();
    },
  );

  freeUserTest(
    'shows player comparison feature description',
    async ({ page }) => {
      await expect(
        page.getByText(/compare up to 4 players/i).first(),
      ).toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// LS-3502: /players/compare is a protected route. Unauthenticated visitors
// must see the PublicLandingPage auth gate — not a raw server 404. An
// automated audit crawler visited /players/compare unauthenticated, received
// the GitHub Pages 404 response (expected for SPA routes), saw the marketing
// landing page after the 404.html redirect loaded the SPA, and mis-reported
// it as a functional 404. The route is protected (not in publicPaths), so
// showing the landing page IS the correct auth-guard behavior. These tests
// lock in that behavior so a regression cannot go undetected.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Player comparison — unauthenticated visitor @regression',
  () => {
    unauthTest.beforeEach(async ({ page }) => {
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
    });

    unauthTest(
      'shows the marketing landing page on /players/compare when not authenticated',
      async ({ page }) => {
        await expect(page.getByText(/build your dynasty/i)).toBeVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      '"Get Started Free" CTA is visible on /players/compare when not authenticated',
      async ({ page }) => {
        const getStartedBtn = page.getByRole('button', {
          name: /get started free/i,
        });
        await expect(getStartedBtn).toBeVisible({ timeout: 15_000 });
        await expect(getStartedBtn).toBeEnabled();
      },
    );

    unauthTest(
      '"Get Started Free" CTA navigates to / on /players/compare when not authenticated',
      async ({ page }) => {
        const getStartedBtn = page.getByRole('button', {
          name: /get started free/i,
        });
        await expect(getStartedBtn).toBeVisible({ timeout: 15_000 });
        await getStartedBtn.click();
        await expect(page).toHaveURL('/');
      },
    );
  },
);
