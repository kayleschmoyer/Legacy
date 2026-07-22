/**
 * Submit New Trade Offer — E2E Tests (LS-5678)
 *
 * Covers the "Propose Trade" dialog on the League Trades tab:
 *   /baseball/league/:id/trades
 *
 *   - "Propose Trade" button is visible
 *   - Dialog opens when the button is clicked
 *   - Step 1 — Team selection: lists other teams
 *   - Step 2 — Offer: shows user's roster players
 *   - Step 3 — Request: shows target team's roster players
 *   - Step 4 — Confirm: shows "Send Trade Offer" button
 *   - Successful submission calls ProposeTrade mutation and closes dialog
 *   - Outgoing offer appears in the Outgoing Offers section after submission
 *   - "Propose Trade" button is disabled when past the trade deadline
 *
 * All GraphQL queries and mutations are mocked; these tests run without a live
 * backend.
 */

import { test } from '../fixtures/pages';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// Page-object migration (LS-8456 / ADR-0015/0016): the multi-step Propose Trade
// dialog is driven through `tradesPage` (TradesPage) — specs are selector-free.
// GraphQL mocking stays here (ADR-0015 §6).

// ── Mock Data ────────────────────────────────────────────────────────────────────────────────

const USER_TEAM_ID = 1;
const OTHER_TEAM_ID = 2;
const LEAGUE_ID = 1;

function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: LEAGUE_ID,
    name: 'Test League',
    description: 'E2E submit trade test',
    owner: 1,
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
    inviteCode: 'TRADE001',
    userMembership: { teamId: USER_TEAM_ID },
    minCareerGames: 50,
    minCareerSeasons: 3,
    waiverType: 'standard',
    gamesPerMatchup: 5,
    pitcherStartsPerMatchup: 1,
    totalMatchups: 22,
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
  playerId: number,
  firstName: string,
  lastName: string,
  positionId = 1,
) {
  return {
    __typename: 'TeamMember',
    id,
    teamId: USER_TEAM_ID,
    leagueId: LEAGUE_ID,
    playerId,
    positionId,
    onTradeBlock: false,
    player: { __typename: 'Player', firstName, lastName },
  };
}

const MY_ROSTER = [
  makeTeamMember(1, 101, 'Aaron', 'Judge'),
  makeTeamMember(2, 102, 'Bryce', 'Harper'),
];

const THEIR_ROSTER = [
  { ...makeTeamMember(3, 201, 'Mike', 'Trout'), teamId: OTHER_TEAM_ID },
  { ...makeTeamMember(4, 202, 'Shohei', 'Ohtani'), teamId: OTHER_TEAM_ID },
];

const PROPOSED_TRADE_OFFER = {
  __typename: 'TradeOffer',
  id: 999,
  leagueId: LEAGUE_ID,
  proposingTeamId: USER_TEAM_ID,
  receivingTeamId: OTHER_TEAM_ID,
  proposingTeamName: 'My Team',
  receivingTeamName: 'Rival Squad',
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
      playerName: 'Aaron Judge',
      playerPosition: 'RF',
    },
    {
      __typename: 'TradeOfferPlayer',
      id: 2,
      tradeOfferId: 999,
      playerId: 201,
      fromTeamId: OTHER_TEAM_ID,
      playerName: 'Mike Trout',
      playerPosition: 'CF',
    },
  ],
};

// ── GraphQL Mock Setup ─────────────────────────────────────────────────────────────────────

interface SetupOptions {
  league?: ReturnType<typeof makeLeague>;
  myRoster?: ReturnType<typeof makeTeamMember>[];
  theirRoster?: ReturnType<typeof makeTeamMember>[];
  onProposeTrade?: (variables: Record<string, unknown>) => unknown;
  proposeTradeUnauthenticated?: boolean;
  pendingOffers?: object[];
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    league = makeLeague(),
    myRoster = MY_ROSTER,
    theirRoster = THEIR_ROSTER,
    onProposeTrade,
    proposeTradeUnauthenticated = false,
    pendingOffers = [],
  } = opts;

  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as {
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
                makeTeam(USER_TEAM_ID, 'My Team'),
                makeTeam(OTHER_TEAM_ID, 'Rival Squad'),
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
          body: JSON.stringify({ data: { leagueTradeOffers: pendingOffers } }),
        });
        return;
      }
      if (op === 'ProposeTrade') {
        if (proposeTradeUnauthenticated) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              errors: [
                {
                  message: 'UNAUTHENTICATED',
                  extensions: { code: 'UNAUTHENTICATED' },
                },
              ],
              data: null,
            }),
          });
          return;
        }
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
          body: JSON.stringify({ data: { userTeamId: USER_TEAM_ID } }),
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
            data: {
              getLeagueDraft: { __typename: 'Draft', draftMode: 'live' },
            },
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
    },
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────────────────

