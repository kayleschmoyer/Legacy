/**
 * Player Comparison Page E2E Tests — Stats & Charts (LS-599)
 *
 * Extends LS-676 coverage with:
 *   - Season-by-season breakdown tables (batting & pitching)
 *   - Career pitching comparison rows (when pitcher selected)
 *   - Stat value verification & "▲ best" highlighting
 *   - Max players (4/4) behavior — search disabled
 *   - Empty state card ("No players selected")
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { adminTest, expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

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
  {
    __typename: 'Player',
    id: 4,
    firstName: 'Mike',
    lastName: 'Trout',
    brefId: 'troutmi01',
    eligiblePositions: ['CF'],
    primaryEra: 'modern',
    scoring: {
      __typename: 'PlayerScoring',
      battingScore: 88,
      pitchingScore: 0,
      fieldingScore: 4,
      hitterScore: 82,
      hitterAvgPointsPerGame: 2.3,
      pitchingAvgPointsPerGame: 0,
      totalScore: 920,
      careerGames: 1200,
      avgPointsPerGame: 2.3,
    },
    averageSeasonBatting: {
      seasons: 13,
      games: 92,
      atBats: 350,
      runs: 70,
      hits: 105,
      homeRuns: 26,
      rbi: 68,
      stolenBases: 15,
      battingAverage: 0.301,
      onBasePercentage: 0.412,
      sluggingPercentage: 0.585,
    },
    careerBatting: {
      games: 1200,
      runs: 910,
      homeRuns: 340,
      rbi: 880,
      stolenBases: 200,
      hits: 1200,
      atBats: 3990,
      plateAppearances: 4900,
      baseOnBalls: 700,
      hitByPitch: 40,
      sacrificeHits: 0,
      totalBases: 2200,
      offensiveWAR: 85.0,
    },
    careerPitching: null,
    careerAchievements: {
      allStarSelections: 11,
      mvpAwards: 3,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 9,
      worldSeriesRings: 0,
      hallOfFame: false,
      rookieOfTheYear: true,
    },
  },
];

/** Mock season batting data for Ohtani (player id 2) */
const MOCK_SEASON_BATTING = [
  {
    season: 2021,
    team: 'LAA',
    games: 155,
    plateAppearances: 639,
    atBats: 537,
    runs: 103,
    hits: 138,
    doubles: 26,
    triples: 8,
    homeRuns: 46,
    rbi: 100,
    stolenBases: 26,
    caughtStealing: 10,
    baseOnBalls: 96,
    strikeouts: 189,
    battingAverage: 0.257,
    onBasePercentage: 0.372,
    sluggingPercentage: 0.592,
  },
  {
    season: 2022,
    team: 'LAA',
    games: 157,
    plateAppearances: 666,
    atBats: 586,
    runs: 90,
    hits: 160,
    doubles: 30,
    triples: 6,
    homeRuns: 34,
    rbi: 95,
    stolenBases: 11,
    caughtStealing: 3,
    baseOnBalls: 72,
    strikeouts: 161,
    battingAverage: 0.273,
    onBasePercentage: 0.356,
    sluggingPercentage: 0.519,
  },
];

/** Mock season pitching data for Ohtani (player id 2) */
const MOCK_SEASON_PITCHING = [
  {
    season: 2021,
    team: 'LAA',
    games: 23,
    wins: 9,
    losses: 2,
    gamesStarted: 23,
    completeGames: 0,
    shutouts: 0,
    saves: 0,
    inningsPitched: 130.1,
    hits: 98,
    runs: 44,
    earnedRuns: 40,
    homeRuns: 15,
    baseOnBalls: 44,
    strikeouts: 156,
    earnedRunAverage: '3.18',
    whip: 1.09,
  },
  {
    season: 2022,
    team: 'LAA',
    games: 28,
    wins: 15,
    losses: 9,
    gamesStarted: 28,
    completeGames: 2,
    shutouts: 1,
    saves: 0,
    inningsPitched: 166.0,
    hits: 120,
    runs: 55,
    earnedRuns: 50,
    homeRuns: 18,
    baseOnBalls: 44,
    strikeouts: 219,
    earnedRunAverage: '2.33',
    whip: 1.01,
  },
];

