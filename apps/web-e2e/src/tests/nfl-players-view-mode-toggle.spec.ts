/**
 * NFL Players — responsive card/table default E2E tests (LS-8016, trimmed LS-9077)
 *
 * The manual view-mode toggle + localStorage persistence this file used to
 * cover (LS-8016) only existed on the standalone FootballPlayersPage, which
 * was retired in favor of the canonical /players?sport=nfl route (LS-9077).
 * The canonical route (PlayerStatsPage) has no manual toggle — it renders
 * cards vs. table purely from viewport width (isNarrowViewport), with no
 * user override and no persisted preference. This file now verifies only
 * that responsive default:
 *   1. Desktop viewport (wide) → table view
 *   2. Mobile viewport (narrow) → cards view
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_URL = '/players?sport=nfl';

// Desktop = wider than Tamagui's sm breakpoint (maxWidth 800).
const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
// Mobile = within the sm breakpoint (maxWidth 800).
const MOBILE_VIEWPORT = { width: 375, height: 667 };

// ── Shared mock data ──────────────────────────────────────────────────────────

const MAHOMES = {
  __typename: 'FootballPlayer',
  id: 1,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  pfrId: 'MahoPa00',
  headshotUrl: null,
  previousTeams: [],
  careerStats: null,
} as const;

const ALLEN = {
  __typename: 'FootballPlayer',
  id: 2,
  firstName: 'Josh',
  lastName: 'Allen',
  position: 'QB',
  isDst: false,
  nflTeam: 'BUF',
  pfrId: 'AlleJo02',
  headshotUrl: null,
  previousTeams: [],
  careerStats: null,
} as const;

function playersResponse() {
  return {
    data: {
      footballPlayers: {
        nodes: [MAHOMES, ALLEN],
        pageInfo: { hasNextPage: false, endCursor: null },
        totalCount: 2,
      },
    },
  };
}

async function mockFootballPlayers(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    // Narrow viewports mount PlayersCardFeed, which fires FootballPlayers;
    // desktop mounts FootballStatsDataGrid, which fires FootballPlayerStatsGrid
    // (LS-9366). Both read the same footballPlayers connection shape, so one
    // response body serves both operations.
    footballplayers: (route) => fulfillJson(route, playersResponse()),
    footballplayerstatsgrid: (route) => fulfillJson(route, playersResponse()),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Locator for the card feed container (only present in cards view). */
function cardsContainer(page: import('@playwright/test').Page) {
  return page.getByTestId('players-stats-card-feed-nfl');
}

/** Locator for the table container (only present in table view). */
function tableContainer(page: import('@playwright/test').Page) {
  return page.getByTestId('player-list-table');
}

// ── Responsive defaults ───────────────────────────────────────────────────────

test.describe('NFL players — responsive card/table default @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
  });

  test('desktop viewport (>800px) renders table view', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(PAGE_URL);

    await expect(tableContainer(page)).toBeVisible();
    await expect(cardsContainer(page)).not.toBeVisible();
  });

  test('mobile viewport (≤800px) renders cards view', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(PAGE_URL);

    await expect(cardsContainer(page)).toBeVisible();
    await expect(tableContainer(page)).not.toBeVisible();
  });
});
