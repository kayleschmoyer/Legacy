/**
 * Football team filter — E2E tests (LS-6493, LS-6494; reconciled with the
 * canonical /players surface in LS-9371)
 *
 * Covers two features:
 *
 *   1. Free Agents filter (LS-6493): selecting "Free Agents" from the team
 *      dropdown sends freeAgent:true to the GraphQL query and omits nflTeam.
 *
 *   2. Team dropdown sort order: sentinel options appear first (All Teams,
 *      Free Agents, AFC, NFC), followed by every team sorted alphabetically
 *      by abbreviation (FOOTBALL_TEAM_OPTIONS in footballStatsHelpers.ts —
 *      the canonical surface replaced the old page's conference → division →
 *      city grouping with a flat alphabetical list).
 *
 * Interaction strategy: the canonical surface renders a real native <select>
 * with name="team-filter" (footballStatsConfig.tsx) whose selected option is
 * the visible label — there is no separate Tamagui trigger element. Tests
 * target it via select[name="team-filter"] and Playwright's selectOption()
 * with force:true.
 *
 * All GraphQL responses are mocked via route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

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
      totalCount: 0,
    },
  },
};

async function mockFootballPlayers(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route).toLowerCase();
      // The desktop grid fires FootballPlayerStatsGrid; the narrow-viewport
      // card feed fires FootballPlayers (LS-9366). Serve both.
      if (op === 'footballplayers' || op === 'footballplayerstatsgrid') {
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

// Locator for the canonical surface's real native <select> (rendered by
// footballStatsConfig.tsx with name="team-filter").
function nativeSelect(page: import('@playwright/test').Page) {
  return page.locator('select[name="team-filter"]');
}

// ── Tests: Free Agents filter (LS-6493) ─────────────────────────────────────

test.describe('FootballTeamFilter — Free Agents filter (LS-6493) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
    await page.goto(PAGE_URL);
  });

  test('"Free Agents" option exists in the team filter', async ({ page }) => {
    await expect(
      nativeSelect(page).locator('option[value="FREE_AGENT"]'),
    ).toBeAttached();
  });

  test('selecting "Free Agents" sends freeAgent:true with no nflTeam in the GraphQL query', async ({
    page,
  }) => {
    const requestPromise = page.waitForRequest(
      (req) =>
        isGraphQLEndpoint(new URL(req.url())) &&
        (() => {
          try {
            const body = JSON.parse(req.postData() ?? '{}') as {
              operationName?: string;
              variables?: Record<string, unknown>;
            };
            return (
              // The desktop grid fires FootballPlayerStatsGrid; the
              // narrow-viewport card feed fires FootballPlayers (LS-9366).
              // Match either.
              ['footballplayers', 'footballplayerstatsgrid'].includes(
                body.operationName?.toLowerCase() ?? '',
              ) && body.variables?.freeAgent === true
            );
          } catch {
            return false;
          }
        })(),
    );

    await nativeSelect(page).selectOption('FREE_AGENT', { force: true });

    const req = await requestPromise;
    const body = JSON.parse(req.postData() ?? '{}') as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.freeAgent).toBe(true);
    expect(body.variables?.nflTeam).toBeUndefined();
  });

  test('selecting "Free Agents" updates the filter control label to "Free Agents"', async ({
    page,
  }) => {
    // The canonical /players surface renders a real native <select> whose
    // selected option is the visible label (no separate trigger element).
    await nativeSelect(page).selectOption('FREE_AGENT', { force: true });
    await expect(nativeSelect(page).locator('option:checked')).toContainText(
      'Free Agents',
    );
  });
});

// ── Tests: Sort order (LS-6494; canonical alphabetical order per LS-9371) ────

test.describe('FootballTeamFilter — sort order @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
    await page.goto(PAGE_URL);
    // allInnerTexts() does not retry — wait for options to be mounted first
    await expect(nativeSelect(page).locator('option')).toHaveCount(36);
  });

  test('sentinel options appear first: All Teams, Free Agents, AFC, NFC', async ({
    page,
  }) => {
    const opts = nativeSelect(page).locator('option');
    await expect(opts.nth(0)).toHaveAttribute('value', 'All');
    await expect(opts.nth(1)).toHaveAttribute('value', 'FREE_AGENT');
    await expect(opts.nth(2)).toHaveAttribute('value', 'AFC');
    await expect(opts.nth(3)).toHaveAttribute('value', 'NFC');
  });

  test('all 32 teams plus 4 sentinel options are present in the dropdown', async ({
    page,
  }) => {
    // 4 sentinels (All Teams, Free Agents, AFC, NFC) + 32 NFL teams
    await expect(nativeSelect(page).locator('option')).toHaveCount(36);
  });

  test('first team option after the sentinels is ARI (alphabetical by abbreviation)', async ({
    page,
  }) => {
    // The canonical surface lists teams alphabetically by abbreviation
    // (footballStatsHelpers.ts) — ARI sorts first.
    await expect(nativeSelect(page).locator('option').nth(4)).toHaveAttribute(
      'value',
      'ARI',
    );
  });

  test('all 32 team options are sorted alphabetically by abbreviation', async ({
    page,
  }) => {
    const values = await nativeSelect(page)
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));

    // Skip the 4 sentinels (All, FREE_AGENT, AFC, NFC).
    const teamValues = values.slice(4);
    expect(teamValues).toHaveLength(32);
    expect(teamValues).toEqual(
      [...teamValues].sort((a, b) => a.localeCompare(b)),
    );
  });
});
