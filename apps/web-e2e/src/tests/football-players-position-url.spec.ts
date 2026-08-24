/**
 * Football Players — URL position persistence E2E tests (LS-6465)
 *
 * Verifies that the `?position=` URL search param drives the position filter:
 *   1. Deep-linking to /players?sport=nfl&position=QB pre-selects QB.
 *   2. Selecting a position, navigating to a player detail page, and pressing
 *      browser back restores the previously selected position.
 *   3. Selecting All clears the param; invalid params fall back to All.
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

// Position pills are multi-select toggle buttons (role=button + aria-pressed)
// since LS-6464; single-value `?position=` deep links still select exactly one.
// Element access goes through `playersPage.football` (LS-8096 / ADR-0015 —
// this spec is selector-free; locators live in the page object).
import { expect, test } from '../fixtures/pages';
import { extractOperationName } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Mock helpers ─────────────────────────────────────────────────────────────

const EMPTY_PLAYERS_RESPONSE = {
  data: {
    footballPlayers: {
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

async function mockFootballGraphQL(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route).toLowerCase();
      if (op === 'footballplayers') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PLAYERS_RESPONSE),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: {} }),
        });
      }
    },
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('FootballPlayers — URL position persistence @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballGraphQL(page);
  });

  test('deep-link ?position=QB pre-selects the QB pill', async ({
    playersPage,
  }) => {
    await playersPage.football.goto('&position=QB');

    await playersPage.football.expectPositionPressed('QB', true);
    await playersPage.football.expectPositionPressed('All', false);
  });

  test('deep-link ?position=FLEX pre-selects the FLEX pill', async ({
    playersPage,
  }) => {
    await playersPage.football.goto('&position=FLEX');

    await playersPage.football.expectPositionPressed('FLEX', true);
  });

  test('invalid ?position= param falls back to All being selected', async ({
    playersPage,
  }) => {
    await playersPage.football.goto('&position=INVALID');

    await playersPage.football.expectPositionPressed('All', true);
  });

  test('selecting a position writes ?position= to the URL', async ({
    page,
    playersPage,
  }) => {
    await playersPage.football.goto();

    await playersPage.football.clickPosition('RB');

    await expect(page).toHaveURL(/[?&]position=RB/);
    await playersPage.football.expectPositionPressed('RB', true);
  });

  test('selecting All clears the ?position= param from the URL', async ({
    page,
    playersPage,
  }) => {
    await playersPage.football.goto('&position=QB');

    await playersPage.football.clickPosition('All');

    await expect(page).not.toHaveURL(/[?&]position=/);
    await playersPage.football.expectPositionPressed('All', true);
  });

  test('position is restored after navigating to player detail and pressing back', async ({
    page,
    playersPage,
  }) => {
    await playersPage.football.goto();

    // Select QB — writes ?position=QB in-place (replace: true)
    await playersPage.football.clickPosition('QB');
    await expect(page).toHaveURL(/[?&]position=QB/);

    // Navigate forward to a player detail page (simulates clicking a player card)
    await page.goto('/football/players/1');

    // Browser back returns to /players?sport=nfl&position=QB
    await page.goBack();

    await playersPage.football.expectPositionPressed('QB', true, {
      timeout: 5000,
    });
    await expect(page).toHaveURL(/[?&]position=QB/);
  });
});