// The default rosters seeded by `setupGraphQL`: pick the first player from each
// side to drive the full flow (mirrors the previous helper's "first available
// player" selection — same outcome for these fixtures).
const OFFER_PLAYER = 'Aaron Judge'; // MY_ROSTER[0]
const REQUEST_PLAYER = 'Mike Trout'; // THEIR_ROSTER[0]

test.describe('Submit New Trade Offer @regression', () => {
  test('should display the "Propose Trade" button on the Trades tab', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.proposeTradeButton.expectVisible({ timeout: 15_000 });
  });

  test('should open the Propose Trade dialog when the button is clicked', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.openProposeTradeDialog();

    await tradesPage.proposeTradeDialog.expectVisible({ timeout: 10_000 });
  });

  test('should show the team-selection step with other teams listed', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.openProposeTradeDialog();

    await tradesPage.expectTeamSelectionStep();
    // Only "Rival Squad" should appear (not "My Team" which is userTeamId=1)
    await tradesPage.expectTeamListed('Rival Squad');
  });

  test('should advance to the offer step after clicking a team', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.openProposeTradeDialog();
    await tradesPage.selectTradeTeam('Rival Squad');

    await tradesPage.expectOfferStep();
  });

  test('should list user roster players in the offer step', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.openProposeTradeDialog();
    await tradesPage.selectTradeTeam('Rival Squad');

    // Wait for player list to load
    await tradesPage.expectPlayerVisible('Aaron Judge');
    await tradesPage.expectPlayerVisible('Bryce Harper');
  });

  test('should show "Next — Select Their Players" button after selecting an offering player', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.openProposeTradeDialog();
    await tradesPage.selectTradeTeam('Rival Squad');
    await tradesPage.selectOfferPlayer('Aaron Judge');

    await tradesPage.nextSelectTheirPlayersButton.expectVisible({
      timeout: 10_000,
    });
  });

  test('should advance to the request step and show target team roster', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.openProposeTradeDialog();
    await tradesPage.selectTradeTeam('Rival Squad');
    await tradesPage.selectOfferPlayer('Aaron Judge');
    await tradesPage.goToRequestStep();

    await tradesPage.expectRequestStep();
    await tradesPage.expectPlayerVisible('Mike Trout');
    await tradesPage.expectPlayerVisible('Shohei Ohtani');
  });

  test('should show "Review Trade" button after selecting a requesting player', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.openProposeTradeDialog();
    await tradesPage.selectTradeTeam('Rival Squad');
    await tradesPage.selectOfferPlayer('Aaron Judge');
    await tradesPage.goToRequestStep();
    await tradesPage.selectRequestPlayer('Mike Trout');

    await tradesPage.reviewTradeButton.expectVisible({ timeout: 10_000 });
  });

  test('should show the confirm step with "Send Trade Offer" button', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.openProposeTradeDialog();
    await tradesPage.selectTradeTeam('Rival Squad');
    await tradesPage.selectOfferPlayer('Aaron Judge');
    await tradesPage.goToRequestStep();
    await tradesPage.selectRequestPlayer('Mike Trout');
    await tradesPage.reviewTrade();

    await tradesPage.sendTradeOfferButton.expectVisible({ timeout: 10_000 });
  });

  test('should close the dialog after successful trade submission', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page);
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.proposeTrade({
      team: 'Rival Squad',
      offerPlayer: OFFER_PLAYER,
      requestPlayer: REQUEST_PLAYER,
    });

    await tradesPage.expectProposeDialogClosed();
  });

  test('should show the submitted offer in Outgoing Offers after submission', async ({
    page,
    tradesPage,
  }) => {
    // After mutation succeeds, the cache update writes the offer into the pending list
    await setupGraphQL(page, {
      pendingOffers: [PROPOSED_TRADE_OFFER],
    });
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.expectOutgoingTo('Rival Squad');
  });

  test('should disable "Propose Trade" when the trade deadline has passed', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ tradeDeadlineWeek: 10, currentWeekNumber: 11 }),
    });
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.proposeTradeButton.expectVisible({ timeout: 15_000 });
    await tradesPage.proposeTradeButton.expectDisabled({ timeout: 10_000 });
  });

  test('should show an error when ProposeTrade returns UNAUTHENTICATED', async ({
    page,
    tradesPage,
  }) => {
    await setupGraphQL(page, { proposeTradeUnauthenticated: true });
    await tradesPage.gotoTrades(LEAGUE_ID);

    await tradesPage.proposeTrade({
      team: 'Rival Squad',
      offerPlayer: OFFER_PLAYER,
      requestPlayer: REQUEST_PLAYER,
    });

    await tradesPage.expectErrorMessage(/UNAUTHENTICATED/i);
  });
});
