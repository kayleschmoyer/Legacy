/**
 * Players Directory E2E Tests (LS-601)
 *
 * Covers the /players route: browsing the player grid, searching by name,
 * and sorting. All GraphQL responses are mocked so no live backend is required.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeMockPlayer(
  id: number,
  firstName: string,
  lastName: string,
  position = 'SP',
) {
  return {
    __typename: 'Player',
    id,
    firstName,
    lastName,
    position,
    team: 'NYY',
    photoUrl: null,
    batsThrows: 'R/R',
    age: 28,
    careerGames: 120,
    careerSeasons: 4,
    status: 'active',
  };
}

const MOCK_PLAYERS = [
  makeMockPlayer(1, 'Aaron', 'Judge', 'RF'),
  makeMockPlayer(2, 'Shohei', 'Ohtani', 'DH'),
  makeMockPlayer(3, 'Mookie', 'Betts', 'RF'),
  makeMockPlayer(4, 'Freddie', 'Freeman', '1B'),
  makeMockPlayer(5, 'Ronald', 'Acuna', 'RF'),
];

async function mockPlayersGraphQL(
  page: import('@playwright/test').Page,
  players = MOCK_PLAYERS,
) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (
        postData.includes('getallplayers') ||
        postData.includes('getplayerswithstats')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { players } }),
        });
      } else {
        await route.fallback();
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Tests – static elements
// ---------------------------------------------------------------------------

test.describe('Players Directory – static elements @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayersGraphQL(page);
    await page.goto('/players');
    await page.waitForLoadState('load');
  });

  test('loads the players directory without errors', async ({ page }) => {
    await expect(page).toHaveURL('/players');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('shows the All Players heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /all players/i }),
    ).toBeVisible();
  });

  test('sets a page-specific browser title (LS-4842)', async ({ page }) => {
    await expect(page).toHaveTitle('All Players | Legacy Sports');
  });

  test('shows a search input', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();
  });

  test('shows a sort/order control', async ({ page }) => {
    // PlayersGrid renders a Select element for sort order
    const sortControl = page.getByText(/name/i).first();
    await expect(sortControl).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests – player data rendering
// ---------------------------------------------------------------------------

test.describe('Players Directory – player cards @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayersGraphQL(page);
    await page.goto('/players');
    await page.waitForLoadState('load');
  });

  test('renders player cards from mocked data', async ({ page }) => {
    await expect(
      page.getByText('Aaron Judge', { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Shohei Ohtani', { exact: false }).first(),
    ).toBeVisible();
  });

  test('displays multiple players', async ({ page }) => {
    await expect(
      page.getByText('Mookie Betts', { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Freddie Freeman', { exact: false }).first(),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests – search interaction
// ---------------------------------------------------------------------------

test.describe('Players Directory – search @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayersGraphQL(page);
    await page.goto('/players');
    await page.waitForLoadState('load');
  });

  test('search input accepts text', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Judge');
    await expect(searchInput).toHaveValue('Judge');
  });

  test('clearing search input resets the value', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill('Ohtani');
    await searchInput.clear();
    await expect(searchInput).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// Tests – empty state
// ---------------------------------------------------------------------------

test.describe('Players Directory – empty state @regression', () => {
  test('shows empty state when no players returned', async ({ page }) => {
    await mockPlayersGraphQL(page, []);
    await page.goto('/players');
    await page.waitForLoadState('load');

    // Heading should still be present
    await expect(
      page.getByRole('heading', { name: /all players/i }),
    ).toBeVisible();
    // No player cards visible
    await expect(
      page.getByText('Aaron Judge', { exact: false }),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// LS-3493: /players is a public route. Unauthenticated users visiting
// /players should see the player directory (All Players heading, search
// input) — NOT the marketing landing page. These tests lock in the correct
// behavior after the route was moved to publicExactPaths in main.tsx.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Players Directory — unauthenticated visitor @regression',
  () => {
    unauthTest.beforeEach(async ({ page }) => {
      await mockPlayersGraphQL(page);
      await page.goto('/players');
      await page.waitForLoadState('load');
    });

    unauthTest(
      'unauthenticated user sees the player directory on /players, not the marketing page',
      async ({ page }) => {
        await expect(page).toHaveURL('/players');
        // Player directory heading must be present — not the marketing tagline.
        await expect(
          page.getByRole('heading', { name: /all players/i }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('body')).not.toContainText(
          'Build Your Dynasty',
        );
      },
    );

    unauthTest(
      'search input is visible for unauthenticated users on /players',
      async ({ page }) => {
        await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      'player cards are rendered for unauthenticated users on /players',
      async ({ page }) => {
        await expect(
          page.getByText('Aaron Judge', { exact: false }).first(),
        ).toBeVisible({ timeout: 15_000 });
      },
    );
  },
);

// ---------------------------------------------------------------------------
// LS-3492: [functional] 404 error on /players endpoint.
// An automated audit crawler navigated to /players and received a functional
// 404 — the network request returned 404 and the "Build Your Dynasty"
// marketing landing page was rendered in place of the players directory.
// /players is a protected route: unauthenticated visitors correctly see the
// PublicLandingPage, but authenticated users must reach the players directory.
// These tests lock in the corrected behaviour: an authenticated session must
// stay at /players (no 404 redirect), must never see the marketing landing
// page, and must see the players directory heading.
// ---------------------------------------------------------------------------

test.describe('Players Directory — functional 404 regression (LS-3492) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayersGraphQL(page);
    await page.goto('/players');
    await page.waitForLoadState('load');
  });

  test('URL stays at /players for authenticated users — no 404 redirect', async ({
    page,
  }) => {
    await expect(page).toHaveURL('/players', { timeout: 15_000 });
  });

  test('does not show marketing landing page for authenticated users on /players', async ({
    page,
  }) => {
    await expect(page.getByText(/build your dynasty/i)).not.toBeVisible();
    await expect(page.getByText(/dominate your league/i)).not.toBeVisible();
  });

  test('shows players directory content — not a 404 page — for authenticated users', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: /all players/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
