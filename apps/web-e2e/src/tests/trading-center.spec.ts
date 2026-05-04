/**
 * Trading Center E2E Tests
 *
 * Covers the TradingCenter component rendered on the Trades tab of the
 * League Detail page at /baseball/league/:id/trades.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

/** URL predicate for the GraphQL API endpoint */
function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: 'E2E trading center test league',
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

/** Accepted trade (for history / commissioner veto) */
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
  teamTradeOffers?: object[];
  leagueTradeOffers?: object[];
}

async function mockTradesGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOpts = {},
) {
  const teamOffers = opts.teamTradeOffers ?? [];
  const leagueOffers = opts.leagueTradeOffers ?? [];

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('getteamtradeoffers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamTradeOffers: teamOffers } }),
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { userTeamId: 1 },
        }),
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

test.describe('Trading Center — navigation @smoke', () => {
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

test.describe('Trading Center — header and layout @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page);
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('shows "Trading Center" heading', async ({ page }) => {
    // V2 wraps TradingCenter in a Section with title "Trading Center"
    // (as an <h3>). The legacy TradingCenter component also renders its own
    // "Trading Center" header inside #panel-trades, so scope to the first
    // heading-style match to avoid strict-mode violation.
    await expect(
      page.getByRole('heading', { name: 'Trading Center' }).first(),
    ).toBeVisible();
  });

  test('shows "Propose Trade" button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Propose Trade' }),
    ).toBeVisible();
  });

  test('shows "Incoming Offers" section', async ({ page }) => {
    await expect(page.getByText('Incoming Offers')).toBeVisible();
  });

  test('shows "Outgoing Offers" section', async ({ page }) => {
    await expect(
      page.getByText('Outgoing Offers', { exact: true }),
    ).toBeVisible();
  });
});

test.describe('Trading Center — empty states @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page, { teamTradeOffers: [] });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('shows empty incoming message when no pending incoming offers', async ({
    page,
  }) => {
    await expect(page.getByText('No incoming trade offers')).toBeVisible();
  });

  test('shows empty outgoing message when no pending outgoing offers', async ({
    page,
  }) => {
    await expect(page.getByText(/No outgoing offers/)).toBeVisible();
  });
});

test.describe('Trading Center — incoming pending trade @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page, {
      teamTradeOffers: [MOCK_INCOMING_PENDING],
    });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('shows proposing team name for incoming offer', async ({ page }) => {
    await expect(page.getByText(/From: Beta Force/)).toBeVisible();
  });

  test('shows PENDING status badge', async ({ page }) => {
    // Multiple PENDING badges may render (one per offer); just verify any visible.
    await expect(page.getByText('PENDING').first()).toBeVisible();
  });

  test('shows player name being offered (Mike Trout)', async ({ page }) => {
    await expect(page.getByText('Mike Trout')).toBeVisible();
  });

  test('shows Accept button for incoming pending trade', async ({ page }) => {
    await expect(page.getByText('Accept')).toBeVisible();
  });

  test('shows Reject button for incoming pending trade', async ({ page }) => {
    await expect(page.getByText('Reject')).toBeVisible();
  });
});

test.describe('Trading Center — outgoing pending trade @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page, {
      teamTradeOffers: [MOCK_OUTGOING_PENDING],
    });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('shows receiving team name for outgoing offer', async ({ page }) => {
    await expect(page.getByText(/To: Beta Force/)).toBeVisible();
  });

  test('shows player name in outgoing trade (Mookie Betts)', async ({
    page,
  }) => {
    await expect(page.getByText('Mookie Betts')).toBeVisible();
  });

  test('shows Cancel button for outgoing pending trade', async ({ page }) => {
    await expect(page.getByText('Cancel')).toBeVisible();
  });

  test('does not show Accept or Reject for outgoing trade', async ({
    page,
  }) => {
    await expect(page.getByText('Accept')).not.toBeVisible();
    await expect(page.getByText('Reject')).not.toBeVisible();
  });
});

test.describe('Trading Center — trade history @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page, { teamTradeOffers: [] });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('shows Trade History toggle button', async ({ page }) => {
    await expect(page.getByText('Trade History')).toBeVisible();
  });
});

test.describe('Trading Center — propose trade dialog @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockTradesGraphQL(page, { teamTradeOffers: [] });
    await page.goto('/baseball/league/1/trades');
    await page.waitForLoadState('load');
  });

  test('opens Propose Trade dialog when clicking Propose Trade', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Propose Trade' }).click();

    await expect(
      page.getByRole('dialog', { name: 'Propose Trade' }),
    ).toBeVisible();
  });

  test('dialog shows step 1 — team selection', async ({ page }) => {
    await page.getByRole('button', { name: 'Propose Trade' }).click();

    await expect(
      page.getByText('Select the team you want to trade with'),
    ).toBeVisible();
  });

  test('dialog shows team names to trade with', async ({ page }) => {
    await page.getByRole('button', { name: 'Propose Trade' }).click();

    // Wait for the dialog to appear and the GetLeagueTeams query to resolve
    await expect(
      page.getByText('Select the team you want to trade with'),
    ).toBeVisible({ timeout: 5000 });

    // Beta Force is the other team (not my team)
    await expect(page.getByText('Beta Force')).toBeVisible({ timeout: 5000 });
  });
});
