/**
 * Auction Draft Mechanics E2E Tests (LS-1607)
 *
 * Covers the auction draft room UI rendered at /baseball/league/:id/draft
 * when the league's selectionMethod is 'auction':
 *   1. Auction draft board renders with budget display
 *   2. Player nomination shows bid interface
 *   3. Budget tracking updates after winning bid
 *   4. Outbid notification displays correctly
 *
 * All GraphQL queries are mocked — no live backend required.
 */

import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const DRAFT_ID = 42;
const DRAFT_URL = `/baseball/league/${LEAGUE_ID}/draft`;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = {
  __typename: 'League' as const,
  id: LEAGUE_ID,
  name: 'Auction League',
  description: 'E2E auction draft test league',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'in-progress' as const,
  currentMatchup: null,
  numberOfTeams: 4,
  playerPool: 'all',
  draftMode: 'live' as const,
  selectionMethod: 'auction',
  draftOrder: 'snake',
  isPublic: false,
  maxBatters: 14,
  maxPitchers: 9,
  tradingEnabled: true,
  waiverEnabled: true,
  startDate: null,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
  userMembership: {
    __typename: 'LeagueMember' as const,
    leagueId: LEAGUE_ID,
    userId: 1,
    teamId: 1,
    permissionLevel: 'owner',
    username: 'testuser',
  },
};

const MOCK_TEAMS = [
  {
    __typename: 'Team' as const,
    id: 1,
    name: 'Bid Warriors',
    owner: 1,
    leagueId: LEAGUE_ID,
    managerId: 1,
  },
  {
    __typename: 'Team' as const,
    id: 2,
    name: 'Dollar Drafters',
    owner: 2,
    leagueId: LEAGUE_ID,
    managerId: 2,
  },
  {
    __typename: 'Team' as const,
    id: 3,
    name: 'Budget Beasts',
    owner: 3,
    leagueId: LEAGUE_ID,
    managerId: 3,
  },
  {
    __typename: 'Team' as const,
    id: 4,
    name: 'Penny Pinchers',
    owner: 4,
    leagueId: LEAGUE_ID,
    managerId: 4,
  },
];

const MOCK_LEAGUE_DRAFT = {
  __typename: 'Draft' as const,
  id: DRAFT_ID,
  leagueId: LEAGUE_ID,
  draftMode: 'live',
  selectionMethod: 'auction',
  draftOrder: 'snake',
  currentPick: 1,
  pickTimeLimitSeconds: 30,
  currentPickDeadline: null,
  draftStartedAt: new Date().toISOString(),
};

/** Auction state: waiting for nomination (no player nominated yet) */
const MOCK_AUCTION_STATE_NOMINATING = {
  __typename: 'AuctionState' as const,
  draftId: DRAFT_ID,
  nominatorTeam: { __typename: 'Team' as const, id: 1, name: 'Bid Warriors' },
  nominatedPlayer: null,
  currentBid: null,
  currentBidder: null,
  nominationDeadline: new Date(Date.now() + 60_000).toISOString(),
  bidDeadline: null,
  nominationOrder: 1,
};

/** Auction state: a player is on the block with an active bid */
const MOCK_AUCTION_STATE_BIDDING = {
  __typename: 'AuctionState' as const,
  draftId: DRAFT_ID,
  nominatorTeam: {
    __typename: 'Team' as const,
    id: 2,
    name: 'Dollar Drafters',
  },
  nominatedPlayer: {
    __typename: 'Player' as const,
    id: 100,
    firstName: 'Mike',
    lastName: 'Trout',
  },
  currentBid: 15,
  currentBidder: {
    __typename: 'Team' as const,
    id: 2,
    name: 'Dollar Drafters',
  },
  nominationDeadline: null,
  bidDeadline: new Date(Date.now() + 30_000).toISOString(),
  nominationOrder: 2,
};

/** Auction state: user is outbid */
const MOCK_AUCTION_STATE_OUTBID = {
  __typename: 'AuctionState' as const,
  draftId: DRAFT_ID,
  nominatorTeam: {
    __typename: 'Team' as const,
    id: 2,
    name: 'Dollar Drafters',
  },
  nominatedPlayer: {
    __typename: 'Player' as const,
    id: 100,
    firstName: 'Mike',
    lastName: 'Trout',
  },
  currentBid: 25,
  currentBidder: { __typename: 'Team' as const, id: 3, name: 'Budget Beasts' },
  nominationDeadline: null,
  bidDeadline: new Date(Date.now() + 15_000).toISOString(),
  nominationOrder: 2,
};

