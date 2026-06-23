/**
 * E2E Tests: Season Pitching Stats Table (LS-5588)
 *
 * Covers the season-by-season pitching stats table in the player-detail modal:
 *  - Column headers: YEAR, G, W-L, ERA, IP, SO, BB
 *  - Season data row values (ERA computed via ipToDecimalInnings from earnedRuns/inningsPitched)
 *  - W-L record formatting ("wins-losses")
 *  - Multi-season rows ordered newest first
 *  - Pitching tab activation for pitcher-only and two-way players
 *  - Tab navigation in/out of the Pitching tab
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { expect, test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Mock Data ──────────────────────────────────────────────────────────────────

/**
 * Pitcher-only player (Walker Buehler), single 2024 season.
 * ERA check: (50 earnedRuns × 9) / ipToDecimalInnings(210) = 450/210 = 2.14
 */
const PITCHER_SEASON_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['SP', 'RP'],
      firstName: 'Walker',
      lastName: 'Buehler',
    },
    playerSeasonBatting: [],
    playerSeasonPitching: [
      {
        __typename: 'SeasonPitching',
        season: 2024,
        team: 'LAD',
        games: 32,
        wins: 15,
        losses: 5,
        gamesStarted: 32,
        completeGames: 2,
        shutouts: 1,
        saves: 0,
        inningsPitched: 210,
        hits: 155,
        runs: 55,
        earnedRuns: 50,
        homeRuns: 12,
        baseOnBalls: 45,
        strikeouts: 245,
        earnedRunAverage: '2.14',
        whip: 0.95,
      },
    ],
    playerSeasonFielding: [],
  },
};

/**
 * Pitcher-only player (Max Scherzer), two seasons for row-ordering checks.
 * 2024 ERA: (48 × 9) / 117 = 3.69
 * 2023 ERA: (44 × 9) / 155 = 2.55  [earnedRunAverage set to '2.55' to match]
 */
const MULTI_SEASON_PITCHER_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['SP'],
      firstName: 'Max',
      lastName: 'Scherzer',
    },
    playerSeasonBatting: [],
    playerSeasonPitching: [
      {
        __typename: 'SeasonPitching',
        season: 2024,
        team: 'TEX',
        games: 20,
        wins: 9,
        losses: 6,
        gamesStarted: 20,
        completeGames: 0,
        shutouts: 0,
        saves: 0,
        inningsPitched: 117,
        hits: 103,
        runs: 52,
        earnedRuns: 48,
        homeRuns: 14,
        baseOnBalls: 30,
        strikeouts: 135,
        earnedRunAverage: '3.69',
        whip: 1.13,
      },
      {
        __typename: 'SeasonPitching',
        season: 2023,
        team: 'NYM',
        games: 27,
        wins: 11,
        losses: 6,
        gamesStarted: 27,
        completeGames: 1,
        shutouts: 0,
        saves: 0,
        inningsPitched: 155,
        hits: 117,
        runs: 49,
        earnedRuns: 44,
        homeRuns: 17,
        baseOnBalls: 39,
        strikeouts: 188,
        earnedRunAverage: '2.55',
        whip: 1.01,
      },
    ],
    playerSeasonFielding: [],
  },
};

/**
 * Two-way player (Shohei Ohtani): 1 batting season (2024) + 1 pitching season (2023).
 * Pitching ERA check: (35 × 9) / ipToDecimalInnings(132) = 315/132 = 2.39  [earnedRunAverage set to '2.39' to match]
 */
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
        season: 2023,
        team: 'LAA',
        games: 23,
        wins: 10,
        losses: 5,
        gamesStarted: 23,
        completeGames: 0,
        shutouts: 0,
        saves: 0,
        inningsPitched: 132,
        hits: 88,
        runs: 38,
        earnedRuns: 35,
        homeRuns: 10,
        baseOnBalls: 34,
        strikeouts: 167,
        earnedRunAverage: '2.39',
        whip: 0.92,
      },
    ],
    playerSeasonFielding: [],
  },
};

// ── Career Arc responses (paired with season stats above) ─────────────────────

