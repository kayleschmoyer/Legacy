/**
 * Player Comparison – BEST Indicator E2E Tests (LS-5568)
 *
 * Verifies that the upward triangle (▲) + "BEST" label appears on the column
 * with the highest value per comparison row, and that tied rows show no indicator.
 * For lowerIsBetter stats (ERA) the indicator marks the lowest value instead.
 *
 * Premium feature; all GraphQL responses are mocked — no live backend required.
 */

import { adminTest, expect } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
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
    brefId: 'judgear01',
    eligiblePositions: ['OF'],
    primaryEra: 'modern',
    scoring: {
      __typename: 'PlayerScoring',
      battingScore: 90,
      pitchingScore: 0,
      fieldingScore: 5,
      hitterScore: 80,
      hitterAvgPointsPerGame: 2.1,
      pitchingAvgPointsPerGame: 0,
      totalScore: 850,
      careerGames: 900,
      avgPointsPerGame: 2.1,
    },
    averageSeasonBatting: {
      seasons: 8,
      games: 112,
      atBats: 420,
      runs: 65,
      hits: 118,
      homeRuns: 28,
      rbi: 75,
      stolenBases: 1,
      battingAverage: 0.282,
      onBasePercentage: 0.387,
      sluggingPercentage: 0.579,
    },
    careerBatting: {
      games: 900,
      runs: 520,
      homeRuns: 220,
      rbi: 600,
      stolenBases: 10,
      hits: 900,
      atBats: 3200,
      plateAppearances: 3800,
      baseOnBalls: 400,
      hitByPitch: 30,
      sacrificeHits: 0,
      totalBases: 1800,
      offensiveWAR: 42.0,
    },
    careerPitching: null,
    careerAchievements: {
      allStarSelections: 5,
      mvpAwards: 2,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 3,
      worldSeriesRings: 1,
      hallOfFame: false,
      rookieOfTheYear: true,
    },
  },
  {
    __typename: 'Player',
    id: 2,
    firstName: 'Shohei',
    lastName: 'Ohtani',
    brefId: 'ohtansh01',
    eligiblePositions: ['SP', 'DH'],
    primaryEra: 'modern',
    scoring: {
      __typename: 'PlayerScoring',
      battingScore: 75,
      pitchingScore: 60,
      fieldingScore: 3,
      hitterScore: 75,
      hitterAvgPointsPerGame: 2.2,
      pitchingAvgPointsPerGame: 3.0,
      totalScore: 960,
      careerGames: 760,
      avgPointsPerGame: 2.6,
    },
    averageSeasonBatting: {
      seasons: 7,
      games: 109,
      atBats: 400,
      runs: 57,
      hits: 110,
      homeRuns: 25,
      rbi: 69,
      stolenBases: 7,
      battingAverage: 0.274,
      onBasePercentage: 0.377,
      sluggingPercentage: 0.564,
    },
    careerBatting: {
      games: 760,
      runs: 400,
      homeRuns: 175,
      rbi: 480,
      stolenBases: 50,
      hits: 640,
      atBats: 2340,
      plateAppearances: 2800,
      baseOnBalls: 310,
      hitByPitch: 20,
      sacrificeHits: 0,
      totalBases: 1400,
      offensiveWAR: 38.5,
    },
    careerPitching: {
      wins: 55,
      losses: 23,
      era: '2.94',
      games: 130,
      gamesStarted: 120,
      saves: 0,
      strikeouts: 1200,
      baseOnBalls: 250,
      hits: 480,
      earnedRuns: 210,
      outsRecorded: 2100,
      winPercentage: 0.705,
    },
    careerAchievements: {
      allStarSelections: 4,
      mvpAwards: 2,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 2,
      worldSeriesRings: 0,
      hallOfFame: false,
      rookieOfTheYear: true,
    },
  },
];

/**
 * Unqualified-pitcher variant: Koufax (ERA 3.85, 2880 IP — qualified) vs a
 * short-sample pitcher with ERA 1.50 over just 30 IP (90 outsRecorded).
 * Used to verify ERA suppression and the 50-IP qualifier guard (LS-7009).
 */
