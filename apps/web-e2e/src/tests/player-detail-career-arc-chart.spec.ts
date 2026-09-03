/**
 * Player Detail Modal E2E Tests — Career Arc Line Chart (LS-5579)
 *
 * Covers the Recharts area chart rendered in the Career Arc tab:
 *   - Batting arc: header stats (Peak OPS, Career Avg OPS, Seasons, Teams)
 *   - Pitching arc: header stats (Peak ERA+, Career Avg ERA+)
 *   - Two-way player: interactive batting ↔ pitching mode toggle
 *   - Empty/no-data state for each arc mode
 *   - Milestone legend: Cy Young, All-Star, Gold Glove, Silver Slugger badges
 *   - Pitcher-only player: no batting/pitching toggle rendered
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';

// ── Mock Data ─────────────────────────────────────────────────────────────────

/** Pitcher-only career arc (Pedro Martinez — two seasons, Cy Young awards). */
const PITCHER_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Pedro',
      lastName: 'Martinez',
      eligiblePositions: ['SP'],
      careerAchievements: {
        allStarSelections: 8,
        goldGloves: 0,
        silverSluggers: 0,
        mvpAwards: 0,
        cyYoungAwards: 3,
        hallOfFame: true,
        rookieOfTheYear: false,
      },
    },
    arcBatting: [],
    arcPitching: [
      {
        season: 1999,
        team: 'BOS',
        games: 60,
        wins: 23,
        losses: 4,
        earnedRunAverage: '2.07',
        earnedRunAveragePlus: 243,
        whip: 0.92,
        strikeouts: 313,
        inningsPitched: 213,
        awardSummary: 'AS,CYA',
      },
      {
        season: 2000,
        team: 'BOS',
        games: 55,
        wins: 18,
        losses: 6,
        earnedRunAverage: '1.74',
        earnedRunAveragePlus: 291,
        whip: 0.74,
        strikeouts: 284,
        inningsPitched: 217,
        awardSummary: 'AS,CYA',
      },
    ],
  },
};

/** Season stats for Pedro (pitcher-only). */
const PITCHER_SEASON_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['SP'],
      firstName: 'Pedro',
      lastName: 'Martinez',
    },
    playerSeasonBatting: [],
    playerSeasonPitching: [
      {
        __typename: 'SeasonPitching',
        season: 1999,
        team: 'BOS',
        games: 31,
        wins: 23,
        losses: 4,
        gamesStarted: 31,
        completeGames: 5,
        shutouts: 1,
        saves: 0,
        inningsPitched: 213,
        hits: 160,
        runs: 56,
        earnedRuns: 49,
        homeRuns: 9,
        baseOnBalls: 37,
        strikeouts: 313,
        earnedRunAverage: '2.07',
        whip: 0.92,
      },
      {
        __typename: 'SeasonPitching',
        season: 2000,
        team: 'BOS',
        games: 29,
        wins: 18,
        losses: 6,
        gamesStarted: 29,
        completeGames: 7,
        shutouts: 4,
        saves: 0,
        inningsPitched: 217,
        hits: 128,
        runs: 44,
        earnedRuns: 42,
        homeRuns: 17,
        baseOnBalls: 32,
        strikeouts: 284,
        earnedRunAverage: '1.74',
        whip: 0.74,
      },
    ],
    playerSeasonFielding: [],
  },
};

/** Two-way player (Ohtani) with both batting and pitching career arcs. */
const TWO_WAY_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Shohei',
      lastName: 'Ohtani',
      eligiblePositions: ['SP', 'DH'],
      careerAchievements: {
        allStarSelections: 4,
        goldGloves: 0,
        silverSluggers: 2,
        mvpAwards: 2,
        cyYoungAwards: 0,
        hallOfFame: false,
        rookieOfTheYear: true,
      },
    },
    arcBatting: [
      {
        season: 2023,
        team: 'LAA',
        games: 135,
        hits: 151,
        atBats: 497,
        homeRuns: 44,
        rbi: 95,
        stolenBases: 20,
        battingAverage: 0.304,
        onBasePercentage: 0.412,
        sluggingPercentage: 0.654,
        onBasePlusSlugging: 1.066,
        onBasePlusSluggingPlus: 185,
        awardSummary: 'AS,MVP,SS',
      },
      {
        season: 2024,
        team: 'LAD',
        games: 159,
        hits: 197,
        atBats: 556,
        homeRuns: 54,
        rbi: 130,
        stolenBases: 59,
        battingAverage: 0.31,
        onBasePercentage: 0.39,
        sluggingPercentage: 0.646,
        onBasePlusSlugging: 1.036,
        onBasePlusSluggingPlus: 190,
        awardSummary: 'AS,MVP',
      },
    ],
    arcPitching: [
      {
        season: 2022,
        team: 'LAA',
        games: 65,
        wins: 15,
        losses: 9,
        earnedRunAverage: '2.33',
        earnedRunAveragePlus: 185,
        whip: 1.01,
        strikeouts: 219,
        inningsPitched: 166,
        awardSummary: 'AS,CYA',
      },
    ],
  },
};

