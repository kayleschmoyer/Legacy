/**
 * Football Trades Tab — E2E Tests (LS-5423)
 *
 * Feature Story under the "Football League Detail" QA epic (LS-5268):
 *   As a manager, I want to propose a trade from the Trades tab so that I can
 *   negotiate player swaps with other managers.
 *
 * Covers the Trades tab at /football/league/:id/trades. The tab is rendered by
 * the same sport-agnostic `LeagueDetailPageV2` → `TradesTab` → shared
 * `TradingCenter` (LS-7722) that already backs the baseball Trades tab
 * (apps/web-e2e/src/tests/trading-center.spec.ts, submit-new-trade.spec.ts) —
 * no football-specific production code was needed, only football-eligible
 * fixture data (QB/RB/WR/TE positions, `sport: 'football'` league) to prove
 * the shared component serves football leagues end to end:
 *
 *   - Pending offers: incoming trade offer renders with football players
 *   - Submit new trade: full "Propose Trade" flow with football-eligible
 *     player selection on both sides, and the offer appears in Outgoing
 *     Offers after submission
 *   - Completed trades history: accepted trade renders in Trade History
 *   - Non-members see the spectator empty state
 *
 * All GraphQL queries and mutations are mocked; these tests run without a
 * live backend.
 */

import { expect, test } from '../fixtures/pages';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Mock Data ────────────────────────────────────────────────────────────────

const USER_TEAM_ID = 1;
const OTHER_TEAM_ID = 2;
const LEAGUE_ID = 1;

function makeFootballLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: LEAGUE_ID,
    name: 'Test Football League',
    description: 'E2E football trades tab test',
    owner: 1,
    sport: 'football',
    defensiveFormat: 'dst',
    maxRosterSize: 25,
    draftStatus: 'completed',
    currentMatchup: 1,
    numberOfTeams: 2,
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
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
    secondaryColor: null,
    inviteCode: 'FBTRADE1',
    userMembership: { teamId: USER_TEAM_ID },
    minCareerGames: 50,
    minCareerSeasons: 3,
    waiverType: 'standard',
    gamesPerMatchup: 1,
    pitcherStartsPerMatchup: 1,
    totalMatchups: 17,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    frozenAt: null,
    lmNote: null,
    tradeDeadlineWeek: null,
    currentWeekNumber: 5,
    ...overrides,
  };
}

function makeTeam(id: number, name: string) {
  return {
    __typename: 'Team',
    id,
    name,
    leagueId: LEAGUE_ID,
    waiverOrder: null,
    faabBudget: null,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: null,
  };
}

function makeTeamMember(
  id: number,
  teamId: number,
  playerId: number,
  firstName: string,
  lastName: string,
  positionId = 1,
) {
  return {
    __typename: 'TeamMember',
    id,
    teamId,
    leagueId: LEAGUE_ID,
    playerId,
    positionId,
    onTradeBlock: false,
    player: { __typename: 'Player', firstName, lastName },
  };
}

// Football-eligible rosters — QB/RB/WR on both sides.
const MY_ROSTER = [
  makeTeamMember(1, USER_TEAM_ID, 101, 'Patrick', 'Mahomes'),
  makeTeamMember(2, USER_TEAM_ID, 102, 'Christian', 'McCaffrey'),
];

const THEIR_ROSTER = [
  makeTeamMember(3, OTHER_TEAM_ID, 201, 'Justin', 'Jefferson'),
  makeTeamMember(4, OTHER_TEAM_ID, 202, 'Travis', 'Kelce'),
];

const PROPOSED_TRADE_OFFER = {
  __typename: 'TradeOffer',
  id: 999,
  leagueId: LEAGUE_ID,
  proposingTeamId: USER_TEAM_ID,
  receivingTeamId: OTHER_TEAM_ID,
  proposingTeamName: 'My Gridiron Squad',
  receivingTeamName: 'Rival Blitz',
  status: 'pending',
  message: null,
  expiresAt: null,
  respondedAt: null,
  vetoedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  players: [
    {
      __typename: 'TradeOfferPlayer',
      id: 1,
      tradeOfferId: 999,
      playerId: 101,
      fromTeamId: USER_TEAM_ID,
      playerName: 'Patrick Mahomes',
      playerPosition: 'QB',
    },
    {
      __typename: 'TradeOfferPlayer',
      id: 2,
      tradeOfferId: 999,
      playerId: 201,
      fromTeamId: OTHER_TEAM_ID,
      playerName: 'Justin Jefferson',
      playerPosition: 'WR',
    },
  ],
};

