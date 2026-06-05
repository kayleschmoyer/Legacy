/**
 * Trades Tab E2E Tests
 *
 * Covers the V2 TradesTab rendered on the Trades tab of the
 * League Detail page at /baseball/league/:id/trades.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: 'E2E trades tab test league',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: 5,
  numberOfTeams: 4,
  playerPool: 'all',
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  isPublic: false,
  maxBatters: 14,
  maxPitchers: 9,
  tradingEnabled: true,
  waiverEnabled: true,
  startDate: null,
  waiverType: 'standard',
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
    owner: 1,
    leagueId: 1,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Force',
    owner: 2,
    leagueId: 1,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
];

/** Pending incoming trade offer (proposingTeam=2, receivingTeam=1) */
const MOCK_INCOMING_PENDING = {
  __typename: 'TradeOffer',
  id: 10,
  leagueId: 1,
  proposingTeamId: 2,
  receivingTeamId: 1,
  status: 'pending',
  message: 'Deal?',
  expiresAt: null,
  respondedAt: null,
  vetoedAt: null,
  createdAt: '2024-09-01T12:00:00Z',
  updatedAt: '2024-09-01T12:00:00Z',
  proposingTeamName: 'Beta Force',
  receivingTeamName: 'Alpha Squad',
  players: [
    {
      __typename: 'TradeOfferPlayer',
      id: 1,
      tradeOfferId: 10,
      playerId: 501,
      fromTeamId: 2,
      playerName: 'Mike Trout',
      playerPosition: 'CF',
    },
    {
      __typename: 'TradeOfferPlayer',
      id: 2,
      tradeOfferId: 10,
      playerId: 502,
      fromTeamId: 1,
      playerName: 'Aaron Judge',
      playerPosition: 'RF',
    },
  ],
};

/** Pending outgoing trade offer (proposingTeam=1, receivingTeam=2) */
const MOCK_OUTGOING_PENDING = {
  __typename: 'TradeOffer',
  id: 11,
  leagueId: 1,
  proposingTeamId: 1,
  receivingTeamId: 2,
  status: 'pending',
  message: null,
  expiresAt: null,
  respondedAt: null,
  vetoedAt: null,
  createdAt: '2024-09-02T10:00:00Z',
  updatedAt: '2024-09-02T10:00:00Z',
  proposingTeamName: 'Alpha Squad',
  receivingTeamName: 'Beta Force',
  players: [
    {
      __typename: 'TradeOfferPlayer',
      id: 3,
      tradeOfferId: 11,
      playerId: 503,
      fromTeamId: 1,
      playerName: 'Mookie Betts',
      playerPosition: 'RF',
    },
    {
      __typename: 'TradeOfferPlayer',
      id: 4,
      tradeOfferId: 11,
      playerId: 504,
      fromTeamId: 2,
      playerName: 'Shohei Ohtani',
      playerPosition: 'DH',
    },
  ],
};

/** Accepted trade (completed history) */
const MOCK_ACCEPTED_TRADE = {
  __typename: 'TradeOffer',
  id: 12,
  leagueId: 1,
  proposingTeamId: 1,
  receivingTeamId: 2,
  status: 'accepted',
  message: null,
  expiresAt: null,
  respondedAt: '2024-08-15T09:00:00Z',
  vetoedAt: null,
  createdAt: '2024-08-14T08:00:00Z',
  updatedAt: '2024-08-15T09:00:00Z',
  proposingTeamName: 'Alpha Squad',
  receivingTeamName: 'Beta Force',
  players: [
    {
      __typename: 'TradeOfferPlayer',
      id: 5,
      tradeOfferId: 12,
      playerId: 505,
      fromTeamId: 1,
      playerName: 'Freddie Freeman',
      playerPosition: '1B',
    },
  ],
};

