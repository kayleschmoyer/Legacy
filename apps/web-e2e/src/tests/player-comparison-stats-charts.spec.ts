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

import { adminTest, test } from '../fixtures/pages';
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

// ---------------------------------------------------------------------------
// Tests: Empty state card @smoke
// ---------------------------------------------------------------------------

test.describe('Player Comparison – empty state @smoke', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockGraphQL(page);
    await playersPage.gotoCompare();
  });

  test('shows "Nobody on deck yet" empty state card', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectEmptyStateHeading();
  });

  test('shows comparison hint in empty state', async ({ playersPage }) => {
    await playersPage.compare.expectEmptyStatePrompt();
  });

  test('empty state disappears after adding first player', async ({
    playersPage,
  }) => {
    await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
    await playersPage.compare.expectEmptyStateHidden();
  });
});

// ---------------------------------------------------------------------------
// Tests: Career pitching rows @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – career pitching section @regression',
  () => {
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      // Add Judge (no pitching) and Ohtani (has pitching)
      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
    });

    adminTest(
      'shows Career Pitching section when pitcher is selected',
      async ({ playersPage }) => {
        await playersPage.compare.expectSectionVisible(/career pitching/i);
      },
    );

    adminTest(
      'shows pitching stat rows (Wins, ERA)',
      async ({ playersPage }) => {
        // exact: true avoids matching "Offensive Wins Above Replacement" tooltip
        await playersPage.compare.expectText('Wins', { exact: true });
        await playersPage.compare.expectText('ERA');
      },
    );

    adminTest(
      'shows Strikeouts and Win % in pitching section',
      async ({ playersPage }) => {
        // 'Strikeouts' now appears in both Career Batting and Career Pitching;
        // expectText resolves to the first match.
        await playersPage.compare.expectText('Strikeouts');
        await playersPage.compare.expectText('Win %');
      },
    );

    adminTest(
      'shows Games and Losses in pitching section',
      async ({ playersPage, isMobile }) => {
        // Desktop-only affordance at the mobile viewport — exposed by the
        // LS-9658 full mobile sweep (LS-9660).
        adminTest.skip(
          isMobile,
          'the season/career comparison tables are hidden at the mobile viewport (responsive layout)',
        );
        // "Games" also appears in the Career Batting section; asserting visibility
        // confirms it renders in the comparison table (both rows are correct).
        await playersPage.compare.expectText('Games');
        await playersPage.compare.expectText('Losses', { exact: true });
      },
    );

    adminTest(
      'shows Saves and Walks in pitching section',
      async ({ playersPage }) => {
        await playersPage.compare.expectText('Saves', { exact: true });
        // "Walks" also appears in Career Batting; asserting visibility covers both.
        await playersPage.compare.expectText('Walks');
      },
    );

    adminTest(
      'shows correct ERA stat value for pitcher',
      async ({ playersPage }) => {
        // Ohtani mock era = '2.94' → rendered as '2.94'
        await playersPage.compare.expectText('2.94');
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: Career pitching absent when no pitcher selected (LS-5571) @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – career pitching absent (hitters only) @regression',
  () => {
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      // Add two pure hitters — neither has careerPitching data
      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Mo', 'Mookie Betts');
    });

    adminTest(
      'does not show Career Pitching section when no pitchers selected',
      async ({ playersPage }) => {
        await playersPage.compare.expectSectionHidden(/career pitching/i);
      },
    );

    adminTest(
      'still shows Career Batting and Career Achievements when no pitchers',
      async ({ playersPage }) => {
        await playersPage.compare.expectSectionVisible(/career batting/i);
        await playersPage.compare.expectSectionVisible(/career achievements/i);
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
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      // Add Judge and Ohtani
      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
    });

    adminTest(
      'displays "BEST" indicator for the leading stat',
      async ({ playersPage }) => {
        // At least one "BEST" badge should be visible in the comparison table
        await playersPage.compare.expectAnyBest();
      },
    );

    adminTest(
      'shows correct Fantasy Score values for each player',
      async ({ playersPage }) => {
        // Judge has totalScore 850.0, Ohtani has 960.0
        await playersPage.compare.expectText('850.0');
        await playersPage.compare.expectText('960.0');
      },
    );

    adminTest(
      'shows correct Avg Pts / Game values for each player',
      async ({ playersPage }) => {
        // Judge: 2.1, Ohtani: 2.6
        await playersPage.compare.expectText('2.1');
        await playersPage.compare.expectText('2.6');
      },
    );

    adminTest(
      'Ohtani shows non-zero Pitcher Score; Judge shows 0',
      async ({ playersPage }) => {
        // Pitcher Score row: Judge 0.0, Ohtani 60.0
        await playersPage.compare.expectText('0.0');
        await playersPage.compare.expectText('60.0');
      },
    );

    adminTest('shows Home Runs career stat values', async ({ playersPage }) => {
      // Judge: 220, Ohtani: 175
      await playersPage.compare.expectText('220');
      await playersPage.compare.expectText('175');
    });

    adminTest(
      'shows batting Strikeouts row with lowerIsBetter BEST indicator',
      async ({ playersPage }) => {
        // Ohtani (950 K) has fewer batting strikeouts than Judge (1200 K),
        // so Ohtani should receive the BEST indicator (lowerIsBetter: true).
        // Career Batting renders before Career Pitching, so the first matching
        // row is the batting Strikeouts row.
        await playersPage.compare.expectRowVisible('Strikeouts');
        await playersPage.compare.expectBestInFirstRow('Strikeouts');
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
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      // Add Judge and Ohtani (Ohtani has season batting + pitching data)
      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
    });

    adminTest('shows Season by Season heading', async ({ playersPage }) => {
      await playersPage.compare.expectSeasonBySeasonHeading();
    });

    adminTest(
      'shows Batting by Season table for Judge',
      async ({ playersPage, isMobile }) => {
        // Desktop-only affordance at the mobile viewport — exposed by the
        // LS-9658 full mobile sweep (LS-9660).
        adminTest.skip(
          isMobile,
          'the season/career comparison tables are hidden at the mobile viewport (responsive layout)',
        );
        await playersPage.compare.expectSeasonTableVisible(
          'batting',
          'Aaron Judge',
        );
      },
    );

    adminTest(
      'shows Batting by Season table for Ohtani',
      async ({ playersPage, isMobile }) => {
        // Desktop-only affordance at the mobile viewport — exposed by the
        // LS-9658 full mobile sweep (LS-9660).
        adminTest.skip(
          isMobile,
          'the season/career comparison tables are hidden at the mobile viewport (responsive layout)',
        );
        await playersPage.compare.expectSeasonTableVisible(
          'batting',
          'Shohei Ohtani',
        );
      },
    );

    adminTest(
      'shows Pitching by Season table for Ohtani',
      async ({ playersPage, isMobile }) => {
        // Desktop-only affordance at the mobile viewport — exposed by the
        // LS-9658 full mobile sweep (LS-9660).
        adminTest.skip(
          isMobile,
          'the season/career comparison tables are hidden at the mobile viewport (responsive layout)',
        );
        await playersPage.compare.expectSeasonTableVisible(
          'pitching',
          'Shohei Ohtani',
        );
      },
    );

    adminTest(
      'does NOT show Pitching by Season table for Judge (non-pitcher)',
      async ({ playersPage }) => {
        await playersPage.compare.expectSeasonTableHidden(
          'pitching',
          'Aaron Judge',
        );
      },
    );

    adminTest(
      'season batting table shows column headers (Year, G, AB, H, HR, etc.)',
      async ({ playersPage, isMobile }) => {
        // Desktop-only affordance at the mobile viewport — exposed by the
        // LS-9658 full mobile sweep (LS-9660).
        adminTest.skip(
          isMobile,
          'the season/career comparison tables are hidden at the mobile viewport (responsive layout)',
        );
        // Locate within the season breakdown section
        await playersPage.compare.expectSeasonBySeasonHeading();

        // Column headers for batting table
        await playersPage.compare.expectText('Year');
        // AB and HR appear in the batting table headers
        await playersPage.compare.expectText('AB');
        await playersPage.compare.expectText('AVG');
      },
    );

    adminTest(
      'Ohtani season batting table contains 2021 season row data',
      async ({ playersPage }) => {
        // 2021 season: 155 games, 46 HR, .257 AVG
        await playersPage.compare.expectText('2021');
      },
    );

    adminTest(
      'Ohtani season pitching table shows pitching headers',
      async ({ playersPage, isMobile }) => {
        // Desktop-only affordance at the mobile viewport — exposed by the
        // LS-9658 full mobile sweep (LS-9660).
        adminTest.skip(
          isMobile,
          'the season/career comparison tables are hidden at the mobile viewport (responsive layout)',
        );
        // Scope to the pitching table to avoid matching career pitching comparison
        await playersPage.compare.expectSeasonTableHeader(
          'pitching',
          'Shohei Ohtani',
          'ERA',
        );
        await playersPage.compare.expectSeasonTableHeader(
          'pitching',
          'Shohei Ohtani',
          'SO',
        );
        await playersPage.compare.expectSeasonTableHeader(
          'pitching',
          'Shohei Ohtani',
          'WHIP',
        );
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
      async ({ page, playersPage, isMobile }) => {
        // Desktop-only affordance at the mobile viewport — exposed by the
        // LS-9658 full mobile sweep (LS-9660).
        adminTest.skip(
          isMobile,
          'the season/career comparison tables are hidden at the mobile viewport (responsive layout)',
        );
        // Default mock gives Ohtani 2 seasons — below the truncation threshold.
        await mockGraphQL(page);
        await playersPage.gotoCompare();
        await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');

        await playersPage.compare.expectSeasonTableVisible(
          'batting',
          'Shohei Ohtani',
        );
        await playersPage.compare.expectSeasonExpandAbsent(2);
      },
    );

    adminTest(
      'expand toggle reveals seasons beyond the four most recent',
      async ({ page, playersPage, isMobile }) => {
        // Desktop-only affordance at the mobile viewport — exposed by the
        // LS-9658 full mobile sweep (LS-9660).
        adminTest.skip(
          isMobile,
          'the season/career comparison tables are hidden at the mobile viewport (responsive layout)',
        );
        // Give Ohtani six batting seasons so the toggle appears.
        await mockGraphQL(page, { 2: { batting: MOCK_OHTANI_MANY_BATTING } });
        await playersPage.gotoCompare();
        await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');

        await playersPage.compare.expectSeasonTableVisible(
          'batting',
          'Shohei Ohtani',
        );

        // Collapsed: four most recent shown (2025–2022); 2020 is truncated.
        await playersPage.compare.expectSeasonRowVisible(
          'batting',
          'Shohei Ohtani',
          '2025',
        );
        await playersPage.compare.expectSeasonRowAbsent(
          'batting',
          'Shohei Ohtani',
          '2020',
        );

        await playersPage.compare.expectSeasonExpandText(
          2,
          /Expand all 6 seasons/,
        );

        // Expand: the older seasons become visible.
        await playersPage.compare.clickSeasonExpand(2);
        await playersPage.compare.expectSeasonRowVisible(
          'batting',
          'Shohei Ohtani',
          '2020',
        );
        await playersPage.compare.expectSeasonExpandText(2, /Show fewer/);

        // Collapse again: 2020 is hidden once more.
        await playersPage.compare.clickSeasonExpand(2);
        await playersPage.compare.expectSeasonRowAbsent(
          'batting',
          'Shohei Ohtani',
          '2020',
        );
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

  adminTest.beforeEach(async ({ page, playersPage }) => {
    await mockGraphQL(page);
    await playersPage.gotoCompare();
    await playersPage.compare.expectSearchVisible();

    // Add all 4 players
    await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
    await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
    await playersPage.compare.addPlayer('Mo', 'Mookie Betts');
    await playersPage.compare.addPlayer('Mi', 'Mike Trout');
  });

  adminTest('shows 4/4 player count hint', async ({ playersPage }) => {
    await playersPage.compare.expectCountHint('4 of 4 selected · 0 slots open');
  });

  adminTest(
    'search input shows capacity-reached placeholder when at max',
    async ({ playersPage }) => {
      await playersPage.compare.expectSearchAtCapacity();
    },
  );

  adminTest(
    'search input is disabled when at max capacity',
    async ({ playersPage }) => {
      await playersPage.compare.expectSearchAtCapacity();
    },
  );

  adminTest(
    'all four player names appear in comparison header',
    async ({ playersPage }) => {
      await playersPage.compare.expectText('Aaron Judge');
      await playersPage.compare.expectText('Shohei Ohtani');
      await playersPage.compare.expectText('Mookie Betts');
      await playersPage.compare.expectText('Mike Trout');
    },
  );

  adminTest(
    'removing a player re-enables search (3/4)',
    async ({ playersPage }) => {
      await playersPage.compare.removePlayer('Mookie Betts');
      await playersPage.compare.expectCountHint(
        '3 of 4 selected · 1 slot open',
      );
      await playersPage.compare.expectSearchPlaceholderDefault();
    },
  );
});

// ---------------------------------------------------------------------------
// Tests: Three-player comparison @regression
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – three players comparison @regression',
  () => {
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      // Add Judge, Ohtani, and Betts
      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
      await playersPage.compare.addPlayer('Mo', 'Mookie Betts');
    });

    adminTest(
      'shows comparison table with 3 player columns',
      async ({ playersPage }) => {
        await playersPage.compare.expectText('Aaron Judge');
        await playersPage.compare.expectText('Shohei Ohtani');
        await playersPage.compare.expectText('Mookie Betts');
      },
    );

    adminTest(
      'shows 3/4 count and search remains enabled',
      async ({ playersPage }) => {
        await playersPage.compare.expectCountHint(
          '3 of 4 selected · 1 slot open',
        );
        await playersPage.compare.expectSearchPlaceholderDefault();
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
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();

      // Add Judge (hitter) and Ohtani (two-way — also has batting stats)
      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
    });

    adminTest(
      'shows "Career Batting" section header in comparison table',
      async ({ playersPage }) => {
        await playersPage.compare.expectRowGroupVisible('Career Batting');
      },
    );

    adminTest(
      'shows all career batting stat row labels',
      async ({ playersPage }) => {
        // Scope to the Career Batting rowgroup — "Walks" appears in both career
        // batting and career pitching sections, so page-level lookups are ambiguous.
        await playersPage.compare.expectRowLabelsInGroup('Career Batting', [
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
        ]);
      },
    );

    adminTest(
      'shows career batting values for each player column',
      async ({ playersPage }) => {
        // Judge: 900 games, Ohtani: 760 games
        await playersPage.compare.expectText('900');
        await playersPage.compare.expectText('760');
        // Home Runs: Judge 220, Ohtani 175
        await playersPage.compare.expectText('220');
        await playersPage.compare.expectText('175');
        // RBI: Judge 600, Ohtani 480
        await playersPage.compare.expectText('600');
        await playersPage.compare.expectText('480');
      },
    );

    adminTest(
      'formats rate stats (Avg Season AVG/OBP/SLG) without leading zero',
      async ({ playersPage }) => {
        // Judge: .282 AVG, .387 OBP, .579 SLG
        await playersPage.compare.expectText('.282');
        await playersPage.compare.expectText('.387');
        await playersPage.compare.expectText('.579');
        // Ohtani: .274 AVG, .377 OBP, .564 SLG
        await playersPage.compare.expectText('.274');
        await playersPage.compare.expectText('.377');
        await playersPage.compare.expectText('.564');
      },
    );

    adminTest(
      'formats oWAR with one decimal place',
      async ({ playersPage }) => {
        // Judge: 42.0 oWAR, Ohtani: 38.5 oWAR
        await playersPage.compare.expectText('42.0');
        await playersPage.compare.expectText('38.5');
      },
    );

    adminTest(
      'BEST indicator appears on the higher career batting value',
      async ({ playersPage }) => {
        // Judge has more Home Runs (220 vs 175) — his HR cell should be marked BEST.
        // Locate the Home Runs row and assert the BEST badge is near the 220 value.
        await playersPage.compare.expectBestInTableRow('Home Runs');
        // The BEST badge should be in the same cell as the higher value (220)
        await playersPage.compare.expectBestCellContains('Home Runs', '220');
      },
    );

    adminTest(
      'BEST indicator is absent from the lower value in a career batting row',
      async ({ playersPage }) => {
        // In the Home Runs row, Ohtani (175) should NOT have the BEST badge
        await playersPage.compare.expectCellWithoutBest('Home Runs', '175');
      },
    );

    adminTest(
      'Walks stat row displays career base-on-balls totals',
      async ({ playersPage }) => {
        // Judge: 400 walks, Ohtani: 310 walks
        await playersPage.compare.expectRowContains('Walks', '400');
        await playersPage.compare.expectRowContains('Walks', '310');
      },
    );

    adminTest(
      'Total Bases row shows correct career totals',
      async ({ playersPage }) => {
        // Judge: 1,800 total bases, Ohtani: 1,400 total bases
        await playersPage.compare.expectText('1,800');
        await playersPage.compare.expectText('1,400');
      },
    );
  },
);