const MOCK_UNQUALIFIED_PITCHER_PLAYERS = [
  {
    __typename: 'Player',
    id: 5,
    firstName: 'Sandy',
    lastName: 'Koufax',
    brefId: 'koufasa01',
    eligiblePositions: ['SP'],
    primaryEra: 'classic',
    scoring: {
      __typename: 'PlayerScoring',
      battingScore: 0,
      pitchingScore: 90,
      fieldingScore: 2,
      hitterScore: 0,
      hitterAvgPointsPerGame: 0,
      pitchingAvgPointsPerGame: 4.5,
      totalScore: 920,
      careerGames: 397,
      avgPointsPerGame: 4.5,
    },
    averageSeasonBatting: {
      seasons: 12,
      games: 28,
      atBats: 55,
      runs: 4,
      hits: 10,
      homeRuns: 0,
      rbi: 5,
      stolenBases: 0,
      battingAverage: 0.097,
      onBasePercentage: 0.109,
      sluggingPercentage: 0.102,
    },
    careerBatting: {
      games: 397,
      runs: 41,
      homeRuns: 2,
      rbi: 48,
      stolenBases: 2,
      hits: 75,
      atBats: 776,
      plateAppearances: 800,
      baseOnBalls: 33,
      hitByPitch: 3,
      sacrificeHits: 30,
      totalBases: 83,
      offensiveWAR: -1.2,
    },
    careerPitching: {
      wins: 165,
      losses: 87,
      era: '3.85',
      games: 397,
      gamesStarted: 314,
      saves: 9,
      strikeouts: 2396,
      baseOnBalls: 817,
      hits: 1754,
      earnedRuns: 713,
      outsRecorded: 8640, // 2880 IP — well above 50-IP threshold
      winPercentage: 0.655,
    },
    careerAchievements: {
      allStarSelections: 6,
      mvpAwards: 0,
      cyYoungAwards: 3,
      goldGloves: 0,
      silverSluggers: 0,
      worldSeriesRings: 4,
      hallOfFame: true,
      rookieOfTheYear: false,
    },
  },
  {
    __typename: 'Player',
    id: 6,
    firstName: 'Short',
    lastName: 'Sample',
    brefId: 'sampls01',
    eligiblePositions: ['SP'],
    primaryEra: 'modern',
    scoring: {
      __typename: 'PlayerScoring',
      battingScore: 0,
      pitchingScore: 10,
      fieldingScore: 0,
      hitterScore: 0,
      hitterAvgPointsPerGame: 0,
      pitchingAvgPointsPerGame: 1.0,
      totalScore: 100,
      careerGames: 10,
      avgPointsPerGame: 1.0,
    },
    averageSeasonBatting: {
      seasons: 1,
      games: 5,
      atBats: 10,
      runs: 0,
      hits: 1,
      homeRuns: 0,
      rbi: 0,
      stolenBases: 0,
      battingAverage: 0.1,
      onBasePercentage: 0.1,
      sluggingPercentage: 0.1,
    },
    careerBatting: {
      games: 10,
      runs: 0,
      homeRuns: 0,
      rbi: 0,
      stolenBases: 0,
      hits: 1,
      atBats: 10,
      plateAppearances: 10,
      baseOnBalls: 0,
      hitByPitch: 0,
      sacrificeHits: 0,
      totalBases: 1,
      offensiveWAR: -0.1,
    },
    careerPitching: {
      wins: 2,
      losses: 1,
      era: '1.50', // misleadingly low ERA over a tiny sample
      games: 5,
      gamesStarted: 5,
      saves: 0,
      strikeouts: 25,
      baseOnBalls: 10,
      hits: 20,
      earnedRuns: 5,
      outsRecorded: 90, // 30 IP — below the 50-IP (150-out) threshold
      winPercentage: 0.667,
    },
    careerAchievements: {
      allStarSelections: 0,
      mvpAwards: 0,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 0,
      worldSeriesRings: 0,
      hallOfFame: false,
      rookieOfTheYear: false,
    },
  },
];

