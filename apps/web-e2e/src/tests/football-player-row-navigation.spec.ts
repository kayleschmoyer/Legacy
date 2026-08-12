/**
 * Player Row Navigation to Detail — hermetic E2E tests (LS-5604, updated LS-9077)
 *
 * Verifies that clicking a player row on the canonical /players?sport=nfl
 * surface opens the player's detail inline (LS-8442 — FootballPlayerDetailModal
 * driven by ?playerId=), and that its "Full page" affordance still lands on
 * the standalone /football/players/:id route retained by LS-9077.
 *
 * Covered behaviours:
 *  - Table-view row click → ?playerId= is set, detail modal opens in place
 *  - Modal heading shows the clicked player's name
 *  - "Full page" button navigates to /football/players/:id
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_URL = '/players?sport=nfl';

// ── Mock fixtures ─────────────────────────────────────────────────────────────

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
  news: null,
  careerStats: null,
} as const;

// ── Response builders ──────────────────────────────────────────────────────────

function playersListResponse(): object {
  return {
    data: {
      footballPlayers: {
        nodes: [MAHOMES],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

function playerDetailResponse(): object {
  return {
    data: {
      footballPlayer: {
        ...MAHOMES,
        seasonStats: null,
        careerStats: null,
      },
    },
  };
}

// ── Route setup ───────────────────────────────────────────────────────────────

async function mockFootballRoutes(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    footballplayers: (route) => fulfillJson(route, playersListResponse()),
    footballplayer: (route) => fulfillJson(route, playerDetailResponse()),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Player row navigation to detail @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballRoutes(page);
  });

  test('clicking a player row in table view opens the detail modal in place', async ({
    page,
  }) => {
    await page.goto(PAGE_URL);

    // Table view is the default on desktop (viewport width > 800 px).
    // Clicking the player name cell triggers the row's onPress handler,
    // which sets ?playerId= and opens FootballPlayerDetailModal in place
    // (LS-8442) rather than navigating away.
    await page.getByText('Patrick Mahomes').click();

    await expect(page).toHaveURL(/[?&]playerId=1(&|$)/);
    // The modal renders FootballPlayerHeader with the player name as a heading.
    await expect(
      page.getByRole('heading', { name: 'Patrick Mahomes', exact: true }),
    ).toBeVisible();
  });

  test('the modal\'s "Full page" affordance navigates to the standalone detail route', async ({
    page,
  }) => {
    await page.goto(PAGE_URL);
    await page.getByText('Patrick Mahomes').click();
    await expect(page.getByLabel('Open full page')).toBeVisible();

    await page.getByLabel('Open full page').click();

    await expect(page).toHaveURL('/football/players/1');
    await expect(
      page.getByRole('heading', { name: 'Patrick Mahomes', exact: true }),
    ).toBeVisible();
  });
});
