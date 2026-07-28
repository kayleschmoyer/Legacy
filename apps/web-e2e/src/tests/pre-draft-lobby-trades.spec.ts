/**
 * Pre-Draft Lobby — Draft Slot Trading (LS-8677)
 *
 * Covers the propose -> approve -> order-change flow for draft slot trading
 * surfaced in the pre-draft lobby (/baseball/league/:id/draft, PreDraftLobby):
 *   - the commissioner (who is also team 1's GM) proposes a swap with team 2
 *   - the trade is approved (simulating team 2 having already accepted)
 *   - the Draft Order list reflects the executed slot swap
 *   - the trade panel is hidden entirely when allowDraftSlotTrading is false
 *
 * All GraphQL responses are mocked (hermetic) — no live backend required.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const DRAFT_URL = '/baseball/league/1/draft';

const MOCK_TEAMS = [
  { __typename: 'Team', id: 1, name: 'Alpha Squad', leagueId: 1, owner: 1 },
  { __typename: 'Team', id: 2, name: 'Beta Force', leagueId: 1, owner: 2 },
  { __typename: 'Team', id: 3, name: 'Gamma Rays', leagueId: 1, owner: 3 },
  { __typename: 'Team', id: 4, name: 'Delta Dawn', leagueId: 1, owner: 4 },
];

function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Test League',
    owner: 1,
    sport: 'baseball',
    defensiveFormat: null,
    maxRosterSize: 25,
    currentMatchup: null,
    currentWeekNumber: null,
    draftStatus: 'not-started',
    leaguePhase: null,
    inviteCode: 'TEST1234',
    playerPool: 'all',
    weekAdvanceStatus: null,
    waiverType: 'standard',
    waiverEnabled: true,
    faabBudgetDefault: null,
    pitcherStartsPerMatchup: 1,
    gamesPerMatchup: 5,
    minCareerGames: 50,
    minCareerSeasons: 3,
    totalMatchups: 10,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    lmNotes: null,
    isMockDraft: false,
    isPublic: false,
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
    secondaryColor: null,
    previousLeagueId: null,
    frozenAt: null,
    seasonNumber: 1,
    salaryCapEnabled: false,
    salaryCap: null,
    salaryFloor: null,
    luxuryTaxThreshold: null,
    minSalary: null,
    salaryEscalationPct: null,
    salaryDecayPct: null,
    auctionBudget: null,
    auctionMinBid: null,
    eraFilter: null,
    baseballHofOnly: false,
    customEraStartYear: null,
    customEraEndYear: null,
    tradeDeadlineWeek: null,
    allowDraftSlotTrading: true,
    userMembership: {
      __typename: 'LeagueMember',
      leagueId: 1,
      userId: 1,
      teamId: 1,
      permissionLevel: 'commissioner',
      username: 'commish',
    },
    ...overrides,
  };
}

function makeDraftOrder(order: number[]) {
  return order.map((teamId) => ({
    __typename: 'DraftTeamOrder',
    teamId,
    teamName:
      MOCK_TEAMS.find((t) => t.id === teamId)?.name ?? `Team ${String(teamId)}`,
    draftOrder: order.indexOf(teamId) + 1,
  }));
}

interface TradeState {
  status: 'none' | 'proposed' | 'accepted' | 'executed';
  proposeCalls: Array<{ leagueId: number; counterpartTeamId: number }>;
  approveCalls: number[];
}

function makeTrade(state: TradeState) {
  return {
    __typename: 'DraftSlotTrade',
    id: 1,
    leagueId: 1,
    proposerTeamId: 1,
    proposerTeamName: 'Alpha Squad',
    counterpartTeamId: 2,
    counterpartTeamName: 'Beta Force',
    status: state.status === 'none' ? 'proposed' : state.status,
    createdAt: '2026-07-27T00:00:00Z',
    updatedAt: '2026-07-27T00:00:00Z',
  };
}

async function mockLobbyGraphQL(
  page: import('@playwright/test').Page,
  state: TradeState,
  opts: { allowDraftSlotTrading?: boolean } = {},
) {
  let draftOrder = makeDraftOrder([1, 2, 3, 4]);

  await page.route(isGraphQLEndpoint, async (route) => {
    const opName = extractOperationName(route).toLowerCase();

    if (opName === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            league: makeLeague({
              allowDraftSlotTrading: opts.allowDraftSlotTrading ?? true,
            }),
          },
        }),
      });
    } else if (opName.includes('getleagueteams')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (opName.includes('getlivedraftleaguedraft')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getLeagueDraft: {
              __typename: 'Draft',
              id: 1,
              leagueId: 1,
              draftMode: 'live',
              selectionMethod: 'standard',
              draftOrder: 'snake',
              currentPick: 0,
              pickTimeLimitSeconds: 90,
              currentPickDeadline: null,
              draftStartedAt: null,
              draftCompletedAt: null,
              scheduledAt: null,
              createdAt: '2026-07-27T00:00:00Z',
              autoPickDisabled: false,
            },
          },
        }),
      });
    } else if (opName.includes('getdraftteamorder')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getDraftTeamOrder: draftOrder } }),
      });
    } else if (opName.includes('getleaguedraftslottrades')) {
      const trades = state.status === 'none' ? [] : [makeTrade(state)];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueDraftSlotTrades: trades } }),
      });
    } else if (opName.includes('proposedraftslottrade')) {
      const variables = route.request().postDataJSON() as {
        variables?: { leagueId?: number; counterpartTeamId?: number };
      };
      state.proposeCalls.push({
        leagueId: variables.variables?.leagueId ?? 0,
        counterpartTeamId: variables.variables?.counterpartTeamId ?? 0,
      });
      state.status = 'proposed';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { proposeDraftSlotTrade: makeTrade(state) },
        }),
      });
    } else if (opName.includes('approvedraftslottrade')) {
      const variables = route.request().postDataJSON() as {
        variables?: { tradeId?: number };
      };
      state.approveCalls.push(variables.variables?.tradeId ?? 0);
      state.status = 'executed';
      // Approving atomically swaps the two teams' draft slots.
      draftOrder = makeDraftOrder([2, 1, 3, 4]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { approveDraftSlotTrade: makeTrade(state) },
        }),
      });
    } else if (
      opName.includes('getavailabledraftplayers') ||
      opName.includes('getdraftpicks') ||
      opName.includes('getcurrentdraftpick') ||
      opName.includes('autopick') ||
      opName.includes('draftqueue') ||
      opName.includes('getplayerstats') ||
      opName.includes('getbattingstats') ||
      opName.includes('getpitchingstats') ||
      opName.includes('careerbattingstats') ||
      opName.includes('careerpitchingstats')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('Pre-draft lobby — draft slot trading @regression', () => {
  test('commissioner proposes a trade, approves it once accepted, and the draft order updates', async ({
    page,
  }) => {
    const state: TradeState = {
      status: 'none',
      proposeCalls: [],
      approveCalls: [],
    };
    await mockLobbyGraphQL(page, state);

    await page.goto(DRAFT_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('draft-slot-trade-panel')).toBeVisible({
      timeout: 15_000,
    });

    // Draft order starts in default team-id order.
    await expect(page.getByText('Alpha Squad')).toBeVisible();

    // Propose a swap with Beta Force.
    await page.getByTestId('trade-panel-counterpart-select').selectOption('2');
    await page.getByTestId('trade-panel-propose-btn').click();

    await expect.poll(() => state.proposeCalls.length).toBeGreaterThan(0);
    expect(state.proposeCalls[0]).toEqual({
      leagueId: 1,
      counterpartTeamId: 2,
    });
    await expect(page.getByText(/Pending: proposed a swap/i)).toBeVisible();

    // Simulate the counterpart having accepted out-of-band and the
    // commissioner refreshing the lobby.
    state.status = 'accepted';
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('trade-approval-1')).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId('trade-approve-1').click();

    await expect.poll(() => state.approveCalls.length).toBeGreaterThan(0);
    expect(state.approveCalls[0]).toBe(1);

    // The Draft Order list now reflects the executed swap: Beta Force moved
    // ahead of Alpha Squad. The order refetch fires after the mutation
    // resolves, so poll rather than asserting immediately.
    await expect
      .poll(async () => {
        const bodyText = await page.locator('body').innerText();
        return bodyText.indexOf('Beta Force') - bodyText.indexOf('Alpha Squad');
      })
      .toBeLessThan(0);
  });

  test('trade panel is hidden entirely when draft slot trading is disabled', async ({
    page,
  }) => {
    const state: TradeState = {
      status: 'none',
      proposeCalls: [],
      approveCalls: [],
    };
    await mockLobbyGraphQL(page, state, { allowDraftSlotTrading: false });

    await page.goto(DRAFT_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Alpha Squad')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('draft-slot-trade-panel')).not.toBeVisible();
  });
});