/** Two-way season stats. */
const TWO_WAY_SEASON_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['SP', 'DH'],
      firstName: 'Shohei',
      lastName: 'Ohtani',
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 2024,
        team: 'LAD',
        games: 159,
        plateAppearances: 636,
        atBats: 556,
        runs: 134,
        hits: 197,
        doubles: 38,
        triples: 7,
        homeRuns: 54,
        rbi: 130,
        stolenBases: 59,
        caughtStealing: 10,
        baseOnBalls: 81,
        strikeouts: 164,
        battingAverage: 0.31,
        onBasePercentage: 0.39,
        sluggingPercentage: 0.646,
      },
    ],
    playerSeasonPitching: [
      {
        __typename: 'SeasonPitching',
        season: 2022,
        team: 'LAA',
        games: 28,
        wins: 15,
        losses: 9,
        gamesStarted: 28,
        completeGames: 0,
        shutouts: 0,
        saves: 0,
        inningsPitched: 166,
        hits: 118,
        runs: 48,
        earnedRuns: 43,
        homeRuns: 15,
        baseOnBalls: 44,
        strikeouts: 219,
        earnedRunAverage: '2.33',
        whip: 1.01,
      },
    ],
    playerSeasonFielding: [],
  },
};

/**
 * Batter with multi-team career (Ted Williams seasons spanning team
 * changes — triggers the Teams count header stat).
 */
const MULTI_TEAM_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Greg',
      lastName: 'Maddux',
      eligiblePositions: ['SP'],
      careerAchievements: {
        allStarSelections: 8,
        goldGloves: 18,
        silverSluggers: 0,
        mvpAwards: 0,
        cyYoungAwards: 4,
        hallOfFame: true,
        rookieOfTheYear: false,
      },
    },
    arcBatting: [],
    arcPitching: [
      {
        season: 1992,
        team: 'CHC',
        games: 35,
        wins: 20,
        losses: 11,
        earnedRunAverage: '2.18',
        earnedRunAveragePlus: 162,
        whip: 1.01,
        strikeouts: 199,
        inningsPitched: 268,
        awardSummary: 'CYA,GG',
      },
      {
        season: 1994,
        team: 'ATL',
        games: 25,
        wins: 16,
        losses: 6,
        earnedRunAverage: '1.56',
        earnedRunAveragePlus: 271,
        whip: 0.9,
        strikeouts: 156,
        inningsPitched: 202,
        awardSummary: 'AS,CYA,GG',
      },
    ],
  },
};

/** Season stats for Greg Maddux (pitcher, multi-team). */
const MULTI_TEAM_SEASON_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['SP'],
      firstName: 'Greg',
      lastName: 'Maddux',
    },
    playerSeasonBatting: [],
    playerSeasonPitching: [
      {
        __typename: 'SeasonPitching',
        season: 1992,
        team: 'CHC',
        games: 35,
        wins: 20,
        losses: 11,
        gamesStarted: 35,
        completeGames: 9,
        shutouts: 4,
        saves: 0,
        inningsPitched: 268,
        hits: 201,
        runs: 78,
        earnedRuns: 65,
        homeRuns: 7,
        baseOnBalls: 70,
        strikeouts: 199,
        earnedRunAverage: '2.18',
        whip: 1.01,
      },
      {
        __typename: 'SeasonPitching',
        season: 1994,
        team: 'ATL',
        games: 25,
        wins: 16,
        losses: 6,
        gamesStarted: 25,
        completeGames: 10,
        shutouts: 3,
        saves: 0,
        inningsPitched: 202,
        hits: 150,
        runs: 39,
        earnedRuns: 35,
        homeRuns: 4,
        baseOnBalls: 31,
        strikeouts: 156,
        earnedRunAverage: '1.56',
        whip: 0.9,
      },
    ],
    playerSeasonFielding: [],
  },
};