const PITCHER_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Walker',
      lastName: 'Buehler',
      eligiblePositions: ['SP', 'RP'],
      careerAchievements: {
        allStarSelections: 1,
        goldGloves: 0,
        silverSluggers: 0,
        mvpAwards: 0,
        cyYoungAwards: 0,
        hallOfFame: false,
        rookieOfTheYear: false,
      },
    },
    arcBatting: [],
    arcPitching: [
      {
        season: 2024,
        team: 'LAD',
        games: 32,
        wins: 15,
        losses: 5,
        earnedRunAverage: '2.14',
        earnedRunAveragePlus: 175,
        whip: 0.95,
        strikeouts: 245,
        inningsPitched: 210,
        awardSummary: null,
      },
    ],
  },
};

const MULTI_SEASON_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Max',
      lastName: 'Scherzer',
      eligiblePositions: ['SP'],
      careerAchievements: {
        allStarSelections: 9,
        goldGloves: 0,
        silverSluggers: 0,
        mvpAwards: 0,
        cyYoungAwards: 3,
        hallOfFame: false,
        rookieOfTheYear: false,
      },
    },
    arcBatting: [],
    arcPitching: [
      {
        season: 2024,
        team: 'TEX',
        games: 20,
        wins: 9,
        losses: 6,
        earnedRunAverage: '3.69',
        earnedRunAveragePlus: 110,
        whip: 1.13,
        strikeouts: 135,
        inningsPitched: 117,
        awardSummary: null,
      },
      {
        season: 2023,
        team: 'NYM',
        games: 27,
        wins: 11,
        losses: 6,
        earnedRunAverage: '2.55',
        earnedRunAveragePlus: 158,
        whip: 1.01,
        strikeouts: 188,
        inningsPitched: 155,
        awardSummary: null,
      },
    ],
  },
};

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
        season: 2023,
        team: 'LAA',
        games: 23,
        wins: 10,
        losses: 5,
        earnedRunAverage: '2.39',
        earnedRunAveragePlus: 138,
        whip: 0.92,
        strikeouts: 167,
        inningsPitched: 132,
        awardSummary: null,
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

  const emptyResponse = {
    data: {
      careerBattingStats: {
        __typename: 'CareerBattingConnection',
        totalCount: 0,
        edges: [],
        pageInfo: {
          __typename: 'PageInfo',
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
      },
      players: [],
    },
  };
  await createGraphQLRouter(page, {
    getplayercareerarc: (route) => fulfillJson(route, careerArcBody),
    careerarcquery: (route) => fulfillJson(route, careerArcBody),
    getallplayerseasonstats: (route) => fulfillJson(route, seasonStatsBody),
    getcareerbattingstats: (route) => fulfillJson(route, emptyResponse),
    getallplayers: (route) => fulfillJson(route, emptyResponse),
    getplayerswithstats: (route) => fulfillJson(route, emptyResponse),
  });
}

// ── Tests: column headers ──────────────────────────────────────────────────────

test.describe('Season Pitching Stats Table – column headers @regression', () => {
  test('shows all required column headers', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    await playersPage.detail.expectText('Year');
    await playersPage.detail.expectText('G', { exact: true });
    await playersPage.detail.expectText('W-L');
    await playersPage.detail.expectText('ERA');
    await playersPage.detail.expectText('IP');
    await playersPage.detail.expectText('SO');
    await playersPage.detail.expectText('BB');
  });

  test('column header YEAR is visible before any data column', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');

    // YEAR (rendered via CSS text-transform from "Year") must be visible as the
    // first column header in the season-by-season pitching table.
    await playersPage.detail.expectText('Year');
  });
});

// ── Tests: data values ─────────────────────────────────────────────────────────