const MOCK_TRADE_BLOCK_PLAYER = {
  __typename: 'TeamMember',
  id: 1,
  teamId: 2,
  playerId: 101,
  onTradeBlock: true,
  askingPrice: null,
  player: { __typename: 'Player', firstName: 'Jake', lastName: 'Smith' },
};

const MOCK_OWN_TRADE_BLOCK_PLAYER = {
  __typename: 'TeamMember',
  id: 2,
  teamId: 1,
  playerId: 102,
  onTradeBlock: true,
  askingPrice: '2nd round pick',
  player: { __typename: 'Player', firstName: 'Mike', lastName: 'Johnson' },
};

interface MockOpts {
  leagueTradeOffers?: object[];
  leagueTradeBlock?: object[];
}

async function mockTradesGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOpts = {},
) {
  const leagueOffers = opts.leagueTradeOffers ?? [];
  const tradeBlock = opts.leagueTradeBlock ?? [];
  // Pending offers (status='pending') are fetched via GetTeamTradeOffers in
  // the shared TradingCenter; the league query is used for history only.
  const pendingOffers = leagueOffers.filter(
    (o: Record<string, unknown>) => o['status'] === 'pending',
  );

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('"getteamtradeoffers"')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamTradeOffers: pendingOffers } }),
      });
    } else if (postData.includes('getleaguetradeoffers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTradeOffers: leagueOffers } }),
      });
    } else if (postData.includes('getleagueteams')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (
      postData.includes('getleaguebyid') ||
      postData.includes('getleague')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (postData.includes('getpositionsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (postData.includes('getuserteamid')) {
      // V2 schema: userTeamId is a scalar Int? (not a wrapped object).
      // myTeamId = 1 makes Alpha Squad the viewing team, which is the
      // receiver of MOCK_INCOMING_PENDING and the proposer of
      // MOCK_OUTGOING_PENDING.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (
      postData.includes('getusers') ||
      postData.includes('getuserleagues')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (postData.includes('getleaguetradeblock')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTradeBlock: tradeBlock } }),
      });
    } else if (postData.includes('"settradeblock"')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            setTradeBlock: {
              __typename: 'TeamMember',
              id: 2,
              teamId: 1,
              playerId: 102,
              onTradeBlock: true,
              askingPrice: '1st round pick',
              player: {
                __typename: 'Player',
                firstName: 'Mike',
                lastName: 'Johnson',
              },
            },
          },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('Trades tab — navigation @smoke', () => {
  test('navigates to trades tab without errors', async ({ page }) => {
    await mockTradesGraphQL(page);
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(/\/trades/);
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

test.describe('Trades tab — sections @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page, {
      leagueTradeOffers: [MOCK_INCOMING_PENDING],
    });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('shows "Incoming Offers" section heading', async ({ page }) => {
    await expect(
      page.getByText('Incoming Offers', { exact: true }),
    ).toBeVisible();
  });

  test('shows "Trade History" section toggle', async ({ page }) => {
    await expect(
      page.getByText('Trade History', { exact: true }),
    ).toBeVisible();
  });
});

test.describe('Trades tab — empty state @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page, { leagueTradeOffers: [] });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('shows empty pending message when there are no pending offers', async ({
    page,
  }) => {
    await expect(page.getByText('No pending trade offers')).toBeVisible();
  });

  test('shows empty completed message when there are no accepted trades', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: 'No completed trades', exact: true }),
    ).toBeVisible();
  });
});

test.describe('Trades tab — incoming pending trade @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page, {
      leagueTradeOffers: [MOCK_INCOMING_PENDING],
    });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('renders the proposing team label on the trade card', async ({
    page,
  }) => {
    await expect(page.getByText('From: Beta Force')).toBeVisible();
  });

  test('shows player offered by the proposing team (Mike Trout)', async ({
    page,
  }) => {
    await expect(page.getByText('Mike Trout')).toBeVisible();
  });

  test('shows Accept button for incoming pending trade', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
  });

  test('shows Reject button for incoming pending trade', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
  });

  test('does not show a Withdraw button for incoming trade', async ({
    page,
  }) => {
    await expect(
      page.getByRole('button', { name: 'Withdraw' }),
    ).not.toBeVisible();
  });
});