/** Stats table response (placeholder — career arc tests don't need the table). */
const STATS_TABLE_RESPONSE = {
  data: {
    careerBattingStats: {
      __typename: 'CareerBattingConnection',
      totalCount: 1,
      edges: [
        {
          __typename: 'CareerBattingEdge',
          node: {
            __typename: 'CareerBatting',
            playerId: 1,
            primaryPosition: 'SP',
            positionsPlayed: null,
            games: 476,
            plateAppearances: null,
            atBats: null,
            runs: null,
            hits: null,
            doubles: null,
            triples: null,
            homeRuns: null,
            rbi: null,
            stolenBases: null,
            caughtStealing: null,
            baseOnBalls: null,
            strikeouts: null,
            totalBases: null,
            groundedIntoDoublePlays: null,
            hitByPitch: null,
            sacrificeHits: null,
            intentionalBaseOnBalls: null,
            battingAverage: null,
            onBasePercentage: null,
            sluggingPercentage: null,
            offensiveWAR: null,
            player: {
              __typename: 'Player',
              id: 1,
              firstName: 'Pedro',
              lastName: 'Martinez',
              brefId: 'martipe02',
            },
          },
        },
      ],
      pageInfo: {
        __typename: 'PageInfo',
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
    },
    players: [
      {
        __typename: 'Player',
        id: 1,
        firstName: 'Pedro',
        lastName: 'Martinez',
        brefId: 'martipe02',
        statsLastFetchedAt: null,
      },
    ],
  },
};

// ── Route Setup ───────────────────────────────────────────────────────────────

interface SetupOptions {
  seasonStatsBody?: object;
  careerArcBody?: object;
}

async function setupMocks(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    seasonStatsBody = PITCHER_SEASON_STATS,
    careerArcBody = PITCHER_CAREER_ARC,
  } = opts;

  await page.route(
    (url) =>
      url.toString().includes('/graphql') && !url.toString().includes('/@fs/'),
    async (route) => {
      const op = extractOperationName(route).toLowerCase();

      if (op === 'getplayercareerarc') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(careerArcBody),
        });
      } else if (op === 'getallplayerseasonstats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(seasonStatsBody),
        });
      } else if (
        op === 'getcareerbattingstats' ||
        op === 'getallplayers' ||
        op === 'getplayerswithstats'
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(STATS_TABLE_RESPONSE),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    },
  );
}

/** Navigate to the player detail modal and switch to Career Arc tab. */
async function openCareerArc(
  page: import('@playwright/test').Page,
  playersPage: import('../pages').PlayersPage,
  playerId = 1,
) {
  await playersPage.gotoDetail(playerId, 'networkidle');
  await playersPage.detail.expectOpen();
  await playersPage.detail.expectNotLoading();
  await playersPage.detail.switchTab('Career Arc');
}

// ── Tests: Pitching arc header stats ─────────────────────────────────────────

test.describe('Career Arc Chart — pitching arc header stats @regression', () => {
  test('shows "Peak ERA+" label for pitcher-only player', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await openCareerArc(page, playersPage);

    // Pitching-only players render ERA+ not OPS metrics
    await playersPage.detail.expectText('Peak ERA+');
  });

  test('shows correct Peak ERA+ value (291 from 2000 season)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await openCareerArc(page, playersPage);

    // 2000: ERA+ 291, 1999: ERA+ 243 — peak is 291
    await playersPage.detail.expectText('Peak ERA+');
    await playersPage.detail.expectText('291');
  });

  test('shows "Career Avg ERA+" label for pitcher', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await openCareerArc(page, playersPage);

    await playersPage.detail.expectText('Career Avg ERA+');
  });

  test('shows correct Career Avg ERA+ value ((243 + 291) / 2 = 267)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await openCareerArc(page, playersPage);

    // Average of 243 and 291 = 267
    await playersPage.detail.expectText('267');
  });

  test('shows Seasons count for pitcher', async ({ page, playersPage }) => {
    await setupMocks(page);
    await openCareerArc(page, playersPage);

    await playersPage.detail.expectText('Seasons');
    await playersPage.detail.expectText('2');
  });

  test('pitcher-only player does not show batting/pitching toggle', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await openCareerArc(page, playersPage);

    // Pitcher with no batting arc data — toggle buttons should be absent
    const dialog = playersPage.detail.dialog;
    await dialog
      .getByTestId('tab-arc-batting')
      .waitFor({ state: 'detached', timeout: 3000 })
      .catch(() => {
        // Not found in DOM is acceptable — assert it's not visible
      });
    const battingToggleCount = await dialog
      .getByTestId('tab-arc-batting')
      .count();
    expect(battingToggleCount).toBe(0);
  });
});

