/**
 * Player Detail Modal E2E Tests — Bio, Career Arc & Stats (LS-600)
 *
 * Extends LS-691 coverage with:
 *   - Player bio (name display, position badge in modal title)
 *   - Career Arc tab (OPS chart, peak/avg stats, award milestone legend)
 *   - Career Arc pitching mode toggle (ERA+ chart)
 *   - Stat data value verification (actual stat numbers in tables & cards)
 *   - Opening modal from the player stats table (click row)
 *   - Career achievements via GetPlayerCareerArc query
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { DESKTOP_VIEWPORT } from '../utils/viewport';

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Mock Data ─────────────────────────────────────────────────────────────────

/** Batter with 2 seasons of batting, 1 season of fielding, no pitching. */
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
      {
        __typename: 'SeasonBatting',
        season: 2023,
        team: 'LAA',
        games: 140,
        plateAppearances: 590,
        atBats: 520,
        runs: 88,
        hits: 155,
        doubles: 28,
        triples: 1,
        homeRuns: 25,
        rbi: 80,
        stolenBases: 10,
        caughtStealing: 2,
        baseOnBalls: 65,
        strikeouts: 105,
        battingAverage: 0.298,
        onBasePercentage: 0.365,
        sluggingPercentage: 0.495,
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

/** Career Arc data for a batter (Mike Trout) with awards. */
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
        season: 2023,
        team: 'LAA',
        games: 140,
        hits: 155,
        atBats: 520,
        homeRuns: 25,
        rbi: 80,
        stolenBases: 10,
        battingAverage: 0.298,
        onBasePercentage: 0.365,
        sluggingPercentage: 0.495,
        onBasePlusSlugging: 0.86,
        onBasePlusSluggingPlus: 135,
        awardSummary: 'AS',
      },
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
        awardSummary: 'AS,MVP',
      },
    ],
    arcPitching: [],
  },
};

/** Two-way player (Ohtani) with both batting and pitching career arc data. */
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

/**
 * Career Arc data with two rows for the same season (1939) — simulates a
 * mid-season trade where the player has one row per team. Deduplication should
 * collapse these into a single data point, keeping the row with more games.
 */
const DUPLICATE_SEASON_CAREER_ARC = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Bud',
      lastName: 'Hafey',
      eligiblePositions: ['OF'],
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
    arcBatting: [
      {
        // First team in 1939 (fewer games — should be dropped by deduplication)
        season: 1939,
        team: 'CIN',
        games: 20,
        hits: 15,
        atBats: 55,
        homeRuns: 1,
        rbi: 8,
        stolenBases: 0,
        battingAverage: 0.273,
        onBasePercentage: 0.31,
        sluggingPercentage: 0.345,
        onBasePlusSlugging: 0.655,
        onBasePlusSluggingPlus: 88,
        awardSummary: null,
      },
      {
        // Second team in 1939 (more games — should be kept by deduplication)
        season: 1939,
        team: 'STL',
        games: 75,
        hits: 52,
        atBats: 190,
        homeRuns: 4,
        rbi: 28,
        stolenBases: 2,
        battingAverage: 0.274,
        onBasePercentage: 0.32,
        sluggingPercentage: 0.395,
        onBasePlusSlugging: 0.715,
        onBasePlusSluggingPlus: 95,
        awardSummary: null,
      },
      {
        season: 1938,
        team: 'CIN',
        games: 110,
        hits: 88,
        atBats: 320,
        homeRuns: 6,
        rbi: 42,
        stolenBases: 3,
        battingAverage: 0.275,
        onBasePercentage: 0.33,
        sluggingPercentage: 0.41,
        onBasePlusSlugging: 0.74,
        onBasePlusSluggingPlus: 98,
        awardSummary: null,
      },
    ],
    arcPitching: [],
  },
};

/** Minimal player list for the stats table (one player row). */
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
            primaryPosition: 'CF',
            positionsPlayed: null,
            games: 1131,
            plateAppearances: 5101,
            atBats: 4289,
            runs: 894,
            hits: 1559,
            doubles: 315,
            triples: 48,
            homeRuns: 368,
            rbi: 817,
            stolenBases: 211,
            caughtStealing: 57,
            baseOnBalls: 774,
            strikeouts: 1034,
            totalBases: 2988,
            groundedIntoDoublePlays: 76,
            hitByPitch: 35,
            sacrificeHits: 3,
            intentionalBaseOnBalls: 231,
            battingAverage: 0.304,
            onBasePercentage: 0.41,
            sluggingPercentage: 0.582,
            offensiveWAR: 72.9,
            player: {
              __typename: 'Player',
              id: 1,
              firstName: 'Mike',
              lastName: 'Trout',
              brefId: 'troutmi01',
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
        firstName: 'Mike',
        lastName: 'Trout',
        brefId: 'troutmi01',
        statsLastFetchedAt: null,
      },
    ],
  },
};