/** Mock season batting data for Judge (player id 1) */
const MOCK_JUDGE_SEASON_BATTING = [
  {
    season: 2022,
    team: 'NYY',
    games: 157,
    plateAppearances: 696,
    atBats: 570,
    runs: 133,
    hits: 177,
    doubles: 28,
    triples: 0,
    homeRuns: 62,
    rbi: 131,
    stolenBases: 16,
    caughtStealing: 3,
    baseOnBalls: 111,
    strikeouts: 175,
    battingAverage: 0.311,
    onBasePercentage: 0.425,
    sluggingPercentage: 0.686,
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

function makeMockSeasonStatsResponse(
  playerId: number,
  opts?: {
    batting?: typeof MOCK_SEASON_BATTING;
    pitching?: typeof MOCK_SEASON_PITCHING;
  },
) {
  // Return realistic season data for player 2 (Ohtani) and player 1 (Judge)
  if (playerId === 2) {
    return {
      data: {
        player: {
          eligiblePositions: ['SP', 'DH'],
          firstName: 'Shohei',
          lastName: 'Ohtani',
        },
        playerSeasonBatting: opts?.batting ?? MOCK_SEASON_BATTING,
        playerSeasonPitching: opts?.pitching ?? MOCK_SEASON_PITCHING,
        playerSeasonFielding: [],
      },
    };
  }
  if (playerId === 1) {
    return {
      data: {
        player: {
          eligiblePositions: ['OF'],
          firstName: 'Aaron',
          lastName: 'Judge',
        },
        playerSeasonBatting: opts?.batting ?? MOCK_JUDGE_SEASON_BATTING,
        playerSeasonPitching: [],
        playerSeasonFielding: [],
      },
    };
  }
  // Default — empty season stats
  return {
    data: {
      player: { eligiblePositions: [], firstName: '', lastName: '' },
      playerSeasonBatting: [],
      playerSeasonPitching: [],
      playerSeasonFielding: [],
    },
  };
}

/** Sets up GraphQL mocks with full season stats support. */
async function mockGraphQL(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const body = route.request().postData() ?? '';
      const postData = body.toLowerCase();

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
        // Extract playerId from the request body
        let playerId = 0;
        try {
          const parsed = JSON.parse(body) as {
            variables?: { playerId?: unknown };
          };
          const rawId = parsed.variables?.playerId;
          if (typeof rawId === 'number') {
            playerId = rawId;
          } else if (typeof rawId === 'string') {
            const numId = Number.parseInt(rawId, 10);
            if (!Number.isNaN(numId)) playerId = numId;
          }
        } catch {
          // Fall back to regex if JSON parse fails
          const match = body.match(/"playerId"\s*:\s*(\d+)/);
          if (match?.[1]) playerId = Number(match[1]);
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeMockSeasonStatsResponse(playerId)),
        });
      } else if (
        postData.includes('getmysubscription') ||
        postData.includes('mysubscription')
      ) {
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
        // Fall through to the baseline _apiIsolation fixture for ambient
        // queries (getUnreadNotificationCount, getUserById, etc.)
        await unmockedGraphQLFallback(route);
      }
    },
  );
}

