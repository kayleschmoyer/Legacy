/**
 * Trades Tab E2E Tests
 *
 * Covers the V2 TradesTab rendered on the Trades tab of the
 * League Detail page at /baseball/league/:id/trades.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * WebSocket events are intercepted via page.routeWebSocket() — no real WS
 * server required (see BLD-033 / LS-5966).
 */

import type { WebSocketRoute } from '@playwright/test';
import { injectWebSocketUrl } from './helpers/websocket-test-utils';
import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// Page-object migration (LS-8456 / ADR-0015/0016): all trades selectors live on
// `tradesPage` (TradesPage) — specs are selector-free. GraphQL/WebSocket mocking
// stays here (ADR-0015 §6). The WebSocket real-time refresh flow is web-only
// pending LS-8448 — see the TradesPage class doc comment.

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
  // Mutable copy so the SetTradeBlock mutation handler can mirror changes
  // back into the list that GetLeagueTradeBlock refetches.
  let tradeBlock: object[] = [...(opts.leagueTradeBlock ?? [])];
  // Pending offers (status='pending') are fetched via GetTeamTradeOffers in
  // the shared TradingCenter; the league query is used for history only.
  const pendingOffers = leagueOffers.filter(
    (o: Record<string, unknown>) => o['status'] === 'pending',
  );

  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();

    if (operation === 'getteamtradeoffers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamTradeOffers: pendingOffers } }),
      });
    } else if (operation === 'getleaguetradeoffers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTradeOffers: leagueOffers } }),
      });
      // NOTE: GetLeagueTradeBlock / SetTradeBlock must be matched *before* the
      // generic `getleague` branch below — "getleaguetradeblock" contains the
      // substring "getleague", so the league-detail branch would otherwise
      // swallow the trade-block request and the block would render empty.
    } else if (operation === 'getleaguetradeblock') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTradeBlock: tradeBlock } }),
      });
    } else if (operation === 'settradeblock') {
      // Stateful mutation: mirror the change into `tradeBlock` so the
      // refetched GetLeagueTradeBlock reflects the new asking price / removal.
      const vars =
        (
          route.request().postDataJSON() as {
            variables?: Record<string, unknown>;
          }
        ).variables ?? {};
      const memberId = vars['teamMemberId'] as number | undefined;
      const onBlock = (vars['onTradeBlock'] as boolean | undefined) ?? true;
      const askingPrice =
        (vars['askingPrice'] as string | null | undefined) ?? null;
      let updated: Record<string, unknown> | null = null;
      tradeBlock = tradeBlock
        .map((m) => {
          const member = m as Record<string, unknown>;
          if (member['id'] === memberId) {
            updated = { ...member, onTradeBlock: onBlock, askingPrice };
            return updated;
          }
          return member;
        })
        .filter((m) => m['onTradeBlock'] !== false);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            setTradeBlock: updated ?? {
              __typename: 'TeamMember',
              id: memberId ?? 0,
              onTradeBlock: onBlock,
              askingPrice,
            },
          },
        }),
      });
    } else if (operation === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (operation === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (operation === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (operation === 'getuserteamid') {
      // V2 schema: userTeamId is a scalar Int? (not a wrapped object).
      // myTeamId = 1 makes Alpha Squad the viewing team, which is the
      // receiver of MOCK_INCOMING_PENDING and the proposer of
      // MOCK_OUTGOING_PENDING.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (operation === 'getuserleagues') {
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
  test('navigates to trades tab without errors', async ({
    page,
    tradesPage,
  }) => {
    await mockTradesGraphQL(page);
    await tradesPage.gotoTrades(1);

    await expect(page).toHaveURL(/\/trades/);
    await tradesPage.expectNoAppError();
  });
});

test.describe('Trades tab — sections @critical', () => {
  test.beforeEach(async ({ page, tradesPage }) => {
    await mockTradesGraphQL(page, {
      leagueTradeOffers: [MOCK_INCOMING_PENDING],
    });
    await tradesPage.gotoTrades(1);
  });

  test('shows "Incoming Offers" section heading', async ({ tradesPage }) => {
    await tradesPage.expectIncomingOffersSection();
  });

  test('shows "Trade History" section toggle', async ({ tradesPage }) => {
    await tradesPage.expectTradeHistorySection();
  });
});

test.describe('Trades tab — empty state @regression', () => {
  test.beforeEach(async ({ page, tradesPage }) => {
    await mockTradesGraphQL(page, { leagueTradeOffers: [] });
    await tradesPage.gotoTrades(1);
  });

  test('shows empty pending message when there are no pending offers', async ({
    tradesPage,
  }) => {
    await tradesPage.expectNoIncomingOffers();
  });

  test('shows empty completed message when there are no accepted trades', async ({
    tradesPage,
  }) => {
    // Completed trades live behind the collapsible "Trade History" toggle,
    // which is collapsed by default in the shared TradingCenter. Expand it
    // to reveal the empty-history message.
    await tradesPage.openTradeHistory();
    await tradesPage.expectNoTradeHistory();
  });
});

test.describe('Trades tab — incoming pending trade @critical', () => {
  test.beforeEach(async ({ page, tradesPage }) => {
    await mockTradesGraphQL(page, {
      leagueTradeOffers: [MOCK_INCOMING_PENDING],
    });
    await tradesPage.gotoTrades(1);
  });

  test('renders the proposing team label on the trade card', async ({
    tradesPage,
  }) => {
    await tradesPage.expectIncomingFrom('Beta Force');
  });

  test('shows player offered by the proposing team (Mike Trout)', async ({
    tradesPage,
  }) => {
    await tradesPage.expectPlayerVisible('Mike Trout');
  });

  test('shows Accept button for incoming pending trade', async ({
    tradesPage,
  }) => {
    await tradesPage.acceptButton.expectVisible();
  });

  test('shows Reject button for incoming pending trade', async ({
    tradesPage,
  }) => {
    await tradesPage.rejectButton.expectVisible();
  });

  test('does not show a Withdraw button for incoming trade', async ({
    tradesPage,
  }) => {
    await tradesPage.withdrawButton.expectHidden();
  });
});

test.describe('Trades tab — outgoing pending trade @critical', () => {
  test.beforeEach(async ({ page, tradesPage }) => {
    await mockTradesGraphQL(page, {
      leagueTradeOffers: [MOCK_OUTGOING_PENDING],
    });
    await tradesPage.gotoTrades(1);
  });

  test('renders the receiving team label on the trade card', async ({
    tradesPage,
  }) => {
    await tradesPage.expectOutgoingTo('Beta Force');
  });

  test('shows player being offered in outgoing trade (Mookie Betts)', async ({
    tradesPage,
  }) => {
    await tradesPage.expectPlayerVisible('Mookie Betts');
  });

  test('shows Cancel button for outgoing pending trade', async ({
    tradesPage,
  }) => {
    await tradesPage.cancelButton.expectVisible();
  });

  test('does not show Accept or Reject for outgoing trade', async ({
    tradesPage,
  }) => {
    await tradesPage.acceptButton.expectHidden();
    await tradesPage.rejectButton.expectHidden();
  });
});

test.describe('Trades tab — completed history @regression', () => {
  test.beforeEach(async ({ page, tradesPage }) => {
    await mockTradesGraphQL(page, {
      leagueTradeOffers: [MOCK_ACCEPTED_TRADE],
    });
    await tradesPage.gotoTrades(1);
  });

  test('shows accepted trade in the Trade History section', async ({
    tradesPage,
  }) => {
    // Completed (non-pending) trades render under the collapsible "Trade
    // History" toggle. Expanding it fires the GetLeagueTradeOffers query.
    await tradesPage.openTradeHistory();
    await tradesPage.expectPlayerVisible('Freddie Freeman');
  });
});

test.describe('Trades tab — trade block section @smoke', () => {
  test.beforeEach(async ({ page, tradesPage }) => {
    await mockTradesGraphQL(page, { leagueTradeOffers: [] });
    await tradesPage.gotoTrades(1);
  });

  test('renders the Trade Block section heading', async ({ tradesPage }) => {
    // LeagueTradeBlock renders its title as a styled Text node (not a
    // semantic heading), so match on the exact text.
    await tradesPage.expectTradeBlockHeading();
  });

  test('shows empty state when no players are on the trade block', async ({
    tradesPage,
  }) => {
    await tradesPage.expectTradeBlockEmpty();
  });
});

test.describe('Trades tab — trade block with players @regression', () => {
  test.beforeEach(async ({ page, tradesPage }) => {
    await mockTradesGraphQL(page, {
      leagueTradeOffers: [],
      leagueTradeBlock: [MOCK_TRADE_BLOCK_PLAYER, MOCK_OWN_TRADE_BLOCK_PLAYER],
    });
    await tradesPage.gotoTrades(1);
  });

  test('lists players on the trade block', async ({ tradesPage }) => {
    await tradesPage.expectPlayerVisible('Jake Smith');
    await tradesPage.expectPlayerVisible('Mike Johnson');
  });

  test('shows AVAILABLE badge for other teams players', async ({
    tradesPage,
  }) => {
    await tradesPage.expectAvailableBadge();
  });

  test('shows Remove button for own team players', async ({ tradesPage }) => {
    await tradesPage.removeButton.expectVisible();
  });

  test('shows asking price when set', async ({ tradesPage }) => {
    await tradesPage.expectAskingPrice('2nd round pick');
  });
});

// ── WebSocket real-time refresh (BLD-033 / LS-5966) ─────────────────────────

test.describe('Trades tab — WebSocket real-time refresh @critical', () => {
  /**
   * Wire up a routeWebSocket interceptor and return a helper that waits for
   * the app's WS connection attempt (which only happens once the page loads
   * and the LeagueWebSocketContext mounts).
   */
  async function setupWebSocket(
    page: import('@playwright/test').Page,
  ): Promise<{
    waitForConnection: () => Promise<WebSocketRoute>;
  }> {
    await injectWebSocketUrl(page);
    let wsRoute: WebSocketRoute | undefined;
    await page.routeWebSocket(/wss?:\/\//, (ws) => {
      wsRoute = ws;
      ws.onMessage(() => {
        /* absorb pings */
      });
    });
    return {
      waitForConnection: async () => {
        await expect
          .poll(() => wsRoute !== undefined, { timeout: 10_000 })
          .toBe(true);
        return wsRoute as WebSocketRoute;
      },
    };
  }

  test('TRADE_OFFER WebSocket event triggers a GetTeamTradeOffers refetch — outgoing pending trade disappears after remote GM accepts', async ({
    page,
    tradesPage,
  }) => {
    // Stateful call counter: first response = pending, subsequent = empty
    // (simulating the remote GM accepting the outgoing trade).
    let teamTradeOffersCallCount = 0;

    await mockTradesGraphQL(page, {
      leagueTradeOffers: [MOCK_OUTGOING_PENDING],
    });

    // Override only GetTeamTradeOffers with stateful responses; fall through
    // for everything else so mockTradesGraphQL handles it.
    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation === 'getteamtradeoffers') {
        teamTradeOffersCallCount++;
        const offers =
          teamTradeOffersCallCount <= 1 ? [MOCK_OUTGOING_PENDING] : [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { teamTradeOffers: offers } }),
        });
      } else {
        await route.fallback();
      }
    });

    const ws = await setupWebSocket(page);

    await tradesPage.gotoTrades(1);

    // Confirm initial state: outgoing pending trade is visible.
    await tradesPage.expectPlayerVisible('Mookie Betts');

    // Wait for the WS connection before sending events.
    const route = await ws.waitForConnection();

    // Prepare to detect the refetch GraphQL request that fires after the WS event.
    const refetchPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/graphql') &&
        !resp.url().includes('/@fs/') &&
        (resp
          .request()
          .postData()
          ?.toLowerCase()
          .includes('"getteamtradeoffers"') ??
          false),
      { timeout: 10_000 },
    );

    // Send TRADE_OFFER notification — mirrors what the WS server sends when
    // GM B accepts the outgoing trade from GM A.
    route.send(
      JSON.stringify({
        type: 'notification',
        data: { type: 'TRADE_OFFER', leagueId: 1 },
      }),
    );

    // The TradingCenter web wrapper must refetch GetTeamTradeOffers in response.
    await refetchPromise;
    expect(teamTradeOffersCallCount).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Trades tab — trade block interactions @regression', () => {
  test('sets an asking price via the Set Price flow', async ({
    page,
    tradesPage,
  }) => {
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
    await tradesPage.gotoTrades(1);

    await tradesPage.setAskingPrice('1st round pick');

    await tradesPage.expectAskingPrice('1st round pick');
  });

  test('removes a player from the trade block', async ({
    page,
    tradesPage,
  }) => {
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

    await tradesPage.gotoTrades(1);

    await tradesPage.removeFromTradeBlock();

    // The SetTradeBlock mutation is dispatched asynchronously and captured by
    // the route interceptor above, so poll rather than asserting synchronously
    // to avoid racing the request under CI load (mirrors the Set Price flow /
    // LS-8123 fix).
    await expect.poll(() => mutationCalls).toContain('SetTradeBlock');
  });
});
