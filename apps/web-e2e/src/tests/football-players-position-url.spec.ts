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
import { expect, test } from '../fixtures/auth-enhanced';
import { extractOperationName } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_URL = '/players?sport=nfl';

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

  test('deep-link ?position=QB pre-selects the QB pill', async ({ page }) => {
    await page.goto(`${PAGE_URL}&position=QB`);

    const qbPill = page.getByRole('button', { name: 'QB' });
    const allPill = page.getByRole('button', { name: 'All' });
    await expect(qbPill).toHaveAttribute('aria-pressed', 'true');
    await expect(allPill).toHaveAttribute('aria-pressed', 'false');
  });

  test('deep-link ?position=FLEX pre-selects the FLEX pill', async ({
    page,
  }) => {
    await page.goto(`${PAGE_URL}&position=FLEX`);

    const flexPill = page.getByRole('button', { name: 'FLEX' });
    await expect(flexPill).toHaveAttribute('aria-pressed', 'true');
  });

  test('invalid ?position= param falls back to All being selected', async ({
    page,
  }) => {
    await page.goto(`${PAGE_URL}&position=INVALID`);

    const allPill = page.getByRole('button', { name: 'All' });
    await expect(allPill).toHaveAttribute('aria-pressed', 'true');
  });

  test('selecting a position writes ?position= to the URL', async ({
    page,
  }) => {
    await page.goto(PAGE_URL);

    await page.getByRole('button', { name: 'RB' }).click();

    await expect(page).toHaveURL(/[?&]position=RB/);
    await expect(page.getByRole('button', { name: 'RB' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('selecting All clears the ?position= param from the URL', async ({
    page,
  }) => {
    await page.goto(`${PAGE_URL}&position=QB`);

    await page.getByRole('button', { name: 'All' }).click();

    await expect(page).not.toHaveURL(/[?&]position=/);
    await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('position is restored after navigating to player detail and pressing back', async ({
    page,
  }) => {
    await page.goto(PAGE_URL);

    // Select QB — writes ?position=QB in-place (replace: true)
    await page.getByRole('button', { name: 'QB' }).click();
    await expect(page).toHaveURL(/[?&]position=QB/);

    // Navigate forward to a player detail page (simulates clicking a player card)
    await page.goto('/football/players/1');

    // Browser back returns to /players?sport=nfl&position=QB
    await page.goBack();

    await expect(page.getByRole('button', { name: 'QB' })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 5000 },
    );
    await expect(page).toHaveURL(/[?&]position=QB/);
  });
});