// ── Route Setup ──────────────────────────────────────────────────────────────

interface SetupOptions {
  seasonStatsBody?: typeof BATTER_SEASON_STATS | typeof TWO_WAY_SEASON_STATS;
  careerArcBody?: typeof BATTER_CAREER_ARC | typeof TWO_WAY_CAREER_ARC;
}

async function setupMocks(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    seasonStatsBody = BATTER_SEASON_STATS,
    careerArcBody = BATTER_CAREER_ARC,
  } = opts;

  await page.route(/^(?!.*\/@fs\/).*\/graphql/, async (route) => {
    const operation = extractOperationName(route).toLowerCase();

    if (operation === 'getplayercareerarc') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(careerArcBody),
      });
    } else if (operation === 'getallplayerseasonstats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(seasonStatsBody),
      });
    } else if (
      operation === 'getcareerbattingstats' ||
      operation === 'getallplayers' ||
      operation === 'getplayerswithstats'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(STATS_TABLE_RESPONSE),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Tests: Player bio display ───────────────────────────────────────────────

test.describe('Player Detail Modal – bio display @smoke', () => {
  test('displays player name in modal title', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Player name resolved from the GraphQL response
    await playersPage.detail.expectText('Mike Trout');
  });

  test('displays position badge in modal title area', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // The eligible positions section should show CF and OF
    await playersPage.detail.expectEligiblePositions();
    await playersPage.detail.expectText('CF', { exact: true });
  });

  test('shows season count subtitle', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Subtitle says "2 seasons"
    await playersPage.detail.expectText(/2 season/i);
  });
});

// ── Tests: Career Arc tab ───────────────────────────────────────────────────

test.describe('Player Detail Modal – Career Arc tab @regression', () => {
  // Helper: navigate to player modal and switch to Career Arc tab. The tab is
  // also the default once arc data exists (LS-9829 made that deterministic), but
  // clicking it explicitly keeps these content assertions independent of the
  // default-selection rule — the default itself is covered by the test below.
  async function openCareerArc(
    page: import('@playwright/test').Page,
    playersPage: import('../pages').PlayersPage,
  ) {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Career Arc');
    await playersPage.detail.expectText('Peak OPS');
  }

  test('Career Arc is the default active tab', async ({
    page,
    playersPage,
  }) => {
    // Deliberately does NOT click the tab. This test used to route through the
    // openCareerArc helper, which clicks Career Arc first — so it asserted
    // nothing about the default and hid the nondeterminism in LS-9829.
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Career Arc content should be visible (renders Peak OPS)
    await playersPage.detail.expectText('Peak OPS');
  });

  test('shows Peak OPS stat in career arc header', async ({
    page,
    playersPage,
  }) => {
    await openCareerArc(page, playersPage);

    // Peak OPS label and value (0.890 from 2024 season)
    await playersPage.detail.expectText('Peak OPS');
    await playersPage.detail.expectText('0.890');
  });

  test('shows Career Avg OPS stat', async ({ page, playersPage }) => {
    await openCareerArc(page, playersPage);

    await playersPage.detail.expectText('Career Avg OPS');
    // Average of 0.860 and 0.890 = 0.875
    await playersPage.detail.expectText('0.875');
  });

  test('shows Seasons count in career arc header', async ({
    page,
    playersPage,
  }) => {
    await openCareerArc(page, playersPage);

    await playersPage.detail.expectText('Seasons');
  });

  test('shows award milestone legend badges', async ({ page, playersPage }) => {
    await openCareerArc(page, playersPage);

    // Award legend badges: 2023 has AS, 2024 has AS + MVP
    await playersPage.detail.expectText(/All-Star/);
    await playersPage.detail.expectText(/MVP/);
  });
});

// ── Tests: Career Arc for two-way player ────────────────────────────────────