test.describe('Trades tab — outgoing pending trade @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page, {
      leagueTradeOffers: [MOCK_OUTGOING_PENDING],
    });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('renders the receiving team label on the trade card', async ({
    page,
  }) => {
    await expect(page.getByText('To: Beta Force')).toBeVisible();
  });

  test('shows player being offered in outgoing trade (Mookie Betts)', async ({
    page,
  }) => {
    await expect(page.getByText('Mookie Betts')).toBeVisible();
  });

  test('shows Cancel button for outgoing pending trade', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('does not show Accept or Reject for outgoing trade', async ({
    page,
  }) => {
    await expect(
      page.getByRole('button', { name: 'Accept' }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Reject' }),
    ).not.toBeVisible();
  });
});

test.describe('Trades tab — completed history @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page, {
      leagueTradeOffers: [MOCK_ACCEPTED_TRADE],
    });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('shows accepted trade in the Completed Trades section', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: 'Completed Trades', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Freddie Freeman')).toBeVisible();
  });
});

test.describe('Trades tab — trade block section @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page, { leagueTradeOffers: [] });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('renders the Trade Block section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Trade Block', exact: true }),
    ).toBeVisible();
  });

  test('shows empty state when no players are on the trade block', async ({
    page,
  }) => {
    await expect(page.getByText('No players on the trade block')).toBeVisible();
  });
});

test.describe('Trades tab — trade block with players @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page, {
      leagueTradeOffers: [],
      leagueTradeBlock: [MOCK_TRADE_BLOCK_PLAYER, MOCK_OWN_TRADE_BLOCK_PLAYER],
    });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('lists players on the trade block', async ({ page }) => {
    await expect(page.getByText('Jake Smith')).toBeVisible();
    await expect(page.getByText('Mike Johnson')).toBeVisible();
  });

  test('shows AVAILABLE badge for other teams players', async ({ page }) => {
    await expect(page.getByText('AVAILABLE').first()).toBeVisible();
  });

  test('shows Remove button for own team players', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();
  });

  test('shows asking price when set', async ({ page }) => {
    await expect(page.getByText('Asking: 2nd round pick')).toBeVisible();
  });
});

test.describe('Trades tab — trade block interactions @regression', () => {
  test('sets an asking price via the Set Price flow', async ({ page }) => {
    const ownPlayerNoPrice = {
      __typename: 'TeamMember',
      id: 2,
      teamId: 1,
      playerId: 102,
      onTradeBlock: true,
      askingPrice: null,
      player: { __typename: 'Player', firstName: 'Mike', lastName: 'Johnson' },
    };

    await mockTradesGraphQL(page, {
      leagueTradeOffers: [],
      leagueTradeBlock: [ownPlayerNoPrice],
    });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: 'Set Price' }).click();
    await page.getByRole('textbox').fill('1st round pick');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Asking: 1st round pick')).toBeVisible();
  });

  test('removes a player from the trade block', async ({ page }) => {
    const mutationCalls: string[] = [];

    await mockTradesGraphQL(page, {
      leagueTradeOffers: [],
      leagueTradeBlock: [MOCK_OWN_TRADE_BLOCK_PLAYER],
    });

    await page.route(isGraphQLEndpoint, async (route) => {
      const body = route.request().postDataJSON() as {
        operationName?: string;
      };
      if (body.operationName === 'SetTradeBlock') {
        mutationCalls.push(body.operationName);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              setTradeBlock: {
                ...MOCK_OWN_TRADE_BLOCK_PLAYER,
                onTradeBlock: false,
              },
            },
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: 'Remove' }).click();

    expect(mutationCalls).toContain('SetTradeBlock');
  });
});
