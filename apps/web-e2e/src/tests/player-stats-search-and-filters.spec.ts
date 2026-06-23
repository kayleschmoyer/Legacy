/**
 * Player Stats Page — Search and Basic Filters E2E Tests (LS-5596)
 *
 * Verifies the search and filter controls on /players/stats with all
 * GraphQL queries mocked hermetically (route.fulfill only; no route.continue).
 *
 * The toolbar uses a draft-then-apply model: filter state is staged locally
 * and committed to the GraphQL query only when "Apply filters" is clicked.
 * These tests verify the full pipeline: UI interaction → Apply → GraphQL
 * variables contain the right filter values → grid reflects results.
 *
 * Acceptance criteria covered:
 *   AC1 — Search by player name sends searchTerm variable; matching player
 *          appears, non-matching player is absent from the grid.
 *   AC2 — Position dropdown sends position variable; the grid reflects
 *          server-filtered results.
 *   AC3 — Team dropdown sends team variable; the grid reflects
 *          server-filtered results.
 *   AC4 — View mode tabs (Hitters / Pitchers / Combined) act as a
 *          player-type filter: batting-only vs pitching-only vs both.
 */

import type { Route } from '@playwright/test';

import { expect, test } from '../fixtures/pages';
import {
  createGraphQLRouter,
  fulfillJson,
  type GraphQLRequest,
} from '../mocks/graphql/router';

// ── Shared mock shapes ────────────────────────────────────────────────────────

const MOCK_PAGE_INFO = {
  __typename: 'PageInfo',
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

const BONDS_EDGE = {
  __typename: 'CareerBattingEdge',
  node: {
    __typename: 'CareerBatting',
    playerId: 101,
    primaryPosition: 'LF',
    positionsPlayed: 'LF,RF',
    games: 2986,
    plateAppearances: 12606,
    atBats: 9847,
    runs: 2227,
    hits: 2935,
    doubles: 601,
    triples: 77,
    homeRuns: 762,
    rbi: 1996,
    stolenBases: 514,
    caughtStealing: 141,
    baseOnBalls: 2558,
    strikeouts: 1539,
    totalBases: 5976,
    groundedIntoDoublePlays: 144,
    hitByPitch: 95,
    sacrificeHits: 24,
    intentionalBaseOnBalls: 688,
    battingAverage: 0.298,
    onBasePercentage: 0.444,
    sluggingPercentage: 0.607,
    offensiveWAR: 162.8,
    player: {
      __typename: 'Player',
      id: 101,
      firstName: 'Barry',
      lastName: 'Bonds',
      brefId: 'bondsba01',
    },
  },
};

const ROSE_EDGE = {
  __typename: 'CareerBattingEdge',
  node: {
    __typename: 'CareerBatting',
    playerId: 102,
    primaryPosition: 'RF',
    positionsPlayed: 'RF',
    games: 3562,
    plateAppearances: 13791,
    atBats: 11551,
    runs: 2174,
    hits: 3630,
    doubles: 792,
    triples: 59,
    homeRuns: 1,
    rbi: 1903,
    stolenBases: 301,
    caughtStealing: 131,
    baseOnBalls: 1865,
    strikeouts: 1383,
    totalBases: 5101,
    groundedIntoDoublePlays: 357,
    hitByPitch: 154,
    sacrificeHits: 34,
    intentionalBaseOnBalls: 298,
    battingAverage: 0.314,
    onBasePercentage: 0.401,
    sluggingPercentage: 0.441,
    offensiveWAR: 128.1,
    player: {
      __typename: 'Player',
      id: 102,
      firstName: 'Pete',
      lastName: 'Rose',
      brefId: 'rosepe01',
    },
  },
};

const CLEMENS_PITCHING = {
  __typename: 'CareerPitching',
  playerId: 201,
  wins: 354,
  losses: 184,
  games: 709,
  gamesStarted: 707,
  gamesFinished: 1,
  completeGames: 100,
  shutouts: 46,
  saves: 0,
  hits: 4672,
  runs: 1940,
  earnedRuns: 1770,
  homeRuns: 363,
  baseOnBalls: 1580,
  intentionalBaseOnBalls: 79,
  strikeouts: 4672,
  hitByPitch: 158,
  balks: 8,
  wildPitches: 153,
  battersFaced: 20016,
  outsRecorded: 13095,
  outRate: null,
  era: '3.19',
  winPercentage: 0.658,
  player: {
    __typename: 'Player',
    id: 201,
    firstName: 'Roger',
    lastName: 'Clemens',
  },
};

// ── Mock response builders ───────────────────────────────────────────────────

function battingResponse(
  edges: (typeof BONDS_EDGE)[] | (typeof BONDS_EDGE | typeof ROSE_EDGE)[],
) {
  return {
    data: {
      careerBattingStats: {
        __typename: 'CareerBattingConnection',
        totalCount: edges.length,
        edges,
        pageInfo: MOCK_PAGE_INFO,
      },
    },
  };
}

function pitchingResponse(stats: (typeof CLEMENS_PITCHING)[]) {
  return { data: { careerPitchingStats: stats } };
}

function pitchingCountResponse(count: number) {
  return { data: { careerPitchingStatsCount: count } };
}

// ── Shared mock setup ────────────────────────────────────────────────────────

/**
 * Registers a variable-aware GraphQL router for the stats page.
 *
 * The batting handler inspects `searchTerm`, `position`, and `team` variables
 * so each Apply action results in a response that matches what a real server
 * would return for those filters — validating the full UI → variables → results
 * pipeline.
 */
async function mockStatsPage(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    getcareerbattingstats: (route: Route, { variables }: GraphQLRequest) => {
      const searchTerm =
        typeof variables.searchTerm === 'string'
          ? variables.searchTerm.toLowerCase()
          : '';
      const position =
        typeof variables.position === 'string' ? variables.position : '';
      const team = typeof variables.team === 'string' ? variables.team : '';

      // Server-side search filter: match first or last name
      let edges: (typeof BONDS_EDGE | typeof ROSE_EDGE)[] = [
        BONDS_EDGE,
        ROSE_EDGE,
      ];
      if (searchTerm) {
        edges = edges.filter((e) => {
          const first = e.node.player.firstName.toLowerCase();
          const last = e.node.player.lastName.toLowerCase();
          return first.includes(searchTerm) || last.includes(searchTerm);
        });
      }

      // Server-side position filter: OF covers LF/RF outfielders in our fixture
      if (position && position !== 'All Positions') {
        if (position === 'OF') {
          // Both Bonds (LF) and Rose (RF) are outfielders
          // edges remain unchanged — real server maps OF to LF/CF/RF
        } else {
          // Any non-OF position returns no batters in our two-player fixture
          edges = [];
        }
      }

      // Server-side team filter: no team info in fixture → non-default returns empty
      if (team && team !== 'All Teams') {
        edges = [];
      }

      return fulfillJson(route, battingResponse(edges));
    },

    getcareerpitchingstatscount: (route: Route) =>
      fulfillJson(route, pitchingCountResponse(1)),

    getcareerpitchingstats: (route: Route) =>
      fulfillJson(route, pitchingResponse([CLEMENS_PITCHING])),
  });
}

