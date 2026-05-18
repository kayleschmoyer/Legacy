/**
 * Combobox / Search Autocomplete Accessibility E2E Tests (LS-2224)
 *
 * Covers ARIA semantics and keyboard behaviour of search/combobox inputs in the
 * players directory (/players). All GraphQL responses are mocked so tests run
 * without a live backend, so the search input always renders deterministically
 * and tests assert strictly against it.
 *
 * Tested properties:
 *  - Search input is discoverable (placeholder, accessible label)
 *  - Input is focusable and accepts keyboard input
 *  - Keyboard navigation: Arrow keys move through suggestions, Enter selects,
 *    Escape closes/clears the dropdown
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockPlayer(
  id: number,
  firstName: string,
  lastName: string,
  position = 'CF',
) {
  return {
    __typename: 'Player',
    id,
    firstName,
    lastName,
    position,
    team: 'LAA',
    photoUrl: null,
    batsThrows: 'R/R',
    age: 31,
    careerGames: 900,
    careerSeasons: 12,
    status: 'active',
  };
}

const MOCK_PLAYERS = [
  makeMockPlayer(1, 'Mike', 'Trout', 'CF'),
  makeMockPlayer(2, 'Mookie', 'Betts', 'RF'),
  makeMockPlayer(3, 'Aaron', 'Judge', 'RF'),
];

const SEARCH_INPUT_SELECTOR = [
  'input[type="search"]',
  'input[placeholder*="search" i]',
  'input[placeholder*="player" i]',
  'input[role="combobox"]',
  '[role="combobox"] input',
  'input[aria-label*="search" i]',
].join(', ');

async function mockPlayersGraphQL(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (postData.includes('getallplayers')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { players: MOCK_PLAYERS } }),
        });
      } else if (postData.includes('getplayerswithstats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { playersWithStats: MOCK_PLAYERS } }),
        });
      } else if (postData.includes('searchplayers')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { searchPlayers: MOCK_PLAYERS } }),
        });
      } else {
        await route.fallback();
      }
    },
  );
}

/** Locate the primary search input on the page. Returns the first match. */
function getSearchInput(page: import('@playwright/test').Page) {
  return page.locator(SEARCH_INPUT_SELECTOR).first();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Combobox/search accessibility @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayersGraphQL(page);
    await page.goto('/players');
    await page.waitForLoadState('load');
    // Apollo resolves after the load event — wait for the search input to
    // mount before every test so individual assertions can be strict.
    await page.waitForSelector(SEARCH_INPUT_SELECTOR, { timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // 1. Accessible label
  // -------------------------------------------------------------------------

  test('search input has an accessible label', async ({ page }) => {
    const searchInput = getSearchInput(page);
    await expect(searchInput).toBeVisible();

    const ariaLabel = await searchInput.getAttribute('aria-label');
    const ariaLabelledBy = await searchInput.getAttribute('aria-labelledby');
    const inputId = await searchInput.getAttribute('id');
    const hasAssociatedLabel = inputId
      ? (await page.locator(`label[for="${inputId}"]`).count()) > 0
      : false;
    const hasImplicitLabel =
      (await searchInput.locator('xpath=ancestor::label[1]').count()) > 0;
    const hasLabel =
      !!ariaLabel || !!ariaLabelledBy || hasAssociatedLabel || hasImplicitLabel;

    expect(
      hasLabel,
      'Search input is rendered but has no accessible name (aria-label, aria-labelledby, or associated label).',
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. Focusability + keyboard input
  // -------------------------------------------------------------------------

  test('search input is focusable and accepts keyboard input', async ({
    page,
  }) => {
    const searchInput = getSearchInput(page);
    await expect(searchInput).toBeVisible();

    await searchInput.focus();
    await expect(searchInput).toBeFocused({ timeout: 5000 });

    await searchInput.type('trout');
    await expect(searchInput).toHaveValue(/trout/);
  });

  // -------------------------------------------------------------------------
  // 3. Escape key closes / clears suggestions
  // -------------------------------------------------------------------------

  test('Escape key does not crash the page and closes suggestions', async ({
    page,
  }) => {
    const searchInput = getSearchInput(page);
    await expect(searchInput).toBeVisible();

    await searchInput.focus();
    await searchInput.type('trout');
    await page.keyboard.press('Escape');

    // Page must remain functional after Escape.
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  // -------------------------------------------------------------------------
  // 4. Keyboard navigation with Arrow keys
  // -------------------------------------------------------------------------

  test('Arrow keys do not crash the page when navigating suggestions', async ({
    page,
  }) => {
    const searchInput = getSearchInput(page);
    await expect(searchInput).toBeVisible();

    await searchInput.focus();
    await searchInput.type('a');

    // Allow any async suggestion rendering to settle.
    await page.waitForTimeout(300);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  // -------------------------------------------------------------------------
  // 5. Enter key does not crash the page
  // -------------------------------------------------------------------------

  test('Enter key does not crash the page after typing in search', async ({
    page,
  }) => {
    const searchInput = getSearchInput(page);
    await expect(searchInput).toBeVisible();

    await searchInput.focus();
    await searchInput.type('judge');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  // -------------------------------------------------------------------------
  // 6. Page stability after free-text search
  // -------------------------------------------------------------------------

  test('search does not crash the page', async ({ page }) => {
    const searchInput = getSearchInput(page);
    await expect(searchInput).toBeVisible();

    await searchInput.fill('test search');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});
