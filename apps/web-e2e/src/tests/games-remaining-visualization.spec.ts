/**
 * Games Remaining Visualization E2E Tests (LS-5351)
 *
 * QA coverage for the "Games Remaining Visualization" feature on the baseball
 * matchup detail page (/baseball/league/:leagueId/matchups/:matchupId):
 *   - "Games Progress" card with one dot per game
 *   - Status badge: "{n} left" while games remain, "Complete" when none do
 *   - Completed / total counts driving the progress bar
 *
 * The visualization is rendered by the shared component
 * lib/shared-components/src/features/matchup/GamesRemaining.tsx via
 * MatchupDetailLayout when `gamesPerMatchup > 0`. `gamesRemaining` is derived as
 * `gamesPerMatchup - selectedGamesCount`, so this suite varies those two fields
 * to exercise the partial, complete, and zero-progress states.
 *
 * All GraphQL responses are mocked (route.fulfill) so no live backend is
 * required — the suite is hermetic.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 10;
const MATCHUP_URL = `/baseball/league/${LEAGUE_ID}/matchups/${MATCHUP_ID}`;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

type MatchupOverrides = {
  gamesPerMatchup?: number;
  selectedGamesCount?: number;
  status?: string;
};

function buildMatchup(overrides: MatchupOverrides = {}) {
  return {
    __typename: 'Matchup',
    id: MATCHUP_ID,
    leagueId: LEAGUE_ID,
    weekNumber: 3,
    team1Id: 1,
    team2Id: 2,
    team1Score: 42.5,
    team2Score: 38.1,
    status: overrides.status ?? 'in_progress',
    statsLoadingStatus: 'complete',
    gamesPerMatchup: overrides.gamesPerMatchup ?? 7,
    pitcherStartsPerMatchup: 2,
    selectedGamesCount: overrides.selectedGamesCount ?? 4,
    startTime: null,
    endTime: null,
  };
}

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 1,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Force',
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 2,
  },
];

/**
 * Mock every GraphQL operation the matchup detail page issues. The matchup
 * fields that drive GamesRemaining (`gamesPerMatchup`, `selectedGamesCount`,
 * `status`) are overridable per test.
 */
async function mockMatchupGraphQL(
  page: import('@playwright/test').Page,
  overrides: MatchupOverrides = {},
) {
  const matchup = buildMatchup(overrides);

  await page.route(isGraphQLEndpoint, async (route) => {
    // Match on the exact GraphQL operation name (not a broad postData
    // substring) so a future operation whose name overlaps one of these
    // cannot be accidentally intercepted.
    const op = extractOperationName(route);

    if (op === 'GetMatchupById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: matchup } }),
      });
    } else if (op === 'GetMatchupsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsForLeague: [matchup] } }),
      });
    } else if (op === 'GetCurrentWeekForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: 3 } }),
      });
    } else if (op === 'GetUserTeamId') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (op === 'GetLeagueTeams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (op === 'GetMatchupRecap') {
      // Completed matchups render the premium-gated MatchupRecapPanel, which
      // fires GetMatchupRecap. Return a null recap so the panel renders
      // nothing (it is out of scope for this suite) without tripping the
      // hermetic API-isolation guard on an unmocked operation.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getMatchupById: {
              __typename: 'Matchup',
              id: MATCHUP_ID,
              weekNumber: 3,
              status: matchup.status,
              team1Id: 1,
              team2Id: 2,
              team1Score: matchup.team1Score,
              team2Score: matchup.team2Score,
              recap: null,
            },
          },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

/**
 * Locate the "Games Progress" card body. It is the element that contains both
 * the "Games Progress" heading and the "{total} total" footer — scoping to it
 * lets us assert the badge/counts and count the per-game dot icons without
 * matching content elsewhere on the page (scoreboard, navigation, etc.).
 *
 * `.last()` selects the innermost (most specific) matching element: the deepest
 * div that still contains both texts is the card's own content stack, whereas
 * `.first()` would return an outer page container that also wraps the scoreboard.
 */
