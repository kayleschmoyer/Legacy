/**
 * Football Home — Player Discovery Entry (LS-5411)
 *
 * Covers the "Browse Players" journey from Football Home (epic LS-5267):
 *  - The trending-players preview renders mocked top players on /football.
 *  - The Browse Players CTA is visible and navigates to /players?sport=nfl
 *    (repointed from the retired /football/players route — LS-9077).
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { enableFootball } from '../fixtures/shared-mocks';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Constants ────────────────────────────────────────────────────────────────

const FOOTBALL_HOME_URL = '/football';

// ── Mock player fixtures ─────────────────────────────────────────────────────

const MAHOMES = {
  __typename: 'FootballPlayer',
  id: 1,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  pfrId: 'MahoPa00',
  headshotUrl: null,
  previousTeams: [],
  careerStats: { fantasyPoints: 410 },
} as const;

const ALLEN = {
  __typename: 'FootballPlayer',
  id: 2,
  firstName: 'Josh',
  lastName: 'Allen',
  position: 'QB',
  isDst: false,
  nflTeam: 'BUF',
  pfrId: 'AlleJo02',
  headshotUrl: null,
  previousTeams: [],
  careerStats: { fantasyPoints: 395 },
} as const;

const TRENDING_PLAYERS = [MAHOMES, ALLEN] as const;

function trendingPlayersResponse(nodes: readonly object[] = TRENDING_PLAYERS) {
  return {
    data: {
      footballPlayers: {
        nodes: [...nodes],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

/** Registers the FootballPlayers mock backing the Football Home trending preview. */
async function mockTrendingFootballPlayers(
  page: import('@playwright/test').Page,
  nodes: readonly object[] = TRENDING_PLAYERS,
): Promise<void> {
  await createGraphQLRouter(page, {
    footballplayers: (route) =>
      fulfillJson(route, trendingPlayersResponse(nodes)),
  });
}

test.describe('Football Home — player discovery entry point @regression', () => {
  test.beforeEach(async ({ page }) => {
    // The football sport tab/hub is gated behind football_enabled (LS-4767),
    // which defaults off in CI. Seed it before the bundle loads.
    await enableFootball(page);
  });

  test('renders a preview row for each trending player on Football Home', async ({
    page,
  }) => {
    await mockTrendingFootballPlayers(page);
    await page.goto(FOOTBALL_HOME_URL);

    await expect(page.getByTestId('trending-players-preview')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('trending-player-row-1')).toBeVisible();
    await expect(page.getByTestId('trending-player-row-2')).toBeVisible();
    await expect(page.getByText('Mahomes')).toBeVisible();
    await expect(page.getByText('Allen')).toBeVisible();
  });

  test('omits the trending players section when there are no players to show', async ({
    page,
  }) => {
    await mockTrendingFootballPlayers(page, []);
    await page.goto(FOOTBALL_HOME_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByTestId('trending-players-preview'),
    ).not.toBeVisible();
  });

  test('clicking Browse Players navigates to the canonical players route with NFL selected', async ({
    page,
  }) => {
    await mockTrendingFootballPlayers(page);
    await page.goto(FOOTBALL_HOME_URL);

    const cta = page.getByTestId('browse-players-button');
    await expect(cta).toBeVisible({ timeout: 10000 });
    await cta.click();

    // Repointed from the retired /football/players route to the canonical
    // merged players route with NFL pre-selected (LS-9077).
    await expect(page).toHaveURL(/\/players\?sport=nfl$/);
  });
});