const MOCK_BUDGETS = [
  {
    __typename: 'AuctionBudget' as const,
    team: { __typename: 'Team' as const, id: 1, name: 'Bid Warriors' },
    remainingBudget: 200,
    playersWon: 0,
    maxBid: 176,
  },
  {
    __typename: 'AuctionBudget' as const,
    team: { __typename: 'Team' as const, id: 2, name: 'Dollar Drafters' },
    remainingBudget: 185,
    playersWon: 1,
    maxBid: 162,
  },
  {
    __typename: 'AuctionBudget' as const,
    team: { __typename: 'Team' as const, id: 3, name: 'Budget Beasts' },
    remainingBudget: 170,
    playersWon: 2,
    maxBid: 148,
  },
  {
    __typename: 'AuctionBudget' as const,
    team: { __typename: 'Team' as const, id: 4, name: 'Penny Pinchers' },
    remainingBudget: 195,
    playersWon: 0,
    maxBid: 171,
  },
];

/** Budgets after team 1 wins a bid for $20 */
const MOCK_BUDGETS_AFTER_WIN = [
  {
    __typename: 'AuctionBudget' as const,
    team: { __typename: 'Team' as const, id: 1, name: 'Bid Warriors' },
    remainingBudget: 180,
    playersWon: 1,
    maxBid: 157,
  },
  {
    __typename: 'AuctionBudget' as const,
    team: { __typename: 'Team' as const, id: 2, name: 'Dollar Drafters' },
    remainingBudget: 185,
    playersWon: 1,
    maxBid: 162,
  },
  {
    __typename: 'AuctionBudget' as const,
    team: { __typename: 'Team' as const, id: 3, name: 'Budget Beasts' },
    remainingBudget: 170,
    playersWon: 2,
    maxBid: 148,
  },
  {
    __typename: 'AuctionBudget' as const,
    team: { __typename: 'Team' as const, id: 4, name: 'Penny Pinchers' },
    remainingBudget: 195,
    playersWon: 0,
    maxBid: 171,
  },
];

// ---------------------------------------------------------------------------
// GraphQL URL predicate
// ---------------------------------------------------------------------------

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

/**
 * Install auction-draft GraphQL mocks.
 *
 * @param auctionState  – the auction state to return (nominating vs bidding)
 * @param budgets       – budget rows for all teams
 */
