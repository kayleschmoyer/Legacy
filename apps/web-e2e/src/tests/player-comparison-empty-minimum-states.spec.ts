/**
 * Player Comparison Page E2E Tests — Empty & Minimum-Selection States (LS-5572)
 *
 * QA Feature Story under epic LS-5286 (QA — Page: Player Comparison).
 *
 * Covers the three player-count states before/at minimum selection:
 *   - 0 players: large dashed empty-state card ("Nobody on deck yet")
 *   - 1 player: minimum-selection nudge ("One player on deck.") + no comparison table
 *   - 2+ players: empty state and nudge are gone; comparison table appears
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { adminTest, test } from '../fixtures/pages';
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

/** Sets up GraphQL mocks for player search and season stats; falls back to baseline for everything else. */
async function mockGraphQL(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route).toLowerCase();

      if (op === 'getplayerswithstats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { players: MOCK_PLAYERS } }),
        });
      } else if (op === 'getcomparisonseasonstats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              slot0Batting: [],
              slot0Pitching: [],
              slot1Batting: [],
              slot1Pitching: [],
              slot2Batting: [],
              slot2Pitching: [],
              slot3Batting: [],
              slot3Pitching: [],
            },
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Tests: 0-player empty state @smoke
// ---------------------------------------------------------------------------

test.describe('Player Comparison – empty state (0 players) @smoke', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockGraphQL(page);
    await playersPage.gotoCompare();
  });

  test('shows the empty-state card when no players are selected', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectStatusVisible();
  });

  test('empty-state card contains "Nobody on deck yet" heading', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectEmptyStateHeading();
  });

  test('empty-state card prompts user to add at least two players', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectEmptyStatePrompt();
  });

  test('comparison table is not shown when 0 players are selected', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectTableHidden();
  });

  test('search input is visible and enabled in empty state', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectSearchVisible();
    await playersPage.compare.expectSearchEnabled();
  });
});

// ---------------------------------------------------------------------------
// Tests: 1-player minimum-selection state @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – minimum-selection state (1 player) @regression',
  () => {
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
    });

    adminTest(
      'shows "One player on deck." nudge after selecting first player',
      async ({ playersPage }) => {
        await playersPage.compare.expectOnePlayerNudge();
      },
    );

    adminTest(
      'nudge tells user to add at least one more for head-to-head',
      async ({ playersPage }) => {
        await playersPage.compare.expectAddOneMoreHint();
      },
    );

    adminTest(
      'empty-state card is not shown when 1 player is selected',
      async ({ playersPage }) => {
        await playersPage.compare.expectEmptyStateHidden();
      },
    );

    adminTest(
      'comparison table is not shown when only 1 player is selected',
      async ({ playersPage }) => {
        await playersPage.compare.expectTableHidden();
      },
    );

    adminTest(
      '"Head-to-Head" section heading is not shown with 1 player',
      async ({ playersPage }) => {
        await playersPage.compare.expectHeadToHeadHidden();
      },
    );

    adminTest(
      'search input remains enabled with 1 player selected',
      async ({ playersPage }) => {
        await playersPage.compare.expectSearchEnabled();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: 2-player transition — empty state and nudge resolve @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – comparison unlocks at 2 players @regression',
  () => {
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
    });

    adminTest(
      'empty-state card is not shown when 2 players are selected',
      async ({ playersPage }) => {
        await playersPage.compare.expectEmptyStateHidden();
      },
    );

    adminTest(
      'one-player nudge is not shown when 2 players are selected',
      async ({ playersPage }) => {
        await playersPage.compare.expectOnePlayerNudgeHidden();
      },
    );

    adminTest(
      'comparison table appears once 2 players are selected',
      async ({ playersPage }) => {
        await playersPage.compare.expectTableVisible();
      },
    );

    adminTest(
      '"Head-to-Head" section heading appears with 2 players',
      async ({ playersPage }) => {
        await playersPage.compare.expectHeadToHeadVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: Removing a player restores the minimum-selection state @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – removing a player restores minimum state @regression',
  () => {
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      // Add two players to reach full comparison, then remove one
      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
      await playersPage.compare.removePlayer('Aaron Judge');
    });

    adminTest(
      'nudge reappears after dropping back to 1 player',
      async ({ playersPage }) => {
        await playersPage.compare.expectOnePlayerNudge();
      },
    );

    adminTest(
      'comparison table is hidden after dropping back to 1 player',
      async ({ playersPage }) => {
        await playersPage.compare.expectTableHidden();
      },
    );

    adminTest(
      'removing the final player restores the empty-state card',
      async ({ playersPage }) => {
        await playersPage.compare.removePlayer('Shohei Ohtani');
        await playersPage.compare.expectEmptyStateHeading();
      },
    );
  },
);
