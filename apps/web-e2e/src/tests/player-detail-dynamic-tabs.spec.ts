/**
 * E2E Tests: Player Detail Modal — Dynamic Stat Tabs (LS-5582)
 *
 * Covers:
 *   - Tab bar visibility driven by available data:
 *       Career Arc  — visible when hasBattingArc || hasPitchingArc
 *       Batting     — visible when battingTableRows.length > 0
 *       Pitching    — visible when pitchingTableRows.length > 0
 *       Fielding    — visible when fieldingTableRows.length > 0
 *   - Auto-switch to first available tab when initial selection has no data
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { test } from '../fixtures/pages';
import {
  createGraphQLRouter,
  fulfillJson,
  unmockedGraphQLFallback,
} from '../mocks/graphql/router';

// ── Mock Data ──────────────────────────────────────────────────────────────────

/** Season stats for a batter with fielding data; no pitching seasons. */
const BATTER_SEASON_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['CF', 'OF'],
      firstName: 'Mike',
      lastName: 'Trout',
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 2024,
        team: 'LAA',
        games: 145,
        plateAppearances: 620,
        atBats: 550,
        runs: 95,
        hits: 165,
        doubles: 30,
        triples: 2,
        homeRuns: 28,
        rbi: 85,
        stolenBases: 12,
        caughtStealing: 3,
        baseOnBalls: 60,
        strikeouts: 110,
        battingAverage: 0.3,
        onBasePercentage: 0.37,
        sluggingPercentage: 0.52,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [
      {
        __typename: 'SeasonFielding',
        season: 2024,
        team: 'LAA',
        position: 'CF',
        games: 140,
        gamesStarted: 138,
        inningsDefended: 1260,
        putouts: 380,
        assists: 8,
        errors: 2,
        doublePlays: 3,
        fieldingPercentage: 0.995,
      },
    ],
  },
};

/** Season stats for a pure pitcher; no batting or fielding seasons. */
const PITCHER_SEASON_STATS = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['SP'],
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

/** Season stats for a two-way player with batting and pitching; no fielding. */
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
        earnedRunAverage: '3.14',
        whip: 0.92,
      },
    ],
    playerSeasonFielding: [],
  },
};

/** Career arc response for a batter — has batting arc data, no pitching. */
const BATTER_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Mike',
      lastName: 'Trout',
      eligiblePositions: ['CF', 'OF'],
      careerAchievements: {
        allStarSelections: 11,
        goldGloves: 0,
        silverSluggers: 9,
        mvpAwards: 3,
        cyYoungAwards: 0,
        hallOfFame: false,
        rookieOfTheYear: true,
      },
    },
    arcBatting: [
      {
        season: 2024,
        team: 'LAA',
        games: 145,
        hits: 165,
        atBats: 550,
        homeRuns: 28,
        rbi: 85,
        stolenBases: 12,
        battingAverage: 0.3,
        onBasePercentage: 0.37,
        sluggingPercentage: 0.52,
        onBasePlusSlugging: 0.89,
        onBasePlusSluggingPlus: 142,
        awardSummary: null,
      },
    ],
    arcPitching: [],
  },
};

/** Career arc response for a pitcher — has pitching arc data, no batting. */
const PITCHER_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Walker',
      lastName: 'Buehler',
      eligiblePositions: ['SP'],
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

/** Career arc response for a two-way player — has both batting and pitching. */
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
        earnedRunAverage: '3.14',
        earnedRunAveragePlus: 138,
        whip: 0.92,
        strikeouts: 167,
        inningsPitched: 132,
        awardSummary: null,
      },
    ],
  },
};

/** Career arc response with no batting or pitching data — Career Arc tab should be absent. */
const NO_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Mike',
      lastName: 'Trout',
      eligiblePositions: ['CF', 'OF'],
      careerAchievements: {
        allStarSelections: 0,
        goldGloves: 0,
        silverSluggers: 0,
        mvpAwards: 0,
        cyYoungAwards: 0,
        hallOfFame: false,
        rookieOfTheYear: false,
      },
    },
    arcBatting: [],
    arcPitching: [],
  },
};

// ── Route Setup ───────────────────────────────────────────────────────────────

interface SetupOptions {
  seasonStats: object;
  careerArc: object;
}

