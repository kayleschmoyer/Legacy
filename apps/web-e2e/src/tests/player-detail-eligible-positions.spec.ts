/**
 * E2E Tests: Player Detail – Eligible Positions Badges (LS-5583)
 *
 * Covers:
 *  - Eligible positions row visibility for batters, pitchers, two-way players
 *  - "Eligible" section label display
 *  - All position abbreviations rendered as badges
 *  - Row hidden when eligiblePositions is empty or query errors
 *  - Position badges are color-coded by position group
 *
 * Element access goes through the injected `playersPage` semantic object
 * (ADR-0015); GraphQL mocks stay inline (ADR-0015 §6).
 */

import { expect, test } from '../fixtures/pages';
import { extractOperationName } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Mock Data ──────────────────────────────────────────────────────────────────

/** Batter with two eligible positions: CF (utility/fallback color) and OF (outfield color). */
const BATTER_RESPONSE = {
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
        onBasePlusSluggingPlus: 142,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
};

/** Pitcher with two eligible positions: SP and RP (both use utility/fallback color). */
const PITCHER_RESPONSE = {
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

/** Two-way player with SP (pitcher utility) and DH (utility) eligible positions. */
const TWO_WAY_RESPONSE = {
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

/**
 * Player with season data but empty eligiblePositions — the section must not
 * render even though other modal content is visible.
 */
const NO_POSITIONS_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: [],
      firstName: 'Unknown',
      lastName: 'Player',
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 2024,
        team: 'TST',
        games: 10,
        plateAppearances: 40,
        atBats: 35,
        runs: 5,
        hits: 10,
        doubles: 2,
        triples: 0,
        homeRuns: 1,
        rbi: 4,
        stolenBases: 0,
        caughtStealing: 0,
        baseOnBalls: 5,
        strikeouts: 8,
        battingAverage: 0.286,
        onBasePercentage: 0.35,
        sluggingPercentage: 0.4,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
};

// ── Route Setup ───────────────────────────────────────────────────────────────

const BATTER_CAREER_ARC_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Mike',
      lastName: 'Trout',
      eligiblePositions: ['CF', 'OF'],
    },
    arcBatting: [],
    arcPitching: [],
  },
};

const PITCHER_CAREER_ARC_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Walker',
      lastName: 'Buehler',
      eligiblePositions: ['SP', 'RP'],
    },
    arcBatting: [],
    arcPitching: [],
  },
};

const TWO_WAY_CAREER_ARC_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Shohei',
      lastName: 'Ohtani',
      eligiblePositions: ['SP', 'DH'],
    },
    arcBatting: [],
    arcPitching: [],
  },
};

const EMPTY_CAREER_ARC_RESPONSE = {
  data: {
    player: null,
    arcBatting: [],
    arcPitching: [],
  },
};

function deriveCareerArcBody(seasonStatsBody: object): object {
  if (seasonStatsBody === PITCHER_RESPONSE) return PITCHER_CAREER_ARC_RESPONSE;
  if (seasonStatsBody === TWO_WAY_RESPONSE) return TWO_WAY_CAREER_ARC_RESPONSE;
  if (seasonStatsBody === NO_POSITIONS_RESPONSE || 'errors' in seasonStatsBody)
    return EMPTY_CAREER_ARC_RESPONSE;
  return BATTER_CAREER_ARC_RESPONSE;
}

async function setupMocks(
  page: import('@playwright/test').Page,
  seasonStatsBody: object = BATTER_RESPONSE,
): Promise<void> {
  const careerArcBody = deriveCareerArcBody(seasonStatsBody);
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);
    if (op === 'GetPlayerCareerArc' || op === 'CareerArcQuery') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(careerArcBody),
      });
    } else if (op === 'GetAllPlayerSeasonStats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(seasonStatsBody),
      });
    } else {
      await route.fallback();
    }
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Player Detail – Eligible Positions Badges @regression', () => {
  test('shows eligible positions section for a batter', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectEligiblePositions();
  });

  test('renders the "Eligible" section label', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText('Eligible');
  });

  test('shows CF and OF badges for a batter with two eligible positions', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectText('CF', { exact: true });
    await playersPage.detail.expectText('OF', { exact: true });
  });

  test('shows SP and RP badges for a pitcher', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, PITCHER_RESPONSE);
    await playersPage.gotoDetail(2, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectEligiblePositions();
    await playersPage.detail.expectText('SP', { exact: true });
    await playersPage.detail.expectText('RP', { exact: true });
  });

  test('shows SP and DH badges for a two-way player', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, TWO_WAY_RESPONSE);
    await playersPage.gotoDetail(3, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectEligiblePositions();
    await playersPage.detail.expectText('SP', { exact: true });
    await playersPage.detail.expectText('DH', { exact: true });
  });

  test('renders exactly the right number of position badges', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // BATTER_RESPONSE has ['CF', 'OF'] — exactly 2 badges
    await playersPage.detail.expectPlayerPositionCount(2);
  });

  test('shows "No fantasy eligibility yet" placeholder when player has no eligible positions', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, NO_POSITIONS_RESPONSE);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // The positions band is always visible when data is present; empty
    // eligiblePositions renders the unranked placeholder instead of badges.
    await playersPage.detail.expectEligiblePositions();
    await playersPage.detail.expectEligiblePositionsUnranked();
    await playersPage.detail.expectPlayerPositionCount(0);
  });

  test('eligible positions row is hidden when the stats query errors', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, { errors: [{ message: 'Internal server error' }] });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectErrorState();
    await playersPage.detail.expectEligiblePositionsNotVisible();
  });

  test('OF badge has the outfield position color', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // OF maps to POS_OUTFIELD (#2D6A4F = rgb(45, 106, 79))
    await expect(playersPage.detail.getPlayerPositionBadge('OF')).toHaveCSS(
      'background-color',
      'rgb(45, 106, 79)',
    );
  });

  test('CF badge uses the utility fallback color (not in position map)', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // CF is not in POSITION_COLORS['baseball'], falls back to POS_UTILITY
    // (#C5A55A = rgb(197, 165, 90))
    await expect(playersPage.detail.getPlayerPositionBadge('CF')).toHaveCSS(
      'background-color',
      'rgb(197, 165, 90)',
    );
  });

  test('OF and CF badges have distinct background colors', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page);
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    // OF → POS_OUTFIELD, CF → POS_UTILITY; assert each color with retrying
    // toHaveCSS so the test doesn't race against paint.
    await expect(playersPage.detail.getPlayerPositionBadge('OF')).toHaveCSS(
      'background-color',
      'rgb(45, 106, 79)',
    );
    await expect(playersPage.detail.getPlayerPositionBadge('CF')).toHaveCSS(
      'background-color',
      'rgb(197, 165, 90)',
    );
  });

  test('eligible positions row is hidden when the stats query returns UNAUTHENTICATED', async ({
    page,
    playersPage,
  }) => {
    await setupMocks(page, {
      errors: [
        { message: 'UNAUTHENTICATED', extensions: { code: 'UNAUTHENTICATED' } },
      ],
    });
    await playersPage.gotoDetail(1, 'networkidle');

    await playersPage.detail.expectOpen();
    await playersPage.detail.expectNotLoading();

    await playersPage.detail.expectErrorState();
    await playersPage.detail.expectEligiblePositionsNotVisible();
  });
});