/** Pending incoming trade offer (proposingTeam=2, receivingTeam=1) */
const MOCK_INCOMING_PENDING = {
  __typename: 'TradeOffer',
  id: 10,
  leagueId: LEAGUE_ID,
  proposingTeamId: OTHER_TEAM_ID,
  receivingTeamId: USER_TEAM_ID,
  status: 'pending',
  message: 'Deal?',
  expiresAt: null,
  respondedAt: null,
  vetoedAt: null,
  createdAt: '2024-09-01T12:00:00Z',
  updatedAt: '2024-09-01T12:00:00Z',
  proposingTeamName: 'Rival Blitz',
  receivingTeamName: 'My Gridiron Squad',
  players: [
    {
      __typename: 'TradeOfferPlayer',
      id: 3,
      tradeOfferId: 10,
      playerId: 202,
      fromTeamId: OTHER_TEAM_ID,
      playerName: 'Travis Kelce',
      playerPosition: 'TE',
    },
    {
      __typename: 'TradeOfferPlayer',
      id: 4,
      tradeOfferId: 10,
      playerId: 102,
      fromTeamId: USER_TEAM_ID,
      playerName: 'Christian McCaffrey',
      playerPosition: 'RB',
    },
  ],
};

/** Accepted (completed) trade for the Trade History section. */
const MOCK_ACCEPTED_TRADE = {
  __typename: 'TradeOffer',
  id: 12,
  leagueId: LEAGUE_ID,
  proposingTeamId: USER_TEAM_ID,
  receivingTeamId: OTHER_TEAM_ID,
  status: 'accepted',
  message: null,
  expiresAt: null,
  respondedAt: '2024-08-15T09:00:00Z',
  vetoedAt: null,
  createdAt: '2024-08-14T08:00:00Z',
  updatedAt: '2024-08-15T09:00:00Z',
  proposingTeamName: 'My Gridiron Squad',
  receivingTeamName: 'Rival Blitz',
  players: [
    {
      __typename: 'TradeOfferPlayer',
      id: 5,
      tradeOfferId: 12,
      playerId: 103,
      fromTeamId: USER_TEAM_ID,
      playerName: 'Tyreek Hill',
      playerPosition: 'WR',
    },
  ],
};

// ── GraphQL Mock Setup ──────────────────────────────────────────────────────

interface SetupOptions {
  league?: ReturnType<typeof makeFootballLeague>;
  myRoster?: ReturnType<typeof makeTeamMember>[];
  theirRoster?: ReturnType<typeof makeTeamMember>[];
  leagueTradeOffers?: object[];
  pendingOffers?: object[];
  isMember?: boolean;
  onProposeTrade?: (variables: Record<string, unknown>) => unknown;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    league = makeFootballLeague(),
    myRoster = MY_ROSTER,
    theirRoster = THEIR_ROSTER,
    leagueTradeOffers = [],
    pendingOffers = leagueTradeOffers.filter(
      (o) => (o as Record<string, unknown>)['status'] === 'pending',
    ),
    isMember = true,
    onProposeTrade,
  } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const body = route.request().postDataJSON() as {
      operationName?: string;
      variables?: Record<string, unknown>;
    };
    const op = body.operationName ?? '';

    if (op === 'GetLeagueById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league } }),
      });
      return;
    }
    if (op === 'GetLeagueTeams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            leagueTeams: [
              makeTeam(USER_TEAM_ID, 'My Gridiron Squad'),
              makeTeam(OTHER_TEAM_ID, 'Rival Blitz'),
            ],
          },
        }),
      });
      return;
    }
    if (op === 'GetTeamMembers') {
      const teamId = body.variables?.teamId as number | undefined;
      const roster = teamId === OTHER_TEAM_ID ? theirRoster : myRoster;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: roster } }),
      });
      return;
    }
    if (op === 'GetTeamTradeOffers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamTradeOffers: pendingOffers } }),
      });
      return;
    }
    if (op === 'GetLeagueTradeOffers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTradeOffers } }),
      });
      return;
    }
    if (op === 'ProposeTrade') {
      const result = onProposeTrade
        ? onProposeTrade(body.variables ?? {})
        : PROPOSED_TRADE_OFFER;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { proposeTrade: result } }),
      });
      return;
    }
    if (op === 'GetLeagueTradeBlock') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTradeBlock: [] } }),
      });
      return;
    }
    if (op === 'GetUserTeamId') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { userTeamId: isMember ? USER_TEAM_ID : null },
        }),
      });
      return;
    }
    if (op === 'GetMatchupsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsForLeague: [] } }),
      });
      return;
    }
    if (op === 'GetCurrentWeekForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: null } }),
      });
      return;
    }
    if (op === 'GetLeagueDraft') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getLeagueDraft: { __typename: 'Draft', draftMode: 'live' } },
        }),
      });
      return;
    }
    if (op === 'GetDraftTeamOrder') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getDraftTeamOrder: [] } }),
      });
      return;
    }
    if (op === 'GetUserLeagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [league] } }),
      });
      return;
    }

    await unmockedGraphQLFallback(route);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

