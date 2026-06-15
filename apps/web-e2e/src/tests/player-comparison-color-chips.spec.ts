/**
 * Player Comparison – Color-Coded Player Chips E2E Tests (LS-5577)
 *
 * Verifies that each selected player gets a chip whose accent color is
 * determined by their slot index, not the player identity:
 *
 *   slot 0 → gold   (#C5A55A / rgba(197,165,90,0.5) border)
 *   slot 1 → blue   (#60A5FA / rgba(96,165,250,0.5) border)
 *   slot 2 → green  (#34D399 / rgba(52,211,153,0.5) border)
 *   slot 3 → red    (#F87171 / rgba(248,113,113,0.5) border)
 *
 * Each chip also shows the player's name and a remove X button.
 * Removing a player from one slot must not re-color chips in other slots
 * (slot identity is stable).
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
// Mock data — four distinct players for all-four-slots tests
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
  {
    __typename: 'Player',
    id: 3,
    firstName: 'Mookie',
    lastName: 'Betts',
    brefId: 'bettsmo01',
    eligiblePositions: ['OF'],
    primaryEra: 'modern',
    scoring: {
      __typename: 'PlayerScoring',
      battingScore: 82,
      pitchingScore: 0,
      fieldingScore: 9,
      hitterScore: 82,
      hitterAvgPointsPerGame: 1.95,
      pitchingAvgPointsPerGame: 0,
      totalScore: 810,
      careerGames: 1050,
      avgPointsPerGame: 1.95,
    },
    averageSeasonBatting: {
      seasons: 10,
      games: 130,
      atBats: 490,
      runs: 88,
      hits: 144,
      homeRuns: 24,
      rbi: 72,
      stolenBases: 15,
      battingAverage: 0.294,
      onBasePercentage: 0.371,
      sluggingPercentage: 0.511,
    },
    careerBatting: {
      games: 1050,
      runs: 700,
      homeRuns: 195,
      rbi: 580,
      stolenBases: 120,
      hits: 1150,
      atBats: 3910,
      plateAppearances: 4500,
      baseOnBalls: 520,
      hitByPitch: 40,
      sacrificeHits: 0,
      totalBases: 1900,
      offensiveWAR: 54.0,
    },
    careerPitching: null,
    careerAchievements: {
      allStarSelections: 6,
      mvpAwards: 1,
      cyYoungAwards: 0,
      goldGloves: 5,
      silverSluggers: 4,
      worldSeriesRings: 2,
      hallOfFame: false,
      rookieOfTheYear: false,
    },
  },
  {
    __typename: 'Player',
    id: 4,
    firstName: 'Miguel',
    lastName: 'Cabrera',
    brefId: 'cabremi01',
    eligiblePositions: ['1B'],
    primaryEra: 'modern',
    scoring: {
      __typename: 'PlayerScoring',
      battingScore: 88,
      pitchingScore: 0,
      fieldingScore: 2,
      hitterScore: 88,
      hitterAvgPointsPerGame: 1.85,
      pitchingAvgPointsPerGame: 0,
      totalScore: 920,
      careerGames: 2757,
      avgPointsPerGame: 1.85,
    },
    averageSeasonBatting: {
      seasons: 21,
      games: 140,
      atBats: 530,
      runs: 68,
      hits: 163,
      homeRuns: 22,
      rbi: 95,
      stolenBases: 4,
      battingAverage: 0.307,
      onBasePercentage: 0.385,
      sluggingPercentage: 0.519,
    },
    careerBatting: {
      games: 2757,
      runs: 1428,
      homeRuns: 511,
      rbi: 1881,
      stolenBases: 43,
      hits: 2994,
      atBats: 9753,
      plateAppearances: 11176,
      baseOnBalls: 1234,
      hitByPitch: 89,
      sacrificeHits: 0,
      totalBases: 5005,
      offensiveWAR: 68.5,
    },
    careerPitching: null,
    careerAchievements: {
      allStarSelections: 12,
      mvpAwards: 2,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 7,
      worldSeriesRings: 1,
      hallOfFame: false,
      rookieOfTheYear: false,
    },
  },
];

function makeMockPlayersResponse(players: typeof MOCK_PLAYERS = MOCK_PLAYERS) {
  return { data: { players } };
}

async function mockGraphQL(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route);

      if (op === 'GetPlayersWithStats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeMockPlayersResponse()),
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

// ---------------------------------------------------------------------------
// Tests: chip container and basic chip rendering @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – color-coded chip container @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockGraphQL(page);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();
      await addPlayer(page, 'Aa', 'Aaron Judge');
    });

    adminTest(
      'selected players container has accessible label',
      async ({ page }) => {
        await expect(page.getByLabel('Selected players')).toBeVisible();
      },
    );

    adminTest(
      'chip for the added player renders with correct data-testid',
      async ({ page }) => {
        await expect(page.getByTestId('selected-chip-1')).toBeVisible();
      },
    );

    adminTest('chip shows the selected player name', async ({ page }) => {
      const chip = page.getByTestId('selected-chip-1');
      await expect(chip).toContainText('Aaron Judge');
    });

    adminTest('chip shows the selected player position', async ({ page }) => {
      const chip = page.getByTestId('selected-chip-1');
      await expect(chip).toContainText('OF');
    });

    adminTest(
      'chip has a remove button with correct aria-label',
      async ({ page }) => {
        await expect(
          page.getByRole('button', { name: /remove aaron judge/i }),
        ).toBeVisible();
      },
    );

    adminTest(
      'remove button data-testid matches the player id',
      async ({ page }) => {
        await expect(page.getByTestId('remove-player-1')).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: empty slot placeholders @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – empty slot placeholders @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockGraphQL(page);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();
    });

    adminTest(
      'adding one player shows three empty slot placeholders',
      async ({ page }) => {
        await addPlayer(page, 'Aa', 'Aaron Judge');
        const container = page.getByLabel('Selected players');
        await expect(container.getByText(/slot.*empty/i)).toHaveCount(3);
      },
    );

    adminTest(
      'adding two players shows two empty slot placeholders',
      async ({ page }) => {
        await addPlayer(page, 'Aa', 'Aaron Judge');
        await addPlayer(page, 'Sh', 'Shohei Ohtani');
        const container = page.getByLabel('Selected players');
        await expect(container.getByText(/slot.*empty/i)).toHaveCount(2);
      },
    );

    adminTest(
      'adding three players shows one empty slot placeholder',
      async ({ page }) => {
        await addPlayer(page, 'Aa', 'Aaron Judge');
        await addPlayer(page, 'Sh', 'Shohei Ohtani');
        await addPlayer(page, 'Mo', 'Mookie Betts');
        const container = page.getByLabel('Selected players');
        await expect(container.getByText(/slot.*empty/i)).toHaveCount(1);
      },
    );

    adminTest(
      'adding four players shows no empty slot placeholders',
      async ({ page }) => {
        await addPlayer(page, 'Aa', 'Aaron Judge');
        await addPlayer(page, 'Sh', 'Shohei Ohtani');
        await addPlayer(page, 'Mo', 'Mookie Betts');
        await addPlayer(page, 'Mi', 'Miguel Cabrera');
        const container = page.getByLabel('Selected players');
        await expect(container.getByText(/slot.*empty/i)).toHaveCount(0);
      },
    );

    adminTest(
      'all four player chips appear when four players are added',
      async ({ page }) => {
        await addPlayer(page, 'Aa', 'Aaron Judge');
        await addPlayer(page, 'Sh', 'Shohei Ohtani');
        await addPlayer(page, 'Mo', 'Mookie Betts');
        await addPlayer(page, 'Mi', 'Miguel Cabrera');
        await expect(page.getByTestId('selected-chip-1')).toBeVisible();
        await expect(page.getByTestId('selected-chip-2')).toBeVisible();
        await expect(page.getByTestId('selected-chip-3')).toBeVisible();
        await expect(page.getByTestId('selected-chip-4')).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: slot-based accent colors @regression
// ---------------------------------------------------------------------------

adminTest.describe('Player Comparison – slot accent colors @regression', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
    await expect(page.getByLabel('Search players to compare')).toBeVisible();
  });

  adminTest(
    'slot 0 chip (gold) has gold accent border color',
    async ({ page }) => {
      await addPlayer(page, 'Aa', 'Aaron Judge');
      const chip = page.getByTestId('selected-chip-1');
      await expect(chip).toHaveCSS(
        'border-top-color',
        'rgba(197, 165, 90, 0.5)',
      );
    },
  );

  adminTest(
    'slot 1 chip (blue) has blue accent border color',
    async ({ page }) => {
      await addPlayer(page, 'Aa', 'Aaron Judge');
      await addPlayer(page, 'Sh', 'Shohei Ohtani');
      const chip = page.getByTestId('selected-chip-2');
      await expect(chip).toHaveCSS(
        'border-top-color',
        'rgba(96, 165, 250, 0.5)',
      );
    },
  );

  adminTest(
    'slot 2 chip (green) has green accent border color',
    async ({ page }) => {
      await addPlayer(page, 'Aa', 'Aaron Judge');
      await addPlayer(page, 'Sh', 'Shohei Ohtani');
      await addPlayer(page, 'Mo', 'Mookie Betts');
      const chip = page.getByTestId('selected-chip-3');
      await expect(chip).toHaveCSS(
        'border-top-color',
        'rgba(52, 211, 153, 0.5)',
      );
    },
  );

  adminTest(
    'slot 3 chip (red) has red accent border color',
    async ({ page }) => {
      await addPlayer(page, 'Aa', 'Aaron Judge');
      await addPlayer(page, 'Sh', 'Shohei Ohtani');
      await addPlayer(page, 'Mo', 'Mookie Betts');
      await addPlayer(page, 'Mi', 'Miguel Cabrera');
      const chip = page.getByTestId('selected-chip-4');
      await expect(chip).toHaveCSS(
        'border-top-color',
        'rgba(248, 113, 113, 0.5)',
      );
    },
  );

  adminTest(
    'slot 0 chip has gold accent dot background color',
    async ({ page }) => {
      await addPlayer(page, 'Aa', 'Aaron Judge');
      const chip = page.getByTestId('selected-chip-1');
      // The accent dot is the first child div inside the chip
      const dot = chip.locator('div').first();
      await expect(dot).toHaveCSS('background-color', 'rgb(197, 165, 90)');
    },
  );

  adminTest(
    'slot 1 chip has blue accent dot background color',
    async ({ page }) => {
      await addPlayer(page, 'Aa', 'Aaron Judge');
      await addPlayer(page, 'Sh', 'Shohei Ohtani');
      const chip = page.getByTestId('selected-chip-2');
      const dot = chip.locator('div').first();
      await expect(dot).toHaveCSS('background-color', 'rgb(96, 165, 250)');
    },
  );
});

// ---------------------------------------------------------------------------
// Tests: slot color stability after player removal @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – slot color stability after removal @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockGraphQL(page);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();
    });

    adminTest(
      'second slot player retains blue accent after first slot player is removed',
      async ({ page }) => {
        // Add two players: Judge to slot 0 (gold), Ohtani to slot 1 (blue)
        await addPlayer(page, 'Aa', 'Aaron Judge');
        await addPlayer(page, 'Sh', 'Shohei Ohtani');

        // Verify Ohtani's chip is initially blue (slot 1)
        const ohtaniChip = page.getByTestId('selected-chip-2');
        await expect(ohtaniChip).toHaveCSS(
          'border-top-color',
          'rgba(96, 165, 250, 0.5)',
        );

        // Remove Judge (slot 0 — the gold chip)
        await page.getByRole('button', { name: /remove aaron judge/i }).click();
        await expect(page.getByTestId('selected-chip-1')).not.toBeVisible();

        // Ohtani's chip must still be blue (slot 1) — not promoted to gold
        await expect(ohtaniChip).toHaveCSS(
          'border-top-color',
          'rgba(96, 165, 250, 0.5)',
        );
      },
    );

    adminTest(
      'third slot player retains green accent after second slot player is removed',
      async ({ page }) => {
        await addPlayer(page, 'Aa', 'Aaron Judge');
        await addPlayer(page, 'Sh', 'Shohei Ohtani');
        await addPlayer(page, 'Mo', 'Mookie Betts');

        // Betts is in slot 2 (green)
        const bettsChip = page.getByTestId('selected-chip-3');
        await expect(bettsChip).toHaveCSS(
          'border-top-color',
          'rgba(52, 211, 153, 0.5)',
        );

        // Remove Ohtani (slot 1)
        await page
          .getByRole('button', { name: /remove shohei ohtani/i })
          .click();
        await expect(page.getByTestId('selected-chip-2')).not.toBeVisible();

        // Betts must still be green (slot 2 unchanged)
        await expect(bettsChip).toHaveCSS(
          'border-top-color',
          'rgba(52, 211, 153, 0.5)',
        );
      },
    );

    adminTest(
      'removing a player restores the correct number of empty slot placeholders',
      async ({ page }) => {
        await addPlayer(page, 'Aa', 'Aaron Judge');
        await addPlayer(page, 'Sh', 'Shohei Ohtani');

        // 2 players → 2 empty placeholders
        const container = page.getByLabel('Selected players');
        await expect(container.getByText(/slot.*empty/i)).toHaveCount(2);

        // Remove one player → 3 empty placeholders
        await page.getByRole('button', { name: /remove aaron judge/i }).click();
        await expect(container.getByText(/slot.*empty/i)).toHaveCount(3);
      },
    );
  },
);
