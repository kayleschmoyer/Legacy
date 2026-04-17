/**
 * Players Directory E2E Tests (LS-601)
 *
 * Covers the /players route: browsing the player grid, searching by name,
 * and sorting. All GraphQL responses are mocked so no live backend is required.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

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
// LS-3545 / LS-3547: /players is a protected route. Unauthenticated users
// visiting /players are intercepted by EnhancedAuthGuard and shown
// PublicLandingPage with the "Continue with Google" sign-in CTA and a
// "Get Started Free" CTA lower down. These tests lock in that the buttons
// are located via getByRole (accessible name) — NOT via the broken
// `(button:visible, [role="button"]:visible)` CSS selector that caused the
// original crawler-reported failures (including the spurious
// "[GSI_LOGGER]: FedCM get() rejects with NetworkError" attribution).
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Players Directory — unauthenticated visitor @regression',
  () => {
    unauthTest(
      '"Continue with Google" button is visible on /players when unauthenticated',
      async ({ page }) => {
        await page.goto('/players');
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      '"Continue with Google" button on /players is clickable via getByRole',
      async ({ page }) => {
        await page.goto('/players');
        await page.waitForLoadState('load');

        const googleBtn = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(googleBtn).toBeVisible({ timeout: 15_000 });
        await expect(googleBtn).toBeEnabled();
        // Confirm the click resolves without a CSS selector parse error —
        // regression coverage for the original crawler failure.
        await googleBtn.click();
      },
    );

    unauthTest(
      '"Get Started Free" CTA is visible and interactive on /players for unauthenticated users',
      async ({ page }) => {
        await page.goto('/players');
        await page.waitForLoadState('load');

        // The auth guard shows the PublicLandingPage on /players for
        // unauthenticated users.  The CTA (aria-label="Get started free") must
        // be present and enabled so visitors can initiate sign-up from /players.
        // No .first() — the landing page exposes a single "Get started free"
        // CTA, so Playwright strictness will catch accidental duplicates.
        const getStartedBtn = page.getByRole('button', {
          name: /get started free/i,
        });
        await expect(getStartedBtn).toBeVisible({ timeout: 15_000 });
        await expect(getStartedBtn).toBeEnabled();
      },
    );
  },
);