function gamesProgressCard(
  page: import('@playwright/test').Page,
  totalGames: number,
) {
  return page
    .locator('div', { has: page.getByText('Games Progress', { exact: true }) })
    .filter({ has: page.getByText(`${totalGames} total`, { exact: true }) })
    .last();
}

// ---------------------------------------------------------------------------
// Partial progress (in-progress matchup: 4 of 7 games complete)
// ---------------------------------------------------------------------------

test.describe('Games Remaining – partial progress @regression', () => {
  test.beforeEach(async ({ page }) => {
    // 7 games total, 4 selected/complete => 3 remaining, in progress.
    await mockMatchupGraphQL(page, {
      gamesPerMatchup: 7,
      selectedGamesCount: 4,
      status: 'in_progress',
    });
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
  });

  test('renders the Games Progress card', async ({ page }) => {
    await expect(
      page.getByText('Games Progress', { exact: true }),
    ).toBeVisible();
  });

  test('shows the remaining-games status badge', async ({ page }) => {
    const card = gamesProgressCard(page, 7);
    await expect(card.getByText('3 left', { exact: true })).toBeVisible();
    await expect(card.getByText('Complete', { exact: true })).toHaveCount(0);
  });

  test('shows completed and total game counts', async ({ page }) => {
    const card = gamesProgressCard(page, 7);
    await expect(card.getByText('4 completed', { exact: true })).toBeVisible();
    await expect(card.getByText('7 total', { exact: true })).toBeVisible();
  });

  test('renders one dot per game', async ({ page }) => {
    const card = gamesProgressCard(page, 7);
    await expect(card).toBeVisible();
    // One lucide icon (checkmark / hourglass / circle) per game dot.
    await expect(card.locator('svg')).toHaveCount(7);
  });
});

// ---------------------------------------------------------------------------
// Complete (all games played)
// ---------------------------------------------------------------------------

test.describe('Games Remaining – complete @regression', () => {
  test.beforeEach(async ({ page }) => {
    // 7 games total, all 7 selected/complete => 0 remaining.
    await mockMatchupGraphQL(page, {
      gamesPerMatchup: 7,
      selectedGamesCount: 7,
      status: 'completed',
    });
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
  });

  test('shows the Complete status badge instead of a remaining count', async ({
    page,
  }) => {
    const card = gamesProgressCard(page, 7);
    await expect(card.getByText('Complete', { exact: true })).toBeVisible();
    // No "{n} left" remaining-count badge when the matchup is complete.
    await expect(card.getByText(/\d+ left/)).toHaveCount(0);
  });

  test('shows all games counted as completed', async ({ page }) => {
    const card = gamesProgressCard(page, 7);
    await expect(card.getByText('7 completed', { exact: true })).toBeVisible();
    await expect(card.getByText('7 total', { exact: true })).toBeVisible();
  });

  test('still renders one dot per game', async ({ page }) => {
    const card = gamesProgressCard(page, 7);
    await expect(card).toBeVisible();
    await expect(card.locator('svg')).toHaveCount(7);
  });
});

// ---------------------------------------------------------------------------
// Zero progress (scheduled matchup: no games played yet)
// ---------------------------------------------------------------------------

test.describe('Games Remaining – zero progress @regression', () => {
  test.beforeEach(async ({ page }) => {
    // 7 games total, none selected/complete => all remaining.
    await mockMatchupGraphQL(page, {
      gamesPerMatchup: 7,
      selectedGamesCount: 0,
      status: 'scheduled',
    });
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
  });

  test('shows all games remaining in the status badge', async ({ page }) => {
    const card = gamesProgressCard(page, 7);
    await expect(card.getByText('7 left', { exact: true })).toBeVisible();
    await expect(card.getByText('Complete', { exact: true })).toHaveCount(0);
  });

  test('shows zero completed of the total', async ({ page }) => {
    const card = gamesProgressCard(page, 7);
    await expect(card.getByText('0 completed', { exact: true })).toBeVisible();
    await expect(card.getByText('7 total', { exact: true })).toBeVisible();
  });

  test('renders one dot per game', async ({ page }) => {
    const card = gamesProgressCard(page, 7);
    await expect(card).toBeVisible();
    await expect(card.locator('svg')).toHaveCount(7);
  });
});
