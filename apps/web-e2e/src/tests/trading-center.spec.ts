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

interface MockOpts {
  leagueTradeOffers?: object[];
}

async function mockTradesGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOpts = {},
) {
  const leagueOffers = opts.leagueTradeOffers ?? [];

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('getleaguetradeoffers')) {
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

  test('shows "Pending Trade Offers" section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Pending Trade Offers' }),
    ).toBeVisible();
  });

  test('shows "Completed Trades" section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Completed Trades', exact: true }),
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

  test('renders an Incoming pill on the trade card', async ({ page }) => {
    await expect(page.getByText('Incoming', { exact: true })).toBeVisible();
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

  test('renders an Outgoing pill on the trade card', async ({ page }) => {
    await expect(page.getByText('Outgoing', { exact: true })).toBeVisible();
  });

  test('shows player being offered in outgoing trade (Mookie Betts)', async ({
    page,
  }) => {
    await expect(page.getByText('Mookie Betts')).toBeVisible();
  });

  test('shows Withdraw button for outgoing pending trade', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Withdraw' })).toBeVisible();
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