// ── Tests: Two-way player arc mode switching ──────────────────────────────────

test.describe('Career Arc Chart — two-way player arc mode switching @regression', () => {
  test('batting arc is the default mode for two-way player (shows OPS metrics)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await openCareerArc(page, playersPage, 2);

    // Default mode is batting — Peak OPS header should appear
    await playersPage.detail.expectText('Peak OPS');
  });

  test('clicking Pitching toggle switches arc to ERA+ metrics', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await openCareerArc(page, playersPage, 2);

    // Wait for batting arc content to confirm Career Arc panel has rendered
    await playersPage.detail.expectText('Peak OPS', { exact: true });

    // Switch to pitching mode via the arc-mode toggle.
    // "Pitching" appears twice in the dialog: nth(0)=stats nav tab, nth(1)=arc toggle.
    // LS-9795: the `{ force: true }` on these toggle clicks was cargo-culted
    // from the compare surface (same lineage as the bypass already dropped
    // from PlayerDetailSurface.switchTab). The arc toggle sits inside the
    // dialog content, above the overlay — nothing intercepts it.
    await playersPage.detail.dialog
      .getByText('Pitching', { exact: true })
      .nth(1)
      .click();

    // Now ERA+ metrics should be visible
    await playersPage.detail.expectText('Peak ERA+');
  });

  test('pitching arc shows correct ERA+ value for two-way player (185 from 2022)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await openCareerArc(page, playersPage, 2);

    await playersPage.detail.expectText('Peak OPS', { exact: true });

    await playersPage.detail.dialog
      .getByText('Pitching', { exact: true })
      .nth(1)
      .click();

    // Only one pitching season: ERA+ 185
    await playersPage.detail.expectText('185');
  });

  test('clicking Batting toggle switches arc back to OPS metrics', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await openCareerArc(page, playersPage, 2);

    await playersPage.detail.expectText('Peak OPS', { exact: true });

    // Toggle to pitching first, then back to batting.
    // Both labels appear twice: nth(0)=stats nav tab, nth(1)=arc toggle.
    await playersPage.detail.dialog
      .getByText('Pitching', { exact: true })
      .nth(1)
      .click();
    await playersPage.detail.expectText('Peak ERA+');

    await playersPage.detail.dialog
      .getByText('Batting', { exact: true })
      .nth(1)
      .click();
    await playersPage.detail.expectText('Peak OPS');
  });

  test('two-way player batting arc shows Silver Slugger award in milestone legend', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await openCareerArc(page, playersPage, 2);

    // 2023 has SS award in the batting arc
    await playersPage.detail.expectText(/Silver Slugger/);
  });

  test('two-way player pitching arc shows Cy Young award in milestone legend', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await openCareerArc(page, playersPage, 2);

    await playersPage.detail.expectText('Peak OPS', { exact: true });

    await playersPage.detail.dialog
      .getByText('Pitching', { exact: true })
      .nth(1)
      .click();

    // 2022 pitching season has CYA award
    await playersPage.detail.expectText(/Cy Young/);
  });
});

// ── Tests: Award milestone legend ─────────────────────────────────────────────

test.describe('Career Arc Chart — award milestone legend @regression', () => {
  test('shows Cy Young award in milestone legend for pitcher', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await openCareerArc(page, playersPage);

    // Pedro had CYA in both 1999 and 2000 — legend renders "Cy Young"
    await playersPage.detail.expectText(/Cy Young/);
  });

  test('shows All-Star award in milestone legend for pitcher', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await openCareerArc(page, playersPage);

    // Pedro had AS in 1999 and 2000
    await playersPage.detail.expectText(/All-Star/);
  });

  test('shows Gold Glove award in milestone legend when present', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: MULTI_TEAM_SEASON_STATS,
      careerArcBody: MULTI_TEAM_CAREER_ARC,
    });
    await openCareerArc(page, playersPage);

    // Maddux had GG awards — legend should render "Gold Glove"
    await playersPage.detail.expectText(/Gold Glove/);
  });

  test('shows season year in each milestone legend badge', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await openCareerArc(page, playersPage);

    // Legend renders "<season> <label>" — e.g. "1999 All-Star"
    await playersPage.detail.expectText(/1999/);
    await playersPage.detail.expectText(/2000/);
  });
});

// ── Tests: Teams count header stat ────────────────────────────────────────────