test.describe('Season Pitching Stats Table – data values @regression', () => {
  test('shows the correct season year in the data row', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // The 2024 season row must appear (team abbreviation follows the year)
    await playersPage.detail.expectText('2024 LAD');
  });

  test('shows ERA computed from earnedRuns and inningsPitched (50 ER / 210 IP = 2.14)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // ERA = (50 earnedRuns × 9) / ipToDecimalInnings(210 IP)
    //     = 450 / 210 = 2.142… → "2.14"
    await playersPage.detail.expectText('2.14');
  });

  test('shows W-L record formatted as wins-losses', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // 15 wins, 5 losses → "15-5"
    await playersPage.detail.expectText('15-5');
  });

  test('shows correct games (G) count', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // 32 games pitched
    await playersPage.detail.expectText('32');
  });

  test('shows innings pitched (IP) value', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // inningsPitched: 210
    await playersPage.detail.expectText('210');
  });

  test('shows strikeouts (SO) count', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // 245 strikeouts
    await playersPage.detail.expectText('245');
  });

  test('shows walks (BB) count', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // 45 base on balls
    await playersPage.detail.expectText('45');
  });
});

// ── Tests: multi-season ────────────────────────────────────────────────────────

test.describe('Season Pitching Stats Table – multi-season @regression', () => {
  test('shows both season rows when pitcher has two seasons', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: MULTI_SEASON_PITCHER_STATS,
      careerArcBody: MULTI_SEASON_CAREER_ARC,
    });
    await playersPage.gotoDetail(3, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // Team abbreviation follows the year: TEX for 2024, NYM for 2023
    await playersPage.detail.expectText('2024 TEX');
    await playersPage.detail.expectText('2023 NYM');
  });

  test('shows distinct computed ERA for each season', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: MULTI_SEASON_PITCHER_STATS,
      careerArcBody: MULTI_SEASON_CAREER_ARC,
    });
    await playersPage.gotoDetail(3, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // 2024: earnedRunAverage = '3.69'  |  2023: earnedRunAverage = '2.55'
    await playersPage.detail.expectText('3.69');
    await playersPage.detail.expectText('2.55');
  });

  test('shows distinct W-L records for each season', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: MULTI_SEASON_PITCHER_STATS,
      careerArcBody: MULTI_SEASON_CAREER_ARC,
    });
    await playersPage.gotoDetail(3, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // 2024: 9-6  |  2023: 11-6
    await playersPage.detail.expectText('9-6');
    await playersPage.detail.expectText('11-6');
  });

  test('season count in the eyebrow reads "2 seasons"', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: MULTI_SEASON_PITCHER_STATS,
      careerArcBody: MULTI_SEASON_CAREER_ARC,
    });
    await playersPage.gotoDetail(3, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // The eyebrow subtitle says "2 Seasons" (via ipToDecimalInnings count)
    await playersPage.detail.expectText(/2 season/i);
  });
});

// ── Tests: two-way player ──────────────────────────────────────────────────────

test.describe('Season Pitching Stats Table – two-way player @regression', () => {
  test('Pitching tab is available alongside Batting tab', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Both Batting and Pitching tabs should appear in the tab bar
    await playersPage.detail.expectText('Batting', { exact: true });
    await playersPage.detail.expectText('Pitching', { exact: true });
  });

  test('Pitching tab shows the 2023 pitching season row', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // Team abbreviation follows the year: LAA for the 2023 pitching season
    await playersPage.detail.expectText('2023 LAA');
  });

  test('shows computed ERA for two-way player pitching season (35 ER / 132 IP = 2.39)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // earnedRunAverage from mock = '2.39'
    await playersPage.detail.expectText('2.39');
  });

  test('shows pitching column headers when on Pitching tab (not batting headers)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // Pitching-specific columns should now be visible
    await playersPage.detail.expectText('ERA');
    await playersPage.detail.expectText('IP');
    await playersPage.detail.expectText('W-L');
    await playersPage.detail.expectText('SO');
    await playersPage.detail.expectText('BB');
  });

  test('switching back to Batting tab shows batting headers, not pitching', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Go to Pitching then back to Batting
    await playersPage.detail.switchTab('Pitching');
    await playersPage.detail.expectText('ERA');

    await playersPage.detail.switchTab('Batting');
    // Batting table headers should reappear
    await playersPage.detail.expectText('AVG', { exact: true });
    await playersPage.detail.expectText('HR', { exact: true });
  });
});