// ── Locator helpers ──────────────────────────────────────────────────────────

/** The native <select> for the Position dropdown in the filter toolbar. */
function positionSelect(page: import('@playwright/test').Page) {
  return page
    .getByTestId('filter-controls')
    .locator('select.ps-select-native')
    .first();
}

/** The native <select> for the Team dropdown in the filter toolbar. */
function teamSelect(page: import('@playwright/test').Page) {
  return page
    .getByTestId('filter-controls')
    .locator('select.ps-select-native')
    .nth(1);
}

/** The "Apply filters" commit button. */
function applyButton(page: import('@playwright/test').Page) {
  return page.getByTestId('apply-filters-button');
}

// ── AC1: Search by player name ───────────────────────────────────────────────

test.describe('Player Stats — search filter (AC1) @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockStatsPage(page);
    await playersPage.gotoStats();
    // Wait for initial data to load before interacting with filters
    await playersPage.stats.expectPlayerVisible('Barry Bonds');
  });

  test('both players visible before any search', async ({ playersPage }) => {
    await playersPage.stats.expectPlayerVisible('Barry Bonds');
    await playersPage.stats.expectPlayerVisible('Pete Rose');
  });

  test('typing a first name and applying shows only matching player', async ({
    page,
    playersPage,
  }) => {
    await playersPage.stats.search('Barry');
    await applyButton(page).click();

    await playersPage.stats.expectPlayerVisible('Barry Bonds');
    await expect(page.getByText('Pete Rose')).not.toBeVisible();
  });

  test('typing a last name and applying shows only matching player', async ({
    page,
    playersPage,
  }) => {
    await playersPage.stats.search('Rose');
    await applyButton(page).click();

    await playersPage.stats.expectPlayerVisible('Pete Rose');
    await expect(page.getByText('Barry Bonds')).not.toBeVisible();
  });

  test('non-matching search returns no results after apply', async ({
    page,
    playersPage,
  }) => {
    await playersPage.stats.search('Zzz');
    await applyButton(page).click();

    await playersPage.stats.expectMessage('No players found');
  });

  test('search input is visible in the filter toolbar', async ({
    playersPage,
  }) => {
    await playersPage.stats.expectSearchVisible();
  });
});

// ── AC2: Position dropdown filter ────────────────────────────────────────────