/** Two-pitcher variant: Ohtani (ERA 2.94) vs Sandy Koufax (ERA 3.85) */
const MOCK_TWO_PITCHER_PLAYERS = [
  {
    ...MOCK_PLAYERS[1], // Ohtani — ERA 2.94 (lower = BEST)
  },
  {
    __typename: 'Player',
    id: 5,
    firstName: 'Sandy',
    lastName: 'Koufax',
    brefId: 'koufasa01',
    eligiblePositions: ['SP'],
    primaryEra: 'classic',
    scoring: {
      __typename: 'PlayerScoring',
      battingScore: 0,
      pitchingScore: 90,
      fieldingScore: 2,
      hitterScore: 0,
      hitterAvgPointsPerGame: 0,
      pitchingAvgPointsPerGame: 4.5,
      totalScore: 920,
      careerGames: 397,
      avgPointsPerGame: 4.5,
    },
    averageSeasonBatting: {
      seasons: 12,
      games: 28,
      atBats: 55,
      runs: 4,
      hits: 10,
      homeRuns: 0,
      rbi: 5,
      stolenBases: 0,
      battingAverage: 0.097,
      onBasePercentage: 0.109,
      sluggingPercentage: 0.102,
    },
    careerBatting: {
      games: 397,
      runs: 41,
      homeRuns: 2,
      rbi: 48,
      stolenBases: 2,
      hits: 75,
      atBats: 776,
      plateAppearances: 800,
      baseOnBalls: 33,
      hitByPitch: 3,
      sacrificeHits: 30,
      totalBases: 83,
      offensiveWAR: -1.2,
    },
    careerPitching: {
      wins: 165,
      losses: 87,
      era: '3.85',
      games: 397,
      gamesStarted: 314,
      saves: 9,
      strikeouts: 2396,
      baseOnBalls: 817,
      hits: 1754,
      earnedRuns: 713,
      outsRecorded: 8640,
      winPercentage: 0.655,
    },
    careerAchievements: {
      allStarSelections: 6,
      mvpAwards: 0,
      cyYoungAwards: 3,
      goldGloves: 0,
      silverSluggers: 0,
      worldSeriesRings: 4,
      hallOfFame: true,
      rookieOfTheYear: false,
    },
  },
];

type MockPlayers =
  | typeof MOCK_PLAYERS
  | typeof MOCK_TWO_PITCHER_PLAYERS
  | typeof MOCK_UNQUALIFIED_PITCHER_PLAYERS;

function makeMockPlayersResponse(players: MockPlayers) {
  return { data: { players } };
}

function makeMockUserResponse(
  subscriptionTier = 'premium',
  accessLevel = 'none',
) {
  return {
    data: {
      user: {
        __typename: 'User',
        id: 1,
        email: 'user@test.com',
        username: 'testuser',
        accessLevel,
        subscriptionTier,
        avatarUrl: null,
      },
    },
  };
}

async function mockGraphQL(
  page: import('@playwright/test').Page,
  players: MockPlayers = MOCK_PLAYERS,
  userResponse = makeMockUserResponse(),
) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route);

      if (op === 'GetPlayersWithStats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeMockPlayersResponse(players)),
        });
      } else if (op === 'GetUserById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(userResponse),
        });
      } else if (op === 'GetAllPlayerSeasonStats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              playerSeasonBatting: [],
              playerSeasonPitching: [],
              playerSeasonFielding: [],
            },
          }),
        });
      } else if (op === 'GetMySubscription') {
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
        await unmockedGraphQLFallback(route);
      }
    },
  );
}

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