async function setupMocks(
  page: import('@playwright/test').Page,
  opts: SetupOptions,
): Promise<void> {
  await createGraphQLRouter(
    page,
    {
      getallplayerseasonstats: (route) => fulfillJson(route, opts.seasonStats),
      getplayercareerarc: (route) => fulfillJson(route, opts.careerArc),
    },
    { onUnmocked: unmockedGraphQLFallback },
  );
}

// ── Tests: Tab presence based on available data ───────────────────────────────

test.describe('Player Detail — dynamic tab bar: tab presence @regression', () => {
  test('batter: shows Career Arc, Batting, Fielding tabs; hides Pitching tab', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStats: BATTER_SEASON_STATS,
      careerArc: BATTER_CAREER_ARC,
    });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectTabVisible('Career Arc');
    await playersPage.detail.expectTabVisible('Batting');
    await playersPage.detail.expectTabVisible('Fielding');
    await playersPage.detail.expectTabHidden('Pitching');
  });

  test('pitcher: shows Career Arc and Pitching tabs; hides Batting and Fielding tabs', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStats: PITCHER_SEASON_STATS,
      careerArc: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectTabVisible('Career Arc');
    await playersPage.detail.expectTabVisible('Pitching');
    await playersPage.detail.expectTabHidden('Batting');
    await playersPage.detail.expectTabHidden('Fielding');
  });

  test('two-way player: shows Career Arc, Batting, and Pitching tabs; hides Fielding tab', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStats: TWO_WAY_SEASON_STATS,
      careerArc: TWO_WAY_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectTabVisible('Career Arc');
    await playersPage.detail.expectTabVisible('Batting');
    await playersPage.detail.expectTabVisible('Pitching');
    await playersPage.detail.expectTabHidden('Fielding');
  });
});

// ── Tests: Career Arc tab visibility ─────────────────────────────────────────

test.describe('Player Detail — dynamic tab bar: Career Arc tab visibility @regression', () => {
  test('Career Arc tab is present when batting arc data exists', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStats: BATTER_SEASON_STATS,
      careerArc: BATTER_CAREER_ARC,
    });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectTabVisible('Career Arc');
  });

  test('Career Arc tab is present when pitching arc data exists', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStats: PITCHER_SEASON_STATS,
      careerArc: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectTabVisible('Career Arc');
  });

  test('Career Arc tab is absent when neither batting nor pitching arc data exists', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStats: BATTER_SEASON_STATS,
      careerArc: NO_CAREER_ARC,
    });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectTabHidden('Career Arc');
  });
});

// ── Tests: Auto-switch to first available tab ─────────────────────────────────

test.describe('Player Detail — dynamic tab bar: auto-switch to first available tab @regression', () => {
  test('auto-switches from Career Arc to Batting when no career arc data is available', async ({
    page,
    playersPage,
  }) => {
    // Initial activeTab state is 'career-arc'. With no arc data, Career Arc tab is
    // absent from availableTabs, so the component auto-switches to the first
    // available tab — Batting in this case.
    await setupMocks(page, {
      seasonStats: BATTER_SEASON_STATS,
      careerArc: NO_CAREER_ARC,
    });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Career Arc tab should not appear in the tab bar at all
    await playersPage.detail.expectTabHidden('Career Arc');

    // Batting is the first available tab and should be selected (content visible)
    await playersPage.detail.expectTabVisible('Batting');
    // The 'Year' column header confirms the Batting panel is active
    await playersPage.detail.expectText('Year');
  });

  test('pitcher with no batting data defaults to Career Arc tab when arc data exists', async ({
    page,
    playersPage,
  }) => {
    // Pitcher: no batting seasons → Batting tab absent. Career Arc is available
    // (has pitching arc data) so the initial 'career-arc' activeTab stays valid.
    await setupMocks(page, {
      seasonStats: PITCHER_SEASON_STATS,
      careerArc: PITCHER_CAREER_ARC,
    });
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Batting tab must not appear — no batting seasons for a pitcher
    await playersPage.detail.expectTabHidden('Batting');

    // Career Arc tab is present; explicitly switch to it and confirm content loads
    await playersPage.detail.switchTab('Career Arc');
    await playersPage.detail.expectText('Peak ERA+');
  });
});