test.describe('Career Arc Chart — Teams header stat @regression', () => {
  test('shows Teams count when pitcher changed teams between seasons', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: MULTI_TEAM_SEASON_STATS,
      careerArcBody: MULTI_TEAM_CAREER_ARC,
    });
    await openCareerArc(page, playersPage);

    // Maddux: CHC (1992) → ATL (1994) — team change triggers Teams header
    await playersPage.detail.expectText('Teams');
    await playersPage.detail.expectText('2');
  });

  test('does not show Teams count when pitcher stayed on same team', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await openCareerArc(page, playersPage);

    // Pedro: both seasons on BOS — no team change, Teams header hidden
    const teamsCount = await playersPage.detail.dialog
      .getByText('Teams', { exact: true })
      .count();
    expect(teamsCount).toBe(0);
  });
});

// ── Tests: Empty state ────────────────────────────────────────────────────────

test.describe('Career Arc Chart — empty/no-data state @regression', () => {
  test('shows "No batting data available" when all batting seasons lack OPS data', async ({
    page,
    playersPage,
  }) => {
    // Two-way player where batting seasons exist in the raw array (so
    // hasBattingArc=true and the Batting toggle is shown) but every season
    // has onBasePlusSlugging: null — buildBattingData filters them all out,
    // leaving data.length === 0 and triggering the empty-state message.
    const noOpsArc = {
      data: {
        player: {
          __typename: 'Player',
          firstName: 'Shohei',
          lastName: 'Ohtani',
          eligiblePositions: ['SP', 'DH'],
          careerAchievements: {
            allStarSelections: 4,
            goldGloves: 0,
            silverSluggers: 0,
            mvpAwards: 0,
            cyYoungAwards: 0,
            hallOfFame: false,
            rookieOfTheYear: true,
          },
        },
        // Batting seasons present but missing onBasePlusSlugging → filtered out
        arcBatting: [
          {
            season: 2024,
            team: 'LAD',
            games: 159,
            hits: 197,
            atBats: 556,
            homeRuns: 54,
            rbi: 130,
            stolenBases: 59,
            battingAverage: 0.31,
            onBasePercentage: 0.39,
            sluggingPercentage: 0.646,
            onBasePlusSlugging: null,
            onBasePlusSluggingPlus: null,
            awardSummary: null,
          },
        ],
        // Pitching season present so Career Arc tab appears and toggle renders
        arcPitching: [
          {
            season: 2022,
            team: 'LAA',
            games: 28,
            wins: 15,
            losses: 9,
            earnedRunAverage: '2.33',
            earnedRunAveragePlus: 185,
            whip: 1.01,
            strikeouts: 219,
            inningsPitched: 166,
            awardSummary: null,
          },
        ],
      },
    };
    const noOpsSeasonStats = {
      data: {
        player: {
          __typename: 'Player',
          eligiblePositions: ['SP', 'DH'],
          firstName: 'Shohei',
          lastName: 'Ohtani',
        },
        playerSeasonBatting: [
          {
            __typename: 'SeasonBatting',
            season: 2024,
            team: 'LAD',
            games: 159,
            plateAppearances: 636,
            atBats: 556,
            runs: 134,
            hits: 197,
            doubles: 38,
            triples: 7,
            homeRuns: 54,
            rbi: 130,
            stolenBases: 59,
            caughtStealing: 10,
            baseOnBalls: 81,
            strikeouts: 164,
            battingAverage: 0.31,
            onBasePercentage: 0.39,
            sluggingPercentage: 0.646,
          },
        ],
        playerSeasonPitching: [
          {
            __typename: 'SeasonPitching',
            season: 2022,
            team: 'LAA',
            games: 28,
            wins: 15,
            losses: 9,
            gamesStarted: 28,
            completeGames: 0,
            shutouts: 0,
            saves: 0,
            inningsPitched: 166,
            hits: 118,
            runs: 48,
            earnedRuns: 43,
            homeRuns: 15,
            baseOnBalls: 44,
            strikeouts: 219,
            earnedRunAverage: '2.33',
            whip: 1.01,
          },
        ],
        playerSeasonFielding: [],
      },
    };

    await setupMocks(page, {
      seasonStatsBody: noOpsSeasonStats,
      careerArcBody: noOpsArc,
    });
    await openCareerArc(page, playersPage, 2);

    // Default mode is batting. All batting seasons have onBasePlusSlugging: null
    // so buildBattingData returns [] → empty-state message renders.
    await playersPage.detail.expectText(
      'No batting data available for career arc',
    );
  });
});