async function mockAuctionDraftGraphQL(
  page: Page,
  auctionState: object,
  budgets: object[] = MOCK_BUDGETS,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData() ?? '';
    let body: { operationName?: string } | undefined;
    try {
      body = JSON.parse(postData) as { operationName?: string };
    } catch {
      // not JSON
    }
    const opName = (body?.operationName ?? '').toLowerCase();

    // League detail query (exact match to avoid catching GetLeagueTeams etc.)
    if (opName === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
      return;
    }

    if (opName.includes('getleagueteams')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
      return;
    }

    if (opName.includes('getuserteamid')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
      return;
    }

    // Draft query — returns auction selection method to trigger AuctionDraftRoom
    if (
      opName.includes('getlivedraftleaguedraft') ||
      opName.includes('getleaguedraft')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueDraft: MOCK_LEAGUE_DRAFT } }),
      });
      return;
    }

    // Auction-specific queries
    if (opName.includes('getauctionstate')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { auctionState } }),
      });
      return;
    }

    if (opName.includes('getauctionbudgets')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { auctionBudgets: budgets } }),
      });
      return;
    }

    // Mutations
    if (opName.includes('nominateplayer')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { nominatePlayer: MOCK_AUCTION_STATE_BIDDING },
        }),
      });
      return;
    }

    if (opName.includes('placebid')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { placeBid: MOCK_AUCTION_STATE_BIDDING },
        }),
      });
      return;
    }

    // User leagues (app shell)
    if (opName.includes('getuserleagues')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
      return;
    }

    // Draft player stats (fired by draft room)
    if (opName.includes('getdraftplayerstats')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { draftPlayerStats: [] } }),
      });
      return;
    }

    if (opName.includes('getdraftpitchingstats')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { draftPitchingStats: [] } }),
      });
      return;
    }

    // Fall back to baseline / isolation layer for anything else
    await unmockedGraphQLFallback(route);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Auction Draft Board — budget display @regression', () => {
  test('renders the auction draft room with budget tracker', async ({
    page,
  }) => {
    await mockAuctionDraftGraphQL(page, MOCK_AUCTION_STATE_NOMINATING);
    await page.goto(DRAFT_URL);
    await page.waitForLoadState('load');

    // The page should NOT show an application error
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // Auction Draft Room heading
    await expect(
      page.getByRole('region', { name: /auction draft room/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Budget Tracker section
    await expect(page.getByText('Budget Tracker')).toBeVisible();

    // All four team names in the budget table
    for (const team of MOCK_TEAMS) {
      await expect(page.getByText(team.name).first()).toBeVisible();
    }

    // Budget amounts visible (spot-check team 1's $200 budget)
    await expect(page.getByText('$200').first()).toBeVisible();
  });
});

test.describe('Auction Draft — nomination & bid interface @regression', () => {
  test('shows nomination panel when it is the current user turn', async ({
    page,
  }) => {
    // Team ID 1 is the nominator and the user's team
    await mockAuctionDraftGraphQL(page, MOCK_AUCTION_STATE_NOMINATING);
    await page.goto(DRAFT_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('region', { name: /auction draft room/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Nomination prompt (NominationPanel heading — exact match avoids the "!" variant)
    await expect(
      page.getByText('Your Turn to Nominate', { exact: true }),
    ).toBeVisible();

    // Player ID input and Nominate button
    await expect(
      page.getByRole('textbox', { name: /player id to nominate/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /nominate/i })).toBeVisible();
  });

  test('shows bid interface when a player is on the block', async ({
    page,
  }) => {
    await mockAuctionDraftGraphQL(page, MOCK_AUCTION_STATE_BIDDING);
    await page.goto(DRAFT_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('region', { name: /auction draft room/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Player name on the block
    await expect(page.getByText('Mike Trout')).toBeVisible();

    // "On the Block" label
    await expect(page.getByText('On the Block')).toBeVisible();

    // Current bid amount
    await expect(page.getByText('Current Bid')).toBeVisible();
    await expect(page.getByText('$15').first()).toBeVisible();

    // Leading bidder
    await expect(page.getByText('Leading Bidder')).toBeVisible();

    // Bid input and submit button
    await expect(
      page.getByRole('textbox', { name: /bid amount/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /submit bid/i }),
    ).toBeVisible();
  });
});

test.describe('Auction Draft — budget tracking updates @regression', () => {
  test('budget table reflects updated amounts after a winning bid', async ({
    page,
  }) => {
    // Install base mocks first (lower priority in LIFO chain)
    await mockAuctionDraftGraphQL(page, MOCK_AUCTION_STATE_BIDDING);

    // Override budget responses at higher priority (registered AFTER base mocks)
    let pollCount = 0;
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData() ?? '';
      let body: { operationName?: string } | undefined;
      try {
        body = JSON.parse(postData) as { operationName?: string };
      } catch {
        // not JSON
      }
      const opName = (body?.operationName ?? '').toLowerCase();

      if (opName.includes('getauctionbudgets')) {
        pollCount++;
        const budgets = pollCount <= 1 ? MOCK_BUDGETS : MOCK_BUDGETS_AFTER_WIN;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { auctionBudgets: budgets } }),
        });
        return;
      }

      await route.fallback();
    });

    await page.goto(DRAFT_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('region', { name: /auction draft room/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Initial budget for Bid Warriors: $200
    await expect(page.getByText('$200').first()).toBeVisible();

    // Wait for the poll cycle to update budgets (component polls every 5s)
    // The updated budget for Bid Warriors should be $180
    await expect(page.getByText('$180').first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe('Auction Draft — outbid notification @regression', () => {
  test('displays outbid state when another team leads the bid', async ({
    page,
  }) => {
    // Current user is team 1, but team 3 (Budget Beasts) is the high bidder
    await mockAuctionDraftGraphQL(page, MOCK_AUCTION_STATE_OUTBID);
    await page.goto(DRAFT_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('region', { name: /auction draft room/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Player still on the block
    await expect(page.getByText('Mike Trout')).toBeVisible();

    // Higher bid amount
    await expect(page.getByText('$25').first()).toBeVisible();

    // Leading bidder is Budget Beasts (not the user)
    await expect(page.getByText('Budget Beasts').first()).toBeVisible();

    // The bid panel should be visible so the user can raise their bid
    await expect(
      page.getByRole('textbox', { name: /bid amount/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /submit bid/i }),
    ).toBeVisible();

    // The "you are the current high bidder" message should NOT appear
    // because the user (team 1) is NOT the leading bidder
    await expect(
      page.getByText('You are the current high bidder'),
    ).not.toBeVisible();
  });

  test('shows high-bidder confirmation when user is winning', async ({
    page,
  }) => {
    // Auction state where the current user (team 1) IS the high bidder
    const stateUserWinning = {
      ...MOCK_AUCTION_STATE_BIDDING,
      currentBid: 20,
      currentBidder: { id: 1, name: 'Bid Warriors' },
    };

    await mockAuctionDraftGraphQL(page, stateUserWinning);
    await page.goto(DRAFT_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('region', { name: /auction draft room/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Current bid amount
    await expect(page.getByText('$20').first()).toBeVisible();

    // Leading bidder text shows "You!" because the user's team is the bidder
    await expect(page.getByText('You!')).toBeVisible();

    // High bidder confirmation message
    await expect(
      page.getByText('You are the current high bidder'),
    ).toBeVisible();

    // Bid panel should NOT be visible when user is already winning
    await expect(
      page.getByRole('textbox', { name: /bid amount/i }),
    ).not.toBeVisible();
  });
});
