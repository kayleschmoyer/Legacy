/**
 * Sport-Aware Player List — E2E tests (LS-5606)
 *
 * Verifies that the football player list reflects the active league's sport
 * context: /players?sport=nfl shows football positions (QB, RB, WR …) and NFL
 * team options — not baseball positions or MLB teams.
 *
 * The former baseball-context coverage (/players showing baseball positions
 * in a filter rail) tested the retired `PlayersScreen` shell, which no
 * longer renders at /players (LS-9076 — /players is now the canonical merged
 * player stats page, formerly at /players/stats). Removed rather than
 * adapted; there is no equivalent position-filter-rail UI on the stats page.
 *
 * Originally exercised the standalone /football/players route; retargeted to
 * the canonical route when that page was retired (LS-9077). The visible
 * header text changed from "Football Players" to "NFL Player Statistics"
 * (the shared FootballStatsPage title) — the position-filter group and team
 * select assertions are unchanged since they hit the same shared component.
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { extractOperationName } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Constants ────────────────────────────────────────────────────────────────

const FOOTBALL_URL = '/players?sport=nfl';

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

// ── Football context ──────────────────────────────────────────────────────────

test.describe('Sport-aware player list — football context @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
    await page.goto(FOOTBALL_URL);
  });

  test('shows NFL Player Statistics heading in football context', async ({
    page,
  }) => {
    await expect(page.getByText('NFL Player Statistics')).toBeVisible();
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

  test('position filter shows kicker and IDP positions (K, DL, LB, DB) but not DST', async ({
    page,
  }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    await expect(group.getByRole('button', { name: 'K' })).toBeVisible();
    // DST is hidden while no team-defense players exist (LS-10727).
    await expect(group.getByRole('button', { name: 'DST' })).toHaveCount(0);
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
