/**
 * Sport-Aware Player List — E2E tests (LS-5606)
 *
 * Verifies that the player list reflects the active league's sport context:
 *   Football context (/football/players): shows football positions (QB, RB, WR …)
 *     and NFL team options — not baseball positions or MLB teams.
 *   Baseball context (/players): shows baseball positions (P, C, IF, OF, DH)
 *     in the filter rail — not football positions, and no NFL team filter.
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { extractOperationName } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Constants ────────────────────────────────────────────────────────────────

const FOOTBALL_URL = '/football/players';
const BASEBALL_URL = '/players';

// ── Football mock ─────────────────────────────────────────────────────────────

const EMPTY_FOOTBALL_RESPONSE = {
  data: {
    footballPlayers: {
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

async function mockFootballPlayers(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route).toLowerCase();
      if (op === 'footballplayers') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_FOOTBALL_RESPONSE),
        });
      } else {
        await route.fallback();
      }
    },
  );
}

// ── Baseball mock ─────────────────────────────────────────────────────────────

async function mockBaseballPlayers(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route).toLowerCase();
      if (op === 'getallplayers' || op === 'getplayerswithstats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { players: [] } }),
        });
      } else {
        await route.fallback();
      }
    },
  );
}

// ── Football context ──────────────────────────────────────────────────────────

test.describe('Sport-aware player list — football context @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
    await page.goto(FOOTBALL_URL);
  });

  test('shows Football Players heading in football context', async ({
    page,
  }) => {
    await expect(page.getByText('Football Players').first()).toBeVisible();
  });

  test('position filter shows core football positions (QB, RB, WR, TE)', async ({
    page,
  }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    await expect(group.getByRole('button', { name: 'QB' })).toBeVisible();
    await expect(group.getByRole('button', { name: 'RB' })).toBeVisible();
    await expect(group.getByRole('button', { name: 'WR' })).toBeVisible();
    await expect(group.getByRole('button', { name: 'TE' })).toBeVisible();
  });

  test('position filter shows kicker and defensive positions (K, DST, DL, LB, DB)', async ({
    page,
  }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    await expect(group.getByRole('button', { name: 'K' })).toBeVisible();
    await expect(group.getByRole('button', { name: 'DST' })).toBeVisible();
    await expect(group.getByRole('button', { name: 'DL' })).toBeVisible();
    await expect(group.getByRole('button', { name: 'LB' })).toBeVisible();
    await expect(group.getByRole('button', { name: 'DB' })).toBeVisible();
  });

  test('team filter contains NFL team options', async ({ page }) => {
    // Tamagui Select renders a hidden native <select name="team-filter"> (BubbleSelect)
    const teamSelect = page.locator('select[name="team-filter"]');
    await expect(teamSelect.locator('option[value="KC"]')).toBeAttached();
    await expect(teamSelect.locator('option[value="BUF"]')).toBeAttached();
    await expect(teamSelect.locator('option[value="DAL"]')).toBeAttached();
  });

  test('team filter does not contain MLB team abbreviations', async ({
    page,
  }) => {
    const teamSelect = page.locator('select[name="team-filter"]');
    await expect(teamSelect.locator('option[value="NYY"]')).not.toBeAttached();
    await expect(teamSelect.locator('option[value="LAD"]')).not.toBeAttached();
  });
});

// ── Baseball context ──────────────────────────────────────────────────────────

test.describe('Sport-aware player list — baseball context @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockBaseballPlayers(page);
    await page.goto(BASEBALL_URL);
    await page.waitForLoadState('load');
  });

  test('shows All Players heading in baseball context', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /all players/i }),
    ).toBeVisible();
  });

  test('position filter shows baseball positions (P, C, IF, OF, DH)', async ({
    page,
  }) => {
    const filterRail = page.getByRole('group', {
      name: 'Filter players by era, position, or status',
    });
    await expect(
      filterRail.getByRole('button', { name: 'P', exact: true }),
    ).toBeVisible();
    await expect(
      filterRail.getByRole('button', { name: 'C', exact: true }),
    ).toBeVisible();
    await expect(
      filterRail.getByRole('button', { name: 'IF', exact: true }),
    ).toBeVisible();
    await expect(
      filterRail.getByRole('button', { name: 'OF', exact: true }),
    ).toBeVisible();
    await expect(
      filterRail.getByRole('button', { name: 'DH', exact: true }),
    ).toBeVisible();
  });

  test('position filter does not show football positions in baseball context', async ({
    page,
  }) => {
    const filterRail = page.getByRole('group', {
      name: 'Filter players by era, position, or status',
    });
    await expect(
      filterRail.getByRole('button', { name: 'QB', exact: true }),
    ).not.toBeVisible();
    await expect(
      filterRail.getByRole('button', { name: 'WR', exact: true }),
    ).not.toBeVisible();
    await expect(
      filterRail.getByRole('button', { name: 'DST', exact: true }),
    ).not.toBeVisible();
  });

  test('baseball page has no NFL team filter dropdown', async ({ page }) => {
    // The football-specific Tamagui Select (name="team-filter") is absent on /players
    await expect(page.locator('select[name="team-filter"]')).toHaveCount(0);
  });
});
