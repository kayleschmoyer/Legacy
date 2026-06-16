/**
 * Player Comparison Page E2E Tests — Career Achievements (LS-5569)
 *
 * Covers the Career Achievements section of /players/compare:
 *   - All six achievement stat row labels are rendered
 *   - Correct integer values are displayed per player
 *   - "BEST" indicator appears on the column with the highest value per row
 *   - Tied achievement values produce no "BEST" indicator
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { adminTest } from '../fixtures/pages';
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
      battingScore: 74,
      pitchingScore: 0,
      fieldingScore: 9,
      hitterScore: 74,
      hitterAvgPointsPerGame: 1.95,
      pitchingAvgPointsPerGame: 0,
      totalScore: 810,
      careerGames: 1050,
      avgPointsPerGame: 1.95,
    },
    averageSeasonBatting: {
      seasons: 11,
      games: 95,
      atBats: 375,
      runs: 64,
      hits: 110,
      homeRuns: 18,
      rbi: 53,
      stolenBases: 11,
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
      hitByPitch: 25,
      sacrificeHits: 5,
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
];

function makeMockPlayersResponse(players = MOCK_PLAYERS) {
  return { data: { players } };
}

/** Sets up GraphQL mocks for the Player Comparison page. */
async function mockGraphQL(page: import('@playwright/test').Page) {
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
      } else if (op === 'getallplayerseasonstats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              player: { eligiblePositions: [], firstName: '', lastName: '' },
              playerSeasonBatting: [],
              playerSeasonPitching: [],
              playerSeasonFielding: [],
            },
          }),
        });
      } else if (op === 'getmysubscription') {
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

// ---------------------------------------------------------------------------
// Tests: Achievement stat row labels @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – career achievements row labels @regression',
  () => {
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
    });

    adminTest('shows All-Star Selections row', async ({ playersPage }) => {
      await playersPage.compare.expectText('All-Star Selections');
    });

    adminTest('shows MVP Awards row', async ({ playersPage }) => {
      await playersPage.compare.expectText('MVP Awards');
    });

    adminTest('shows Cy Young Awards row', async ({ playersPage }) => {
      await playersPage.compare.expectText('Cy Young Awards');
    });

    adminTest('shows Gold Gloves row', async ({ playersPage }) => {
      await playersPage.compare.expectText('Gold Gloves');
    });

    adminTest('shows Silver Sluggers row', async ({ playersPage }) => {
      await playersPage.compare.expectText('Silver Sluggers');
    });

    adminTest('shows World Series Rings row', async ({ playersPage }) => {
      await playersPage.compare.expectText('World Series Rings');
    });
  },
);