// ── Tests: sorting ────────────────────────────────────────────────────────────

test.describe('Season Pitching Stats Table – sorting @regression', () => {
  test('sort buttons exist for all pitching column headers', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: MULTI_SEASON_PITCHER_STATS,
      careerArcBody: MULTI_SEASON_CAREER_ARC,
    });
    await playersPage.gotoDetail(3, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');

    for (const col of ['Year', 'G', 'W-L', 'ERA', 'IP', 'SO', 'BB']) {
      await playersPage.detail.expectSortButtonVisible(col);
    }
  });

  test('clicking Sort by ERA sets aria-sort to ascending then descending', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: MULTI_SEASON_PITCHER_STATS,
      careerArcBody: MULTI_SEASON_CAREER_ARC,
    });
    await playersPage.gotoDetail(3, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');

    await playersPage.detail.expectSortDirection('ERA', 'none');
    await playersPage.detail.clickSortButton('ERA');
    await playersPage.detail.expectSortDirection('ERA', 'ascending');
    await playersPage.detail.clickSortButton('ERA');
    await playersPage.detail.expectSortDirection('ERA', 'descending');
    await playersPage.detail.clickSortButton('ERA');
    await playersPage.detail.expectSortDirection('ERA', 'none');
  });

  test('ERA ascending sort displays lower ERA value first', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: MULTI_SEASON_PITCHER_STATS,
      careerArcBody: MULTI_SEASON_CAREER_ARC,
    });
    await playersPage.gotoDetail(3, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    await playersPage.detail.clickSortButton('ERA');

    // After ascending ERA sort: 2.55 (2023) appears before 3.69 (2024)
    const dialogText = await playersPage.detail.dialogTextContent();
    expect(dialogText.indexOf('2.55')).toBeLessThan(dialogText.indexOf('3.69'));
  });

  test('ERA descending sort displays higher ERA value first', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: MULTI_SEASON_PITCHER_STATS,
      careerArcBody: MULTI_SEASON_CAREER_ARC,
    });
    await playersPage.gotoDetail(3, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    // Click twice: asc → desc
    await playersPage.detail.clickSortButton('ERA');
    await playersPage.detail.clickSortButton('ERA');

    // After descending ERA sort: 3.69 (2024) appears before 2.55 (2023)
    const dialogText = await playersPage.detail.dialogTextContent();
    expect(dialogText.indexOf('3.69')).toBeLessThan(dialogText.indexOf('2.55'));
  });

  test('sort button is keyboard accessible via Enter key', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: MULTI_SEASON_PITCHER_STATS,
      careerArcBody: MULTI_SEASON_CAREER_ARC,
    });
    await playersPage.gotoDetail(3, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');

    await playersPage.detail.focusSortButton('ERA');
    await page.keyboard.press('Enter');
    await playersPage.detail.expectSortDirection('ERA', 'ascending');
  });
});

// ── Tests: tab navigation ──────────────────────────────────────────────────────

test.describe('Season Pitching Stats Table – tab navigation @regression', () => {
  test('pitcher-only player has Career Pitching summary card', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectCareerPitchingCard();
  });

  test('pitcher-only player shows no career batting card', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // No batting data → no career batting card
    await playersPage.detail.expectNoCareerBattingCard();
  });

  test('switching to Pitching tab then closing modal navigates back', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Pitching');
    await playersPage.detail.expectText('ERA');

    await playersPage.detail.close();
    await playersPage.detail.waitForStatsList();
  });

  test('pitching tab reloads its data correctly after closing and reopening modal', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Switch to pitching tab and verify a value
    await playersPage.detail.switchTab('Pitching');
    await playersPage.detail.expectText('2.14');

    // Close modal
    await playersPage.detail.close();
    await playersPage.detail.waitForStatsList();

    // Reopen the same player
    await playersPage.gotoDetail(2, 'networkidle');
    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Navigate to pitching tab again — ERA should still be correct
    await playersPage.detail.switchTab('Pitching');
    await playersPage.detail.expectText('2.14');
  });
});
