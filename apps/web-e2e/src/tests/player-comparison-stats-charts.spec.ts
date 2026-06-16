/**
 * Player Comparison Page E2E Tests — Stats & Charts (LS-599)
 *
 * Extends LS-676 coverage with:
 *   - Season-by-season breakdown tables (batting & pitching)
 *   - Career pitching comparison rows (when pitcher selected)
 *   - Stat value verification & "▲ best" highlighting
 *   - Max players (4/4) behavior — search disabled
 *   - Empty state card ("No players selected")
 *   - Career batting comparison rows (LS-5570)
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { adminTest, expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      strikeouts: 1200,
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
      strikeouts: 950,
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
      strikeouts: 800,
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
      strikeouts: 1500,
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

/**
 * Ohtani batting across six seasons (2020–2025) — exercises the expand toggle
 * (LS-7034). Collapsed, only the four most recent (2025–2022) render; expanding
 * reveals 2021 and 2020.
 */
const MOCK_OHTANI_MANY_BATTING = [2025, 2024, 2023, 2022, 2021, 2020].map(
  (season, i) => ({
    ...MOCK_SEASON_BATTING[0],
    season,
    // Vary games slightly so each row is distinguishable.
    games: 150 + i,
  }),
);

function makeMockPlayersResponse(players = MOCK_PLAYERS) {
  return { data: { players } };
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

/**
 * Build a batched GetComparisonSeasonStats response (LS-7033) from the request
 * variables. For each filled slot (`hasN === true`), the player's per-slot
 * batting/pitching are aliased as `slotNBatting` / `slotNPitching`, reusing the
 * single-player mock data keyed by `idN`. Per-player `seasonOverrides` (keyed by
 * player id) are threaded through to exercise the expand-all-seasons toggle
 * (LS-7034).
 */
function makeMockComparisonSeasonStatsResponse(
  variables: Record<string, unknown>,
  seasonOverrides?: Record<
    number,
    {
      batting?: typeof MOCK_SEASON_BATTING;
      pitching?: typeof MOCK_SEASON_PITCHING;
    }
  >,
) {
  const toId = (raw: unknown): number => {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const n = Number.parseInt(raw, 10);
      if (!Number.isNaN(n)) return n;
    }
    return 0;
  };
  const data: Record<string, unknown> = {};
  ([0, 1, 2, 3] as const).forEach((i) => {
    if (!variables[`has${i}`]) return;
    const id = toId(variables[`id${i}`]);
    const per = makeMockSeasonStatsResponse(id, seasonOverrides?.[id]).data;
    data[`slot${i}Batting`] = per.playerSeasonBatting;
    data[`slot${i}Pitching`] = per.playerSeasonPitching;
  });
  return { data };
}

/** Sets up GraphQL mocks with full season stats support. */
async function mockGraphQL(
  page: import('@playwright/test').Page,
  seasonOverrides?: Record<
    number,
    {
      batting?: typeof MOCK_SEASON_BATTING;
      pitching?: typeof MOCK_SEASON_PITCHING;
    }
  >,
) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const body = route.request().postData() ?? '';
      const op = extractOperationName(route).toLowerCase();

      if (op === 'getplayerswithstats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeMockPlayersResponse()),
        });
      } else if (op === 'getcomparisonseasonstats') {
        // Extract the per-slot variables (id0/has0 … id3/has3) from the request.
        let variables: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(body) as {
            variables?: Record<string, unknown>;
          };
          variables = parsed.variables ?? {};
        } catch {
          // Leave variables empty — yields a response with no slots.
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makeMockComparisonSeasonStatsResponse(variables, seasonOverrides),
          ),
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
    await expect(page.getByText(fullName)).toBeVisible({ timeout: 5000 });
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

  test('shows "Nobody on deck yet" empty state card', async ({ page }) => {
    await expect(page.getByText('Nobody on deck yet')).toBeVisible();
  });

  test('shows comparison hint in empty state', async ({ page }) => {
    await expect(
      page.getByText(/add at least two players to begin comparing/i),
    ).toBeVisible();
  });

  test('empty state disappears after adding first player', async ({ page }) => {
    await addPlayer(page, 'Aa', 'Aaron Judge');
    await expect(page.getByText('Nobody on deck yet')).not.toBeVisible();
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
      // exact: true avoids matching "Offensive Wins Above Replacement" tooltip
      await expect(page.getByText('Wins', { exact: true })).toBeVisible();
      await expect(page.getByText('ERA').first()).toBeVisible();
    });

    adminTest(
      'shows Strikeouts and Win % in pitching section',
      async ({ page }) => {
        // 'Strikeouts' now appears in both Career Batting and Career Pitching;
        // .first() avoids the strict-mode violation from matching 2 elements.
        await expect(page.getByText('Strikeouts').first()).toBeVisible();
        await expect(page.getByText('Win %')).toBeVisible();
      },
    );

    adminTest(
      'shows Games and Losses in pitching section',
      async ({ page }) => {
        // "Games" also appears in the Career Batting section; asserting visibility
        // confirms it renders in the comparison table (both rows are correct).
        await expect(page.getByText('Games').first()).toBeVisible();
        await expect(page.getByText('Losses', { exact: true })).toBeVisible();
      },
    );

    adminTest('shows Saves and Walks in pitching section', async ({ page }) => {
      await expect(page.getByText('Saves', { exact: true })).toBeVisible();
      // "Walks" also appears in Career Batting; asserting visibility covers both.
      await expect(page.getByText('Walks').first()).toBeVisible();
    });

    adminTest('shows correct ERA stat value for pitcher', async ({ page }) => {
      // Ohtani mock era = '2.94' → rendered as '2.94'
      await expect(page.getByText('2.94')).toBeVisible();
    });
  },
);