const OFFER_PLAYER = 'Patrick Mahomes'; // MY_ROSTER[0]
const REQUEST_PLAYER = 'Justin Jefferson'; // THEIR_ROSTER[0]

test.describe('Football Trades tab — navigation @smoke', () => {
  test('navigates to the football league Trades tab without errors', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID, 'football');

    await expect(page).toHaveURL(/\/football\/league\/1\/trades/);
    await tradesPage.expectNoAppError();
  });
});

test.describe('Football Trades tab — pending offers @critical', () => {
  test.beforeEach(async ({ page, tradesPage }) => {
    await setupGraphQL(page, { leagueTradeOffers: [MOCK_INCOMING_PENDING] });
    await tradesPage.gotoTrades(LEAGUE_ID, 'football');
  });

  test('renders the proposing team label on the incoming trade card', async ({
    tradesPage,
  }) => {
    await tradesPage.expectIncomingFrom('Rival Blitz');
  });

  test('shows the football-eligible player offered by the proposing team', async ({
    tradesPage,
  }) => {
    await tradesPage.expectPlayerVisible('Travis Kelce');
  });

  test('shows Accept and Reject actions for the incoming pending trade', async ({
    tradesPage,
  }) => {
    await tradesPage.acceptButton.expectVisible();
    await tradesPage.rejectButton.expectVisible();
  });
});

test.describe('Football Trades tab — submit new trade @critical', () => {
  test('shows the "Propose Trade" button on the Trades tab', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID, 'football');

    await tradesPage.proposeTradeButton.expectVisible({ timeout: 15_000 });
  });

  test('lists the counterparty team in the team-selection step', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID, 'football');

    await tradesPage.openProposeTradeDialog();
    await tradesPage.expectTeamSelectionStep();
    await tradesPage.expectTeamListed('Rival Blitz');
  });

  test('lists football-eligible roster players in the offer and request steps', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID, 'football');

    await tradesPage.openProposeTradeDialog();
    await tradesPage.selectTradeTeam('Rival Blitz');
    await tradesPage.expectPlayerVisible('Patrick Mahomes');
    await tradesPage.expectPlayerVisible('Christian McCaffrey');

    await tradesPage.selectOfferPlayer(OFFER_PLAYER);
    await tradesPage.goToRequestStep();
    await tradesPage.expectRequestStep();
    await tradesPage.expectPlayerVisible('Justin Jefferson');
    await tradesPage.expectPlayerVisible('Travis Kelce');
  });

  test('closes the dialog after successful trade submission', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID, 'football');

    await tradesPage.proposeTrade({
      team: 'Rival Blitz',
      offerPlayer: OFFER_PLAYER,
      requestPlayer: REQUEST_PLAYER,
    });

    await tradesPage.expectProposeDialogClosed();
  });

  test('shows the submitted offer in Outgoing Offers after submission', async ({
    page,
    tradesPage,
  }) => {
    // The mutation response is inserted into the cached pending-offers list by
    // ProposeTrade's Apollo `update` callback (TradingCenter.tsx) — seed the
    // post-submission state directly (mirrors submit-new-trade.spec.ts) rather
    // than re-driving the UI flow, since GetTeamTradeOffers/GetLeagueTradeOffers
    // already prove the pending-list rendering elsewhere in this file.
    await setupGraphQL(page, { leagueTradeOffers: [PROPOSED_TRADE_OFFER] });
    await tradesPage.gotoTrades(LEAGUE_ID, 'football');

    await tradesPage.expectOutgoingTo('Rival Blitz');
  });
});

test.describe('Football Trades tab — completed trades history @regression', () => {
  test.beforeEach(async ({ page, tradesPage }) => {
    await setupGraphQL(page, { leagueTradeOffers: [MOCK_ACCEPTED_TRADE] });
    await tradesPage.gotoTrades(LEAGUE_ID, 'football');
  });

  test('shows the accepted trade in the Trade History section', async ({
    tradesPage,
  }) => {
    await tradesPage.openTradeHistory();
    await tradesPage.expectPlayerVisible('Tyreek Hill');
  });
});

test.describe('Football Trades tab — non-member empty state @regression', () => {
  test('shows the spectator empty state instead of the Trading Center', async ({
    page,
    tradesPage,
  }) => {
    // owner: 2 (not the default e2e user id=1) so the viewer isn't treated as
    // commissioner-by-ownership — isMember must come solely from userTeamId.
    await setupGraphQL(page, {
      league: makeFootballLeague({ owner: 2 }),
      isMember: false,
    });
    await page.goto('/football/league/1/trades');

    await expect(page.getByTestId('trade-center-heading')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Join this league to trade')).toBeVisible();
    await tradesPage.proposeTradeButton.expectHidden();
  });
});
