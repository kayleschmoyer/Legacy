/**
 * Player Row Navigation to Detail — hermetic E2E tests (LS-5604)
 *
 * Verifies that clicking a player row on /football/players navigates to the
 * player's detail page and the detail header shows the same player's name.
 *
 * Covered behaviours:
 *  - Table-view row click → URL changes to /football/players/:id
 *  - Detail page heading shows the clicked player's name
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_URL = '/football/players';

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
  injuryStatus: null,
  injuryDesignation: null,
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
        injuriesLastSyncedAt: null,
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

  test('clicking a player row in table view navigates to the player detail page', async ({
    page,
  }) => {
    await page.goto(PAGE_URL);

    // Table view is the default on desktop (viewport width > 800 px).
    // Clicking the player name cell triggers the row's onPress handler and
    // calls navigate(`/football/players/${id}`).
    await page.getByText('Patrick Mahomes').click();

    await expect(page).toHaveURL('/football/players/1');
    // The FootballPlayerHeader renders the player name as a heading element.
    await expect(
      page.getByRole('heading', { name: 'Patrick Mahomes', exact: true }),
    ).toBeVisible();
  });
});