/** Helper to add players by searching and clicking. */
async function addPlayer(
  page: import('@playwright/test').Page,
  searchTerm: string,
  fullName: string,
) {
  const input = page.getByLabel('Search players to compare');
  await expect(async () => {
    // Clear, focus, and fill — keeps the dropdown open after typing
    await input.clear();
    await input.focus();
    await input.fill(searchTerm);
    await page.waitForTimeout(300);
    await page.getByText(fullName).click({ timeout: 5000 });
  }).toPass({ timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Tests: Empty state card @smoke
// ---------------------------------------------------------------------------

test.describe('Player Comparison – empty state @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await mockGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
  });

  test('shows "No players selected" empty state card', async ({ page }) => {
    await expect(page.getByText('No players selected')).toBeVisible();
  });

  test('shows draft preparation hint in empty state', async ({ page }) => {
    await expect(
      page.getByText(/draft preparation and free agent evaluation/i),
    ).toBeVisible();
  });

  test('empty state disappears after adding first player', async ({ page }) => {
    await addPlayer(page, 'Aa', 'Aaron Judge');
    await expect(page.getByText('No players selected')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Career pitching rows @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – career pitching section @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockGraphQL(page);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();

      // Add Judge (no pitching) and Ohtani (has pitching)
      await addPlayer(page, 'Aa', 'Aaron Judge');
      await addPlayer(page, 'Sh', 'Shohei Ohtani');
    });

    adminTest(
      'shows Career Pitching section when pitcher is selected',
      async ({ page }) => {
        await expect(page.getByText(/career pitching/i)).toBeVisible();
      },
    );

    adminTest('shows pitching stat rows (Wins, ERA)', async ({ page }) => {
      await expect(page.getByText('Wins')).toBeVisible();
      await expect(page.getByText('ERA').first()).toBeVisible();
    });

    adminTest(
      'shows Strikeouts and Win % in pitching section',
      async ({ page }) => {
        await expect(page.getByText('Strikeouts')).toBeVisible();
        await expect(page.getByText('Win %')).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: Stat value verification & "best" highlighting @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – stat values & best highlighting @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockGraphQL(page);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();

      // Add Judge and Ohtani
      await addPlayer(page, 'Aa', 'Aaron Judge');
      await addPlayer(page, 'Sh', 'Shohei Ohtani');
    });

    adminTest(
      'displays "▲ best" indicator for the leading stat',
      async ({ page }) => {
        // At least one "▲ best" should be visible in the comparison table
        await expect(page.getByText('▲ best').first()).toBeVisible();
      },
    );

    adminTest(
      'shows correct Fantasy Score values for each player',
      async ({ page }) => {
        // Judge has totalScore 850.0, Ohtani has 960.0
        await expect(page.getByText('850.0')).toBeVisible();
        await expect(page.getByText('960.0')).toBeVisible();
      },
    );

    adminTest(
      'shows correct Avg Pts / Game values for each player',
      async ({ page }) => {
        // Judge: 2.1, Ohtani: 2.6
        await expect(page.getByText('2.1').first()).toBeVisible();
        await expect(page.getByText('2.6').first()).toBeVisible();
      },
    );

    adminTest(
      'Ohtani shows non-zero Pitcher Score; Judge shows 0',
      async ({ page }) => {
        // Pitcher Score row: Judge 0.0, Ohtani 60.0
        await expect(page.getByText('0.0').first()).toBeVisible();
        await expect(page.getByText('60.0').first()).toBeVisible();
      },
    );

    adminTest('shows Home Runs career stat values', async ({ page }) => {
      // Judge: 220, Ohtani: 175
      await expect(page.getByText('220').first()).toBeVisible();
      await expect(page.getByText('175').first()).toBeVisible();
    });
  },
);

// ---------------------------------------------------------------------------
// Tests: Season-by-season breakdown tables @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – season-by-season breakdown @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockGraphQL(page);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();

      // Add Judge and Ohtani (Ohtani has season batting + pitching data)
      await addPlayer(page, 'Aa', 'Aaron Judge');
      await addPlayer(page, 'Sh', 'Shohei Ohtani');
    });

    adminTest('shows Season-by-Season Breakdown heading', async ({ page }) => {
      await expect(page.getByText('Season-by-Season Breakdown')).toBeVisible();
    });

    adminTest('shows Batting by Season table for Judge', async ({ page }) => {
      await expect(
        page.getByText('Aaron Judge — Batting by Season'),
      ).toBeVisible();
    });

    adminTest('shows Batting by Season table for Ohtani', async ({ page }) => {
      await expect(
        page.getByText('Shohei Ohtani — Batting by Season'),
      ).toBeVisible();
    });

    adminTest('shows Pitching by Season table for Ohtani', async ({ page }) => {
      await expect(
        page.getByText('Shohei Ohtani — Pitching by Season'),
      ).toBeVisible();
    });

    adminTest(
      'does NOT show Pitching by Season table for Judge (non-pitcher)',
      async ({ page }) => {
        await expect(
          page.getByText('Aaron Judge — Pitching by Season'),
        ).not.toBeVisible();
      },
    );

    adminTest(
      'season batting table shows column headers (Year, G, AB, H, HR, etc.)',
      async ({ page }) => {
        // Locate within the season breakdown section
        const seasonSection = page.getByText('Season-by-Season Breakdown');
        await expect(seasonSection).toBeVisible();

        // Column headers for batting table
        await expect(page.getByText('Year').first()).toBeVisible();
        // AB and HR appear in the batting table headers
        await expect(page.getByText('AB').first()).toBeVisible();
        await expect(page.getByText('AVG').first()).toBeVisible();
      },
    );

    adminTest(
      'Ohtani season batting table contains 2021 season row data',
      async ({ page }) => {
        // 2021 season: 155 games, 46 HR, .257 AVG
        await expect(page.getByText('2021').first()).toBeVisible();
      },
    );

    adminTest(
      'Ohtani season pitching table shows pitching headers',
      async ({ page }) => {
        // Scope to the pitching section to avoid matching career pitching comparison
        const pitchingSection = page
          .getByText('Shohei Ohtani — Pitching by Season')
          .locator('..');

        await expect(pitchingSection).toBeVisible();
        await expect(pitchingSection.getByText('ERA').first()).toBeVisible();
        await expect(pitchingSection.getByText('SO').first()).toBeVisible();
        await expect(pitchingSection.getByText('WHIP').first()).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: Max players (4/4) behavior @regression
// ---------------------------------------------------------------------------

adminTest.describe('Player Comparison – max players (4/4) @regression', () => {
  // Adding 4 players sequentially requires more time than the default 20s
  adminTest.setTimeout(60000);

  adminTest.beforeEach(async ({ page }) => {
    await mockGraphQL(page);
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
    await expect(page.getByLabel('Search players to compare')).toBeVisible();

    // Add all 4 players
    await addPlayer(page, 'Aa', 'Aaron Judge');
    await addPlayer(page, 'Sh', 'Shohei Ohtani');
    await addPlayer(page, 'Mo', 'Mookie Betts');
    await addPlayer(page, 'Mi', 'Mike Trout');
  });

  adminTest('shows 4/4 player count', async ({ page }) => {
    await expect(page.getByText(/Select Players \(4\/4\)/)).toBeVisible();
  });

  adminTest(
    'search input shows "Max 4 players selected" placeholder when at capacity',
    async ({ page }) => {
      await expect(
        page.getByPlaceholder('Max 4 players selected'),
      ).toBeVisible();
    },
  );

  adminTest(
    'search input is disabled when at max capacity',
    async ({ page }) => {
      const input = page.getByPlaceholder('Max 4 players selected');
      await expect(input).toBeDisabled();
    },
  );

  adminTest(
    'all four player names appear in comparison header',
    async ({ page }) => {
      await expect(page.getByText('Aaron Judge').first()).toBeVisible();
      await expect(page.getByText('Shohei Ohtani').first()).toBeVisible();
      await expect(page.getByText('Mookie Betts').first()).toBeVisible();
      await expect(page.getByText('Mike Trout').first()).toBeVisible();
    },
  );

  adminTest('removing a player re-enables search (3/4)', async ({ page }) => {
    await page.getByRole('button', { name: /remove mookie betts/i }).click();
    await expect(page.getByText(/Select Players \(3\/4\)/)).toBeVisible();
    await expect(page.getByPlaceholder('Search for a player…')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Three-player comparison @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – three players comparison @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockGraphQL(page);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();

      // Add Judge, Ohtani, and Betts
      await addPlayer(page, 'Aa', 'Aaron Judge');
      await addPlayer(page, 'Sh', 'Shohei Ohtani');
      await addPlayer(page, 'Mo', 'Mookie Betts');
    });

    adminTest(
      'shows comparison table with 3 player columns',
      async ({ page }) => {
        await expect(page.getByText('Aaron Judge').first()).toBeVisible();
        await expect(page.getByText('Shohei Ohtani').first()).toBeVisible();
        await expect(page.getByText('Mookie Betts').first()).toBeVisible();
      },
    );

    adminTest(
      'shows 3/4 count and search remains enabled',
      async ({ page }) => {
        await expect(page.getByText(/Select Players \(3\/4\)/)).toBeVisible();
        await expect(
          page.getByPlaceholder('Search for a player…'),
        ).toBeVisible();
      },
    );
  },
);
