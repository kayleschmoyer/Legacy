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
 * the visible label — there is no separate Tamagui trigger element. It is
 * driven through the `playersPage.football` semantic surface (LS-8096 /
 * ADR-0015 — this spec is selector-free; locators live in the page object).
 *
 * All GraphQL responses are mocked via route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/pages';
import { extractOperationName } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

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

// ── Tests: Free Agents filter (LS-6493) ─────────────────────────────────────

test.describe('FootballTeamFilter — Free Agents filter (LS-6493) @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockFootballPlayers(page);
    await playersPage.football.goto();
  });

  test('"Free Agents" option exists in the team filter', async ({
    playersPage,
  }) => {
    await playersPage.football.expectTeamOptionAttached('FREE_AGENT');
  });

  test('selecting "Free Agents" sends freeAgent:true with no nflTeam in the GraphQL query', async ({
    page,
    playersPage,
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

    await playersPage.football.selectTeam('FREE_AGENT');

    const req = await requestPromise;
    const body = JSON.parse(req.postData() ?? '{}') as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.freeAgent).toBe(true);
    expect(body.variables?.nflTeam).toBeUndefined();
  });

  test('selecting "Free Agents" updates the filter control label to "Free Agents"', async ({
    playersPage,
  }) => {
    // The canonical /players surface renders a real native <select> whose
    // selected option is the visible label (no separate trigger element).
    await playersPage.football.selectTeam('FREE_AGENT');
    await playersPage.football.expectSelectedTeamText('Free Agents');
  });
});

// ── Tests: Sort order (LS-6494; canonical alphabetical order per LS-9371) ────

test.describe('FootballTeamFilter — sort order @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockFootballPlayers(page);
    await playersPage.football.goto();
    // The option-values read does not retry — wait for options to be mounted
    await playersPage.football.expectTeamOptionCount(36);
  });

  test('sentinel options appear first: All Teams, Free Agents, AFC, NFC', async ({
    playersPage,
  }) => {
    await playersPage.football.expectTeamOptionValueAt(0, 'All');
    await playersPage.football.expectTeamOptionValueAt(1, 'FREE_AGENT');
    await playersPage.football.expectTeamOptionValueAt(2, 'AFC');
    await playersPage.football.expectTeamOptionValueAt(3, 'NFC');
  });

  test('all 32 teams plus 4 sentinel options are present in the dropdown', async ({
    playersPage,
  }) => {
    // 4 sentinels (All Teams, Free Agents, AFC, NFC) + 32 NFL teams
    await playersPage.football.expectTeamOptionCount(36);
  });

  test('first team option after the sentinels is ARI (alphabetical by abbreviation)', async ({
    playersPage,
  }) => {
    // The canonical surface lists teams alphabetically by abbreviation
    // (footballStatsHelpers.ts) — ARI sorts first.
    await playersPage.football.expectTeamOptionValueAt(4, 'ARI');
  });

  test('all 32 team options are sorted alphabetically by abbreviation', async ({
    playersPage,
  }) => {
    const values = await playersPage.football.teamOptionValues();

    // Skip the 4 sentinels (All, FREE_AGENT, AFC, NFC).
    const teamValues = values.slice(4);
    expect(teamValues).toHaveLength(32);
    expect(teamValues).toEqual(
      [...teamValues].sort((a, b) => a.localeCompare(b)),
    );
  });
});