// ---------------------------------------------------------------------------
// Tests: Achievement stat values (two-player comparison) @regression
//
// Judge:  allStar=5  mvp=2  cyYoung=0  goldGlove=0  silverSlugger=3  rings=1
// Ohtani: allStar=4  mvp=2  cyYoung=0  goldGlove=0  silverSlugger=2  rings=0
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – career achievements stat values @regression',
  () => {
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
    });

    adminTest(
      'All-Star Selections row shows correct values (5 and 4)',
      async ({ playersPage }) => {
        await playersPage.compare.expectValueInRow('All-Star Selections', '5');
        await playersPage.compare.expectValueInRow('All-Star Selections', '4');
      },
    );

    adminTest(
      'MVP Awards row shows correct values (2 and 2)',
      async ({ playersPage }) => {
        await playersPage.compare.expectValueCountInRow('MVP Awards', '2', 2);
      },
    );

    adminTest(
      'Silver Sluggers row shows correct values (3 and 2)',
      async ({ playersPage }) => {
        await playersPage.compare.expectValueInRow('Silver Sluggers', '3');
        await playersPage.compare.expectValueInRow('Silver Sluggers', '2');
      },
    );

    adminTest(
      'World Series Rings row shows correct values (1 and 0)',
      async ({ playersPage }) => {
        await playersPage.compare.expectValueInRow('World Series Rings', '1');
        await playersPage.compare.expectValueInRow('World Series Rings', '0');
      },
    );

    adminTest(
      'Cy Young Awards row shows correct values (0 and 0)',
      async ({ playersPage }) => {
        await playersPage.compare.expectValueCountInRow(
          'Cy Young Awards',
          '0',
          2,
        );
      },
    );

    adminTest(
      'Gold Gloves row shows correct values (0 and 0)',
      async ({ playersPage }) => {
        await playersPage.compare.expectValueCountInRow('Gold Gloves', '0', 2);
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: "BEST" indicator — leader gets BEST, ties get no BEST @regression
//
// Judge vs Ohtani:
//   All-Star Selections: Judge=5 (BEST)
//   MVP Awards:          2 vs 2  → tied (no BEST)
//   Cy Young Awards:     0 vs 0  → tied (no BEST)
//   Gold Gloves:         0 vs 0  → tied (no BEST)
//   Silver Sluggers:     Judge=3 (BEST)
//   World Series Rings:  Judge=1 (BEST)
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – career achievements BEST indicator @regression',
  () => {
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
    });

    adminTest(
      'All-Star Selections: BEST indicator shown for the leader',
      async ({ playersPage }) => {
        await playersPage.compare.expectBestInRow('All-Star Selections');
      },
    );

    adminTest(
      'Silver Sluggers: BEST indicator shown for the leader',
      async ({ playersPage }) => {
        await playersPage.compare.expectBestInRow('Silver Sluggers');
      },
    );

    adminTest(
      'World Series Rings: BEST indicator shown for the leader',
      async ({ playersPage }) => {
        await playersPage.compare.expectBestInRow('World Series Rings');
      },
    );

    adminTest(
      'MVP Awards: no BEST indicator when tied (2 vs 2)',
      async ({ playersPage }) => {
        await playersPage.compare.expectNoBestInRow('MVP Awards');
      },
    );

    adminTest(
      'Cy Young Awards: no BEST indicator when tied (0 vs 0)',
      async ({ playersPage }) => {
        await playersPage.compare.expectNoBestInRow('Cy Young Awards');
      },
    );

    adminTest(
      'Gold Gloves: no BEST indicator when tied (0 vs 0)',
      async ({ playersPage }) => {
        await playersPage.compare.expectNoBestInRow('Gold Gloves');
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: Three-player achievements comparison @regression
//
// Judge:  allStar=5  mvp=2  cyYoung=0  goldGlove=0  silverSlugger=3  rings=1
// Ohtani: allStar=4  mvp=2  cyYoung=0  goldGlove=0  silverSlugger=2  rings=0
// Betts:  allStar=6  mvp=1  cyYoung=0  goldGlove=5  silverSlugger=4  rings=2
//
// All-Star Selections:  Betts=6 (BEST)
// MVP Awards:           Judge=2, Ohtani=2, Betts=1 → tied at top (no BEST)
// Cy Young Awards:      0, 0, 0 → all tied (no BEST)
// Gold Gloves:          Betts=5 (BEST)
// Silver Sluggers:      Betts=4 (BEST)
// World Series Rings:   Betts=2 (BEST)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tests: Cy Young row hidden for hitter vs hitter (LS-7003) @regression
//
// Judge and Betts both have careerPitching: null — hasPitching is false, so
// the Cy Young Awards row must not appear.
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – Cy Young row hidden for hitter vs hitter (LS-7003) @regression',
  () => {
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Mo', 'Mookie Betts');
    });

    adminTest(
      'Cy Young Awards row is not rendered when neither player has pitched',
      async ({ playersPage }) => {
        await playersPage.compare.expectTextHidden('Cy Young Awards');
      },
    );

    adminTest(
      'other achievement rows are still visible when neither player has pitched',
      async ({ playersPage }) => {
        await playersPage.compare.expectText('All-Star Selections');
        await playersPage.compare.expectText('MVP Awards');
        await playersPage.compare.expectText('Gold Gloves');
        await playersPage.compare.expectText('Silver Sluggers');
        await playersPage.compare.expectText('World Series Rings');
      },
    );
  },
);

adminTest.describe(
  'Player Comparison – career achievements three-player comparison @regression',
  () => {
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
      await playersPage.compare.addPlayer('Mo', 'Mookie Betts');
    });

    adminTest(
      'All-Star Selections: BEST shown for Betts (6 > 5, 4)',
      async ({ playersPage }) => {
        await playersPage.compare.expectValueInRow('All-Star Selections', '6');
        await playersPage.compare.expectBestInRow('All-Star Selections');
      },
    );

    adminTest(
      'Gold Gloves: BEST shown for Betts (5 > 0, 0)',
      async ({ playersPage }) => {
        await playersPage.compare.expectValueInRow('Gold Gloves', '5');
        await playersPage.compare.expectBestInRow('Gold Gloves');
      },
    );

    adminTest(
      'Silver Sluggers: BEST shown for Betts (4 > 3, 2)',
      async ({ playersPage }) => {
        await playersPage.compare.expectValueInRow('Silver Sluggers', '4');
        await playersPage.compare.expectBestInRow('Silver Sluggers');
      },
    );

    adminTest(
      'World Series Rings: BEST shown for Betts (2 > 1, 0)',
      async ({ playersPage }) => {
        await playersPage.compare.expectValueInRow('World Series Rings', '2');
        await playersPage.compare.expectBestInRow('World Series Rings');
      },
    );

    adminTest(
      'MVP Awards: no BEST when top two are tied (Judge=2, Ohtani=2)',
      async ({ playersPage }) => {
        await playersPage.compare.expectNoBestInRow('MVP Awards');
      },
    );
  },
);