test.describe('Player Stats — position filter (AC2) @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockStatsPage(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectPlayerVisible('Barry Bonds');
  });

  test('position select is visible in the filter toolbar', async ({ page }) => {
    await expect(positionSelect(page)).toBeVisible();
  });

  test('position defaults to "All Positions"', async ({ page }) => {
    await expect(positionSelect(page)).toHaveValue('All Positions');
  });

  test('selecting "OF" and applying shows outfielders', async ({
    page,
    playersPage,
  }) => {
    await positionSelect(page).selectOption('OF');
    await applyButton(page).click();

    // Both Bonds (LF) and Rose (RF) are outfielders — both should appear
    await playersPage.stats.expectPlayerVisible('Barry Bonds');
    await playersPage.stats.expectPlayerVisible('Pete Rose');
  });

  test('selecting a non-outfield position and applying returns no batters', async ({
    page,
    playersPage,
  }) => {
    await positionSelect(page).selectOption('C');
    await applyButton(page).click();

    await playersPage.stats.expectMessage('No players found');
  });

  test('selecting "SP" and applying returns no batters', async ({
    page,
    playersPage,
  }) => {
    await positionSelect(page).selectOption('SP');
    await applyButton(page).click();

    await playersPage.stats.expectMessage('No players found');
  });
});

// ── AC3: Team dropdown filter ────────────────────────────────────────────────

test.describe('Player Stats — team filter (AC3) @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockStatsPage(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectPlayerVisible('Barry Bonds');
  });

  test('team select is visible in the filter toolbar', async ({ page }) => {
    await expect(teamSelect(page)).toBeVisible();
  });

  test('team defaults to "All Teams"', async ({ page }) => {
    await expect(teamSelect(page)).toHaveValue('All Teams');
  });

  test('selecting a team and applying filters to that team', async ({
    page,
    playersPage,
  }) => {
    // Our fixture has no team metadata, so any non-default team returns empty —
    // this verifies the team variable is passed and the server filters on it.
    await teamSelect(page).selectOption('NYY');
    await applyButton(page).click();

    await playersPage.stats.expectMessage('No players found');
  });

  test('selecting a second team returns different (empty) results', async ({
    page,
    playersPage,
  }) => {
    await teamSelect(page).selectOption('LAD');
    await applyButton(page).click();

    await playersPage.stats.expectMessage('No players found');
  });
});

// ── AC4: View mode tabs as player-type filter ────────────────────────────────

test.describe('Player Stats — view mode tabs (AC4) @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockStatsPage(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectLoaded();
  });

  test('Hitters tab shows batting leaders heading', async ({ playersPage }) => {
    await playersPage.stats.switchView('Hitters');
    await playersPage.stats.expectBattingLeaders();
  });

  test('Pitchers tab shows pitching leaders heading', async ({
    playersPage,
  }) => {
    await playersPage.stats.switchView('Pitchers');
    await playersPage.stats.expectPitchingLeaders();
  });

  test('Hitters tab shows batters from mocked data', async ({
    playersPage,
  }) => {
    await playersPage.stats.switchView('Hitters');
    await playersPage.stats.expectPlayerVisible('Barry Bonds');
  });

  test('Pitchers tab shows pitchers from mocked data', async ({
    playersPage,
  }) => {
    await playersPage.stats.switchView('Pitchers');
    await playersPage.stats.expectPlayerVisible('Roger Clemens');
  });

  test('Combined view tab is selected by default', async ({ playersPage }) => {
    await playersPage.stats.expectTabSelected('Combined');
  });

  test('switching to Hitters selects the Hitters tab', async ({
    playersPage,
  }) => {
    await playersPage.stats.switchView('Hitters');
    await playersPage.stats.expectTabSelected('Hitters');
  });

  test('switching to Pitchers selects the Pitchers tab', async ({
    playersPage,
  }) => {
    await playersPage.stats.switchView('Pitchers');
    await playersPage.stats.expectTabSelected('Pitchers');
  });
});

// ── Filter controls toolbar ───────────────────────────────────────────────────

test.describe('Player Stats — filter controls toolbar @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockStatsPage(page);
    await playersPage.gotoStats();
    await playersPage.stats.expectLoaded();
  });

  test('filter controls toolbar is visible', async ({ playersPage }) => {
    await playersPage.stats.expectFilterControls();
  });

  test('"Apply filters" button is present', async ({ page }) => {
    await expect(applyButton(page)).toBeVisible();
  });

  test('"Apply filters" button is disabled when no changes are pending', async ({
    page,
  }) => {
    await expect(applyButton(page)).toBeDisabled();
  });

  test('"Apply filters" button becomes enabled after typing a search term', async ({
    page,
    playersPage,
  }) => {
    await playersPage.stats.search('Barry');
    await expect(applyButton(page)).toBeEnabled();
  });

  test('"Apply filters" button becomes enabled after changing position', async ({
    page,
  }) => {
    await positionSelect(page).selectOption('OF');
    await expect(applyButton(page)).toBeEnabled();
  });

  test('"Apply filters" button becomes enabled after changing team', async ({
    page,
  }) => {
    await teamSelect(page).selectOption('NYY');
    await expect(applyButton(page)).toBeEnabled();
  });
});