async function addPlayerForce(
  page: import('@playwright/test').Page,
  searchTerm: string,
  fullName: string,
) {
  const input = page.getByLabel('Search players to compare');
  await expect(async () => {
    await input.clear({ force: true });
    await input.focus({ force: true });
    await input.fill(searchTerm, { force: true });
    await expect(page.getByText(fullName)).toBeVisible({ timeout: 5000 });
    await page.getByText(fullName).click({ force: true, timeout: 5000 });
  }).toPass({ timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Tests: BEST indicator basic visibility @regression
// ---------------------------------------------------------------------------

adminTest.describe('Player Comparison – BEST indicator @regression', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
    await expect(page.getByLabel('Search players to compare')).toBeVisible();

    await addPlayer(page, 'Aa', 'Aaron Judge');
    await addPlayer(page, 'Sh', 'Shohei Ohtani');
  });

  adminTest(
    '"BEST" badge is visible in the comparison table',
    async ({ page }) => {
      await expect(
        page.getByText('BEST', { exact: true }).first(),
      ).toBeVisible();
    },
  );

  adminTest(
    'upward triangle ▲ is visible alongside the "BEST" badge',
    async ({ page }) => {
      await expect(page.getByText('▲').first()).toBeVisible();
    },
  );

  // Career Achievements row-level assertions
  // Judge: allStarSelections=5 > Ohtani: allStarSelections=4

  adminTest(
    'All-Star Selections row shows BEST for the player with more selections',
    async ({ page }) => {
      const row = page
        .getByRole('row')
        .filter({ hasText: /all-star selections/i });
      await expect(row.getByText('BEST', { exact: true })).toBeVisible();
    },
  );

  adminTest(
    'All-Star Selections row shows exactly one BEST badge',
    async ({ page }) => {
      const row = page
        .getByRole('row')
        .filter({ hasText: /all-star selections/i });
      await expect(row.getByText('BEST', { exact: true })).toHaveCount(1);
    },
  );

  // Judge: mvpAwards=2, Ohtani: mvpAwards=2 — tied, no BEST

  adminTest(
    'MVP Awards row shows no BEST when both players are tied',
    async ({ page }) => {
      const row = page.getByRole('row').filter({ hasText: /mvp awards/i });
      await expect(row.getByText('BEST', { exact: true })).toHaveCount(0);
    },
  );

  // Judge: cyYoungAwards=0, Ohtani: cyYoungAwards=0 — tied at zero, no BEST

  adminTest(
    'Cy Young Awards row shows no BEST when both players have 0',
    async ({ page }) => {
      const row = page.getByRole('row').filter({ hasText: /cy young/i });
      await expect(row.getByText('BEST', { exact: true })).toHaveCount(0);
    },
  );

  // Judge: silverSluggers=3 > Ohtani: silverSluggers=2

  adminTest(
    'Silver Sluggers row shows BEST for the player with more awards',
    async ({ page }) => {
      const row = page.getByRole('row').filter({ hasText: /silver sluggers/i });
      await expect(row.getByText('BEST', { exact: true })).toBeVisible();
    },
  );

  // Judge: worldSeriesRings=1 > Ohtani: worldSeriesRings=0

  adminTest(
    'World Series Rings row shows BEST for the player with more rings',
    async ({ page }) => {
      const row = page
        .getByRole('row')
        .filter({ hasText: /world series rings/i });
      await expect(row.getByText('BEST', { exact: true })).toBeVisible();
    },
  );

  // Fantasy Scoring: Ohtani totalScore=960 > Judge totalScore=850

  adminTest(
    'Fantasy Score row shows BEST for the player with the higher score',
    async ({ page }) => {
      const row = page.getByRole('row').filter({ hasText: /fantasy score/i });
      await expect(row.getByText('BEST', { exact: true })).toBeVisible();
    },
  );

  // Career Batting: Ohtani stolenBases=50 > Judge stolenBases=10

  adminTest(
    'Stolen Bases row shows BEST for the player with more stolen bases',
    async ({ page }) => {
      const row = page.getByRole('row').filter({ hasText: /stolen bases/i });
      await expect(row.getByText('BEST', { exact: true })).toBeVisible();
    },
  );

  // BEST appears in multiple different rows

  adminTest(
    'multiple rows show BEST across different stat groups',
    async ({ page }) => {
      // At least 3 BEST badges should be visible (Fantasy Score, Career Batting,
      // Career Achievements each contribute at least one clear winner)
      const bestBadges = page.getByText('BEST', { exact: true });
      const count = await bestBadges.count();
      expect(count).toBeGreaterThanOrEqual(3);
    },
  );
});