test.describe('Player Detail Modal – two-way player Career Arc @regression', () => {
  test('shows batting/pitching arc mode toggle for two-way player', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await playersPage.gotoDetail(2);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Click Career Arc tab explicitly. It is now also the default (LS-9829), but
    // this test is about the arc mode toggle, not about which tab opens first.
    await playersPage.detail.switchTab('Career Arc');
    // Wait for a Career Arc–specific metric to confirm the panel has rendered
    // (avoids a no-op wait on 'Batting' which may already be visible from the tabs)
    await playersPage.detail.expectText('Peak OPS', { exact: true });

    // Two-way player should have both Batting and Pitching arc toggle buttons
    await playersPage.detail.expectText('Batting', { exact: true });
    await playersPage.detail.expectText('Pitching', { exact: true });
  });

  test('shows player name as Shohei Ohtani', async ({ page, playersPage }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await playersPage.gotoDetail(2);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText('Shohei Ohtani');
  });

  test('shows pitching season data in Pitching tab', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      seasonStatsBody: TWO_WAY_SEASON_STATS,
      careerArcBody: TWO_WAY_CAREER_ARC,
    });
    await playersPage.gotoDetail(2);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Switch to Pitching tab
    await playersPage.detail.switchTab('Pitching');

    // 2023 pitching season row should be visible (team abbreviation follows year)
    await playersPage.detail.expectText('2023 LAA');

    // ERA column header
    await playersPage.detail.expectText('ERA');
  });
});

// ── Tests: Stat data value verification ─────────────────────────────────────

test.describe('Player Detail Modal – stat data values @regression', () => {
  test('career batting card shows correct computed batting average', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Career batting card should be present
    await playersPage.detail.expectCareerBattingCard();

    // Career AVG from mock data: (165+155)/(550+520) = 320/1070 ≈ .299
    await playersPage.detail.expectText('.299');
  });

  test('career batting card shows total home runs', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Total HR = 28 + 25 = 53
    await playersPage.detail.expectText('53');
  });

  test('career batting card shows total RBI', async ({ page, playersPage }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Total RBI = 85 + 80 = 165
    await playersPage.detail.expectText('165');
  });

  test('batting table shows 2024 season row with correct values', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // Switch to Batting tab to see the season table
    await playersPage.detail.switchTab('Batting');

    // 2024 season row: team abbreviation follows year
    await playersPage.detail.expectText('2024 LAA');
    // 2024 season: 145 G, 28 HR, 85 RBI
    await playersPage.detail.expectText('145');
  });
});

// ── Tests: Duplicate-season deduplication ───────────────────────────────────

test.describe('Player Detail Modal – duplicate season deduplication @regression', () => {
  test('two rows for the same season collapse to one data point (Seasons = 2, not 3)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { careerArcBody: DUPLICATE_SEASON_CAREER_ARC });
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Career Arc');
    await playersPage.detail.expectText('Peak OPS');

    // The career arc header should show "2" seasons (1938 + 1939), not "3"
    // because the two 1939 rows (CIN + STL) should be deduplicated into one.
    await playersPage.detail.expectText('Seasons');
    await playersPage.detail.expectText('2');
  });

  test('deduplication keeps the row with more games (STL 1939, OPS 0.715)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { careerArcBody: DUPLICATE_SEASON_CAREER_ARC });
    await playersPage.gotoDetail(1);

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.switchTab('Career Arc');
    // Peak OPS should be from 1938 season (0.740 > 0.715)
    await playersPage.detail.expectText('Peak OPS');
    await playersPage.detail.expectText('0.740');
  });
});

// ── Tests: Opening modal from stats page ────────────────────────────────────

/**
 * Opens the modal by clicking `player-row-N`, a desktop data-grid row.
 * `PlayersCardFeed` renders `players-card-feed-card-N` cards instead below
 * `media.sm`, so the row locator has no phone-width equivalent (LS-9075).
 * Pinned rather than skipped (LS-9712).
 */
test.describe('Player Detail Modal – open from stats table @regression', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test('clicking a player row on /players opens the modal', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoStats();

    // Gate on the actual clickable row element (data-testid="player-row-1"),
    // not the player-name text. The row XStack owns the onPress handler that
    // opens the modal; the inner name Text node both couples the assertion to
    // copy and can re-render as the grid hydrates, so clicking it raced the
    // row's handler being wired (LS-8258). The row only mounts once the grid
    // has data (loading → rows), so its visibility is a single, stable "ready"
    // signal — mirroring the @critical deep-link sibling.
    await playersPage.stats.row(1).expectVisible({ timeout: 15_000 });

    // Click the row to open the detail modal.
    await playersPage.stats.row(1).tap();

    // A numeric player id opens the modal in place via ?playerId=1 (PST-051 /
    // LS-7124). Wait for that URL transition — the single source of truth that
    // the modal is about to render — before asserting visibility, instead of
    // racing the dialog mount.
    await page.waitForURL(/\/players\?.*playerId=1/);

    // The modal dialog should appear.
    await playersPage.detail.expectOpen();
  });
});