// ---------------------------------------------------------------------------
// Tests: Career pitching absent when no pitcher selected (LS-5571) @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – career pitching absent (hitters only) @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockGraphQL(page);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();

      // Add two pure hitters — neither has careerPitching data
      await addPlayer(page, 'Aa', 'Aaron Judge');
      await addPlayer(page, 'Mo', 'Mookie Betts');
    });

    adminTest(
      'does not show Career Pitching section when no pitchers selected',
      async ({ page }) => {
        await expect(page.getByText(/career pitching/i)).not.toBeVisible();
      },
    );

    adminTest(
      'still shows Career Batting and Career Achievements when no pitchers',
      async ({ page }) => {
        await expect(page.getByText(/career batting/i)).toBeVisible();
        await expect(page.getByText(/career achievements/i)).toBeVisible();
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
      'displays "BEST" indicator for the leading stat',
      async ({ page }) => {
        // At least one "BEST" badge should be visible in the comparison table
        await expect(
          page.getByText('BEST', { exact: true }).first(),
        ).toBeVisible();
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

    adminTest(
      'shows batting Strikeouts row with lowerIsBetter BEST indicator',
      async ({ page }) => {
        // Ohtani (950 K) has fewer batting strikeouts than Judge (1200 K),
        // so Ohtani should receive the BEST indicator (lowerIsBetter: true).
        // Career Batting renders before Career Pitching, so .first() targets
        // the batting Strikeouts row specifically.
        const row = page
          .getByRole('row')
          .filter({ hasText: 'Strikeouts' })
          .first();
        await expect(row).toBeVisible();
        await expect(row.getByText('BEST', { exact: true })).toBeVisible();
      },
    );
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

    adminTest('shows Season by Season heading', async ({ page }) => {
      await expect(page.getByText('Season by Season')).toBeVisible();
    });

    adminTest('shows Batting by Season table for Judge', async ({ page }) => {
      await expect(
        page.getByRole('table', { name: 'Season batting for Aaron Judge' }),
      ).toBeVisible();
    });

    adminTest('shows Batting by Season table for Ohtani', async ({ page }) => {
      await expect(
        page.getByRole('table', { name: 'Season batting for Shohei Ohtani' }),
      ).toBeVisible();
    });

    adminTest('shows Pitching by Season table for Ohtani', async ({ page }) => {
      await expect(
        page.getByRole('table', { name: 'Season pitching for Shohei Ohtani' }),
      ).toBeVisible();
    });

    adminTest(
      'does NOT show Pitching by Season table for Judge (non-pitcher)',
      async ({ page }) => {
        await expect(
          page.getByRole('table', { name: 'Season pitching for Aaron Judge' }),
        ).not.toBeVisible();
      },
    );

    adminTest(
      'season batting table shows column headers (Year, G, AB, H, HR, etc.)',
      async ({ page }) => {
        // Locate within the season breakdown section
        const seasonSection = page.getByText('Season by Season');
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
        // Scope to the pitching table to avoid matching career pitching comparison
        const pitchingSection = page.getByRole('table', {
          name: 'Season pitching for Shohei Ohtani',
        });

        await expect(pitchingSection).toBeVisible();
        await expect(pitchingSection.getByText('ERA').first()).toBeVisible();
        await expect(pitchingSection.getByText('SO').first()).toBeVisible();
        await expect(pitchingSection.getByText('WHIP').first()).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: Season expand toggle (LS-7034) @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – season expand toggle (LS-7034) @regression',
  () => {
    adminTest(
      'no expand toggle when a player has 4 or fewer seasons',
      async ({ page }) => {
        // Default mock gives Ohtani 2 seasons — below the truncation threshold.
        await mockGraphQL(page);
        await page.goto('/players/compare');
        await page.waitForLoadState('load');
        await addPlayer(page, 'Sh', 'Shohei Ohtani');

        await expect(
          page.getByRole('table', { name: 'Season batting for Shohei Ohtani' }),
        ).toBeVisible();
        await expect(page.getByTestId('season-expand-2')).toHaveCount(0);
      },
    );

    adminTest(
      'expand toggle reveals seasons beyond the four most recent',
      async ({ page }) => {
        // Give Ohtani six batting seasons so the toggle appears.
        await mockGraphQL(page, { 2: { batting: MOCK_OHTANI_MANY_BATTING } });
        await page.goto('/players/compare');
        await page.waitForLoadState('load');
        await addPlayer(page, 'Sh', 'Shohei Ohtani');

        const battingTable = page.getByRole('table', {
          name: 'Season batting for Shohei Ohtani',
        });
        await expect(battingTable).toBeVisible();

        // Collapsed: four most recent shown (2025–2022); 2020 is truncated.
        await expect(
          battingTable.getByText('2025', { exact: true }),
        ).toBeVisible();
        await expect(
          battingTable.getByText('2020', { exact: true }),
        ).toHaveCount(0);

        const toggle = page.getByTestId('season-expand-2');
        await expect(toggle).toBeVisible();
        await expect(toggle).toHaveText(/Expand all 6 seasons/);

        // Expand: the older seasons become visible.
        await toggle.click();
        await expect(
          battingTable.getByText('2020', { exact: true }),
        ).toBeVisible();
        await expect(toggle).toHaveText(/Show fewer/);

        // Collapse again: 2020 is hidden once more.
        await toggle.click();
        await expect(
          battingTable.getByText('2020', { exact: true }),
        ).toHaveCount(0);
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

  adminTest('shows 4/4 player count hint', async ({ page }) => {
    await expect(
      page.getByText('4 of 4 selected · 0 slots open'),
    ).toBeVisible();
  });

  adminTest(
    'search input shows capacity-reached placeholder when at max',
    async ({ page }) => {
      await expect(
        page.getByPlaceholder('4 players selected — remove one to add more'),
      ).toBeVisible();
    },
  );

  adminTest(
    'search input is disabled when at max capacity',
    async ({ page }) => {
      const input = page.getByPlaceholder(
        '4 players selected — remove one to add more',
      );
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
    await expect(page.getByText('3 of 4 selected · 1 slot open')).toBeVisible();
    await expect(page.getByPlaceholder('Search player name…')).toBeVisible();
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
        await expect(
          page.getByText('3 of 4 selected · 1 slot open'),
        ).toBeVisible();
        await expect(
          page.getByPlaceholder('Search player name…'),
        ).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: Career batting comparison rows (LS-5570) @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – career batting comparison rows (LS-5570) @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockGraphQL(page);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();

      // Add Judge (hitter) and Ohtani (two-way — also has batting stats)
      await addPlayer(page, 'Aa', 'Aaron Judge');
      await addPlayer(page, 'Sh', 'Shohei Ohtani');
    });

    adminTest(
      'shows "Career Batting" section header in comparison table',
      async ({ page }) => {
        await expect(
          page.getByRole('rowgroup').filter({ hasText: 'Career Batting' }),
        ).toBeVisible();
      },
    );

    adminTest('shows all career batting stat row labels', async ({ page }) => {
      // Scope to the Career Batting rowgroup — "Walks" appears in both career
      // batting and career pitching sections, so page-level lookups are ambiguous.
      const section = page
        .getByRole('rowgroup')
        .filter({ hasText: 'Career Batting' });
      for (const label of [
        'Games',
        'Hits',
        'Home Runs',
        'RBI',
        'Runs',
        'Stolen Bases',
        'Walks',
        'Total Bases',
        'oWAR',
        'Avg Season AVG',
        'Avg Season OBP',
        'Avg Season SLG',
      ]) {
        await expect(
          section.getByRole('row').filter({ hasText: label }).first(),
        ).toBeVisible();
      }
    });

    adminTest(
      'shows career batting values for each player column',
      async ({ page }) => {
        // Judge: 900 games, Ohtani: 760 games
        await expect(page.getByText('900').first()).toBeVisible();
        await expect(page.getByText('760').first()).toBeVisible();
        // Home Runs: Judge 220, Ohtani 175
        await expect(page.getByText('220').first()).toBeVisible();
        await expect(page.getByText('175').first()).toBeVisible();
        // RBI: Judge 600, Ohtani 480
        await expect(page.getByText('600').first()).toBeVisible();
        await expect(page.getByText('480').first()).toBeVisible();
      },
    );

    adminTest(
      'formats rate stats (Avg Season AVG/OBP/SLG) without leading zero',
      async ({ page }) => {
        // Judge: .282 AVG, .387 OBP, .579 SLG
        await expect(page.getByText('.282')).toBeVisible();
        await expect(page.getByText('.387')).toBeVisible();
        await expect(page.getByText('.579')).toBeVisible();
        // Ohtani: .274 AVG, .377 OBP, .564 SLG
        await expect(page.getByText('.274')).toBeVisible();
        await expect(page.getByText('.377')).toBeVisible();
        await expect(page.getByText('.564')).toBeVisible();
      },
    );

    adminTest('formats oWAR with one decimal place', async ({ page }) => {
      // Judge: 42.0 oWAR, Ohtani: 38.5 oWAR
      await expect(page.getByText('42.0').first()).toBeVisible();
      await expect(page.getByText('38.5')).toBeVisible();
    });

    adminTest(
      'BEST indicator appears on the higher career batting value',
      async ({ page }) => {
        // Judge has more Home Runs (220 vs 175) — his HR cell should be marked BEST.
        // Locate the Home Runs row and assert the BEST badge is near the 220 value.
        const table = page.getByRole('table', { name: 'Player comparison' });
        const hrRow = table.getByRole('row').filter({ hasText: 'Home Runs' });
        await expect(hrRow.getByText('BEST', { exact: true })).toBeVisible();
        // The BEST badge should be in the same cell as the higher value (220)
        const bestCell = hrRow.getByRole('cell').filter({ hasText: 'BEST' });
        await expect(bestCell).toContainText('220');
      },
    );

    adminTest(
      'BEST indicator is absent from the lower value in a career batting row',
      async ({ page }) => {
        // In the Home Runs row, Ohtani (175) should NOT have the BEST badge
        const table = page.getByRole('table', { name: 'Player comparison' });
        const hrRow = table.getByRole('row').filter({ hasText: 'Home Runs' });
        const cells = hrRow.getByRole('cell');
        // The cell containing 175 must not contain BEST
        const ohtaniCell = cells.filter({ hasText: '175' });
        await expect(ohtaniCell).not.toContainText('BEST');
      },
    );

    adminTest(
      'Walks stat row displays career base-on-balls totals',
      async ({ page }) => {
        // Judge: 400 walks, Ohtani: 310 walks
        const table = page.getByRole('table', { name: 'Player comparison' });
        const walksRow = table
          .getByRole('row')
          .filter({ hasText: 'Walks' })
          .first();
        await expect(walksRow).toBeVisible();
        await expect(walksRow).toContainText('400');
        await expect(walksRow).toContainText('310');
      },
    );

    adminTest(
      'Total Bases row shows correct career totals',
      async ({ page }) => {
        // Judge: 1,800 total bases, Ohtani: 1,400 total bases
        await expect(page.getByText('1,800')).toBeVisible();
        await expect(page.getByText('1,400')).toBeVisible();
      },
    );
  },
);