// ---------------------------------------------------------------------------
// Tests: BEST indicator — lowerIsBetter (ERA) @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – BEST indicator lowerIsBetter @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockGraphQL(page, MOCK_TWO_PITCHER_PLAYERS);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();

      // Ohtani (ERA 2.94) and Sandy Koufax (ERA 3.85) — both have pitching data
      await addPlayer(page, 'Sh', 'Shohei Ohtani');
      await addPlayer(page, 'Sa', 'Sandy Koufax');
    });

    adminTest(
      'Career Pitching section is visible when two pitchers are compared',
      async ({ page }) => {
        await expect(page.getByText(/career pitching/i)).toBeVisible();
      },
    );

    adminTest(
      'ERA row shows BEST for the pitcher with the lower ERA (lowerIsBetter)',
      async ({ page }) => {
        // Ohtani ERA 2.94 < Koufax ERA 3.85, so Ohtani should get BEST
        const row = page.getByRole('row').filter({ hasText: 'ERA' });
        await expect(row.getByText('BEST', { exact: true })).toBeVisible();
      },
    );

    adminTest('ERA row shows exactly one BEST badge', async ({ page }) => {
      const row = page.getByRole('row').filter({ hasText: 'ERA' });
      await expect(row.getByText('BEST', { exact: true })).toHaveCount(1);
    });
  },
);

// ---------------------------------------------------------------------------
// Tests: ERA suppression for pitchers below 50 IP threshold (LS-7009) @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – ERA suppression below 50 IP threshold @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockGraphQL(page, MOCK_UNQUALIFIED_PITCHER_PLAYERS);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();

      // Koufax (qualified, 2880 IP) and Short Sample (unqualified, 30 IP)
      await addPlayer(page, 'Sa', 'Sandy Koufax');
      await addPlayer(page, 'Sh', 'Short Sample');
    });

    adminTest(
      'ERA row is visible in the Career Pitching section',
      async ({ page }) => {
        await expect(page.getByText(/career pitching/i)).toBeVisible();
        const row = page.getByRole('row').filter({ hasText: 'ERA' });
        await expect(row).toBeVisible();
      },
    );

    adminTest(
      'ERA shows — for a pitcher below the 50 IP threshold',
      async ({ page }) => {
        const row = page.getByRole('row').filter({ hasText: 'ERA' });
        // The unqualified pitcher's ERA is suppressed — row must contain a dash
        await expect(row.getByText('—').first()).toBeVisible();
      },
    );

    adminTest(
      'ERA row awards BEST to the sole qualifying pitcher (LS-7000)',
      async ({ page }) => {
        // LS-7000 changed bestIndex so the sole valid value wins the BEST badge
        // (valid.length===0 guard). When one pitcher is suppressed (<50 IP) the
        // qualifying pitcher's ERA is the only valid value and correctly gets BEST.
        const row = page.getByRole('row').filter({ hasText: 'ERA' });
        await expect(row.getByText('BEST', { exact: true })).toHaveCount(1);
      },
    );

    adminTest(
      'ERA row shows the Min. 50 IP required qualifier note',
      async ({ page }) => {
        const row = page.getByRole('row').filter({ hasText: 'ERA' });
        await expect(row.getByText(/min\. 50 ip required/i)).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: BEST indicator absent for non-premium users (PCM-006) @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – BEST indicator absent for non-premium @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      // Mock GetUserById as a free-tier user so isPremium resolves to false.
      // All other mocks (players, season stats) remain the same.
      await mockGraphQL(
        page,
        MOCK_PLAYERS,
        makeMockUserResponse('free', 'none'),
      );
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();

      // Force-interact to simulate a user who has bypassed the pointer-events
      // gate (e.g. via browser DevTools) and added players to the comparison.
      await addPlayerForce(page, 'Aa', 'Aaron Judge');
      await addPlayerForce(page, 'Sh', 'Shohei Ohtani');
    });

    adminTest(
      'BEST badge is absent from DOM for non-premium users (PCM-006)',
      async ({ page }) => {
        await expect(page.getByText('BEST', { exact: true })).toHaveCount(0);
      },
    );

    adminTest(
      'upward triangle ▲ is absent from DOM for non-premium users (PCM-006)',
      async ({ page }) => {
        await expect(page.getByText('▲')).toHaveCount(0);
      },
    );
  },
);
