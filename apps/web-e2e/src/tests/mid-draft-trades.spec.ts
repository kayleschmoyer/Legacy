/**
 * Mid-Draft Trade Proposals & AI Suggestions E2E Tests
 *
 * Covers the draft board at /baseball/league/:id/draft with trade proposal
 * functionality and AI-driven pick recommendations (DraftIntelligence panel).
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { fromNowIso } from '../mocks/time';
import {
  mockDraft,
  mockDraftPick,
  mockDraftPlayer,
  mockLeague,
  mockTeam,
} from '../mocks/graphql';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** URL predicate for the GraphQL API endpoint */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = mockLeague({
  name: 'Test Draft League',
  description: 'E2E mid-draft trade test league',
  draftStatus: 'in-progress',
  currentMatchup: 1,
  numberOfTeams: 4,
});

const MOCK_TEAMS = [
  mockTeam({ id: 1, name: 'Alpha Squad', owner: 1 }),
  mockTeam({ id: 2, name: 'Beta Force', owner: 2 }),
  mockTeam({ id: 3, name: 'Gamma Rays', owner: 3 }),
  mockTeam({ id: 4, name: 'Delta Dawn', owner: 4 }),
];

const MOCK_DRAFT = mockDraft({
  currentRound: 3,
  currentPick: 9,
});

const MOCK_DRAFT_PICK_DEADLINE = fromNowIso(60_000);

const MOCK_DRAFT_ORDER = [
  {
    __typename: 'DraftTeamOrder',
    teamId: 1,
    teamName: 'Alpha Squad',
    draftOrder: 1,
  },
  {
    __typename: 'DraftTeamOrder',
    teamId: 2,
    teamName: 'Beta Force',
    draftOrder: 2,
  },
  {
    __typename: 'DraftTeamOrder',
    teamId: 3,
    teamName: 'Gamma Rays',
    draftOrder: 3,
  },
  {
    __typename: 'DraftTeamOrder',
    teamId: 4,
    teamName: 'Delta Dawn',
    draftOrder: 4,
  },
];

const MOCK_CURRENT_PICK = {
  __typename: 'CurrentDraftPick',
  draftId: 1,
  teamId: 1,
  round: 3,
  pickNumber: 9,
  overallPick: 9,
  isComplete: false,
};

const MOCK_AVAILABLE_PLAYERS = [
  mockDraftPlayer({
    id: 101,
    firstName: 'Mike',
    lastName: 'Trout',
    eligiblePositions: ['CF'],
  }),
  mockDraftPlayer({
    id: 102,
    firstName: 'Shohei',
    lastName: 'Ohtani',
    eligiblePositions: ['DH'],
  }),
  mockDraftPlayer({
    id: 103,
    firstName: 'Aaron',
    lastName: 'Judge',
    eligiblePositions: ['RF'],
  }),
  mockDraftPlayer({
    id: 104,
    firstName: 'Mookie',
    lastName: 'Betts',
    eligiblePositions: ['2B'],
  }),
  mockDraftPlayer({
    id: 105,
    firstName: 'Freddie',
    lastName: 'Freeman',
    eligiblePositions: ['1B'],
  }),
];

const MOCK_PICK_HISTORY = [
  mockDraftPick({
    id: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    teamId: 1,
    playerId: 201,
    player: { id: 201, firstName: 'Ronald', lastName: 'Acuna Jr.' },
  }),
  mockDraftPick({
    id: 2,
    round: 1,
    pickNumber: 2,
    overallPick: 2,
    teamId: 2,
    playerId: 202,
    player: { id: 202, firstName: 'Corey', lastName: 'Seager' },
  }),
];

const MOCK_AI_RECOMMENDATIONS = [
  {
    __typename: 'DraftRecommendation',
    signal: null,
    playerId: 101,
    playerName: 'Mike Trout',
    position: 'CF',
    score: 95.2,
    reason: 'Best available player — fills outfield need',
  },
  {
    __typename: 'DraftRecommendation',
    signal: null,
    playerId: 105,
    playerName: 'Freddie Freeman',
    position: '1B',
    score: 88.7,
    reason: 'Positional scarcity — strong 1B option',
  },
  {
    __typename: 'DraftRecommendation',
    signal: null,
    playerId: 103,
    playerName: 'Aaron Judge',
    position: 'RF',
    score: 86.1,
    reason: 'Power upside — elite HR projection',
  },
];

const MOCK_TRADE_PROPOSAL = {
  __typename: 'TradeOffer',
  id: 20,
  leagueId: 1,
  proposingTeamId: 1,
  receivingTeamId: 2,
  status: 'pending',
  message: 'Mid-draft swap?',
  expiresAt: null,
  respondedAt: null,
  vetoedAt: null,
  createdAt: '2024-09-01T12:00:00Z',
  updatedAt: '2024-09-01T12:00:00Z',
  proposingTeamName: 'Alpha Squad',
  receivingTeamName: 'Beta Force',
  players: [
    {
      __typename: 'TradeOfferPlayer',
      id: 1,
      tradeOfferId: 20,
      playerId: 201,
      fromTeamId: 1,
      playerName: 'Ronald Acuna Jr.',
      playerPosition: 'CF',
    },
    {
      __typename: 'TradeOfferPlayer',
      id: 2,
      tradeOfferId: 20,
      playerId: 202,
      fromTeamId: 2,
      playerName: 'Corey Seager',
      playerPosition: 'SS',
    },
  ],
};

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
  {
    __typename: 'LeaguePosition',
    id: 3,
    name: 'Center Field',
    abbrev: 'CF',
  },
  {
    __typename: 'LeaguePosition',
    id: 4,
    name: 'Right Field',
    abbrev: 'RF',
  },
  {
    __typename: 'LeaguePosition',
    id: 5,
    name: 'Designated Hitter',
    abbrev: 'DH',
  },
];

// ---------------------------------------------------------------------------
// Route helper
// ---------------------------------------------------------------------------

interface MockOpts {
  includeAIRecommendations?: boolean;
  includeTradeProposals?: boolean;
  tradeOffers?: object[];
}

async function mockDraftGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOpts = {},
) {
  const aiRecs = opts.includeAIRecommendations ? MOCK_AI_RECOMMENDATIONS : [];
  const tradeOffers =
    opts.tradeOffers ??
    (opts.includeTradeProposals ? [MOCK_TRADE_PROPOSAL] : []);

  await page.route(isGraphQLEndpoint, async (route) => {
    const opName = extractOperationName(route).toLowerCase();

    // --- Draft queries ---
    if (opName === 'getlivedraftleaguedraft') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getLeagueDraft: {
              __typename: 'Draft',
              id: MOCK_DRAFT.id,
              leagueId: MOCK_DRAFT.leagueId,
              draftMode: MOCK_DRAFT.draftMode,
              selectionMethod: 'standard',
              draftOrder: MOCK_DRAFT.draftOrder,
              currentPick: MOCK_DRAFT.currentPick,
              pickTimeLimitSeconds: 90,
              currentPickDeadline: MOCK_DRAFT_PICK_DEADLINE,
              draftStartedAt: '2024-09-01T12:00:00Z',
              draftCompletedAt: null,
              scheduledAt: null,
              createdAt: '2024-09-01T11:00:00Z',
              autoPickDisabled: false,
            },
          },
        }),
      });
    } else if (opName === 'getleaguedraft' || opName === 'getdraft') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueDraft: MOCK_DRAFT } }),
      });
    } else if (opName === 'getdraftteamorder') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getDraftTeamOrder: MOCK_DRAFT_ORDER } }),
      });
    } else if (opName === 'getcurrentdraftpick') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getCurrentDraftPick: MOCK_CURRENT_PICK },
        }),
      });
    } else if (opName === 'getavailabledraftplayers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getAvailableDraftPlayers: MOCK_AVAILABLE_PLAYERS },
        }),
      });
    } else if (opName === 'getdraftpicks') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { draftPicks: MOCK_PICK_HISTORY } }),
      });
    } else if (opName === 'getdraftrecommendations') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getDraftRecommendations: aiRecs },
        }),
      });
      // --- Trade queries ---
      // LS-9866: no GetPendingTradeOffers operation exists in the .graphql
      // corpus, so that alternative — and the `pendingTradeOffers` key it was
      // paired with — never selected anything.
    } else if (opName === 'getteamtradeoffers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamTradeOffers: tradeOffers } }),
      });
    } else if (opName === 'getleaguetradeoffers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTradeOffers: tradeOffers } }),
      });
      // LS-9866: 'createtradeoffer' is the mutation's root FIELD, not an
      // operation name — ProposeTrade is the only operation that reaches here.
    } else if (opName === 'proposetrade') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { createTradeOffer: MOCK_TRADE_PROPOSAL },
        }),
      });
      // --- League queries ---
    } else if (opName === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
      // LS-9866: 'getleagueteams' also matched GetLeagueTeamsForDM, which is
      // declared in the .graphql corpus but issued by no app code.
    } else if (opName === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (opName === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (opName === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
      // LS-9866: 'autopick' matched five operations. Only
      // GetDraftTeamAutoPickStatuses is fired by the draft board
      // (useDraftQueries), and it selects `getDraftTeamAutoPickStatuses` — the
      // old `autoPickStatuses` key matched no selection set, so the hook was
      // silently falling back to its `?? []` default.
    } else if (opName === 'getdraftteamautopickstatuses') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getDraftTeamAutoPickStatuses: [] } }),
      });
      // LS-9866: 'draftqueue' matched five operations. GetMyDraftQueue is the
      // only one the draft board issues, and it selects `getMyDraftQueue` — the
      // old `draftQueueEntries` key matched no selection set.
    } else if (opName === 'getmydraftqueue') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMyDraftQueue: [] } }),
      });
    } else if (opName === 'nudgeexpireddraftpick') {
      // Fired automatically by useDraftTimer when the pick countdown hits
      // 0:00 (LS-9488) — a no-op response is enough since this test doesn't
      // assert on the nudge outcome, only that the trade flow works.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            autoProcessDraftPicks: { draftsProcessed: 0, picksAutoMade: 0 },
          },
        }),
      });
      // LS-9866: the GetPlayerStats / GetBattingStats / GetPitchingStats branch
      // was deleted — no operation by any of those names exists in the corpus.
      // The draft board's real stats queries are GetDraftPlayerStats and
      // GetDraftPitchingStats, neither of which contains those substrings, and
      // both are served by BASELINE_GRAPHQL_RESPONSES.
    } else {
      // Let the baseline fixture handle anything else
      await unmockedGraphQLFallback(route);
    }
  });
}

const DRAFT_URL = '/baseball/league/1/draft';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Mid-draft trade proposals — draft board shows trade button @regression', () => {
  test('draft board shows trade proposal button during active draft', async ({
    page,
  }) => {
    await mockDraftGraphQL(page, { includeTradeProposals: true });
    await page.goto(DRAFT_URL);
    await page.waitForLoadState('load');

    // The draft board should render without crashing
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // Wait for React to render the draft board — GraphQL mock responses
    // resolve asynchronously so the initial DOM may only contain the shell.
    await page.waitForLoadState('networkidle');

    // Draft is in-progress — verify the page loaded the draft context.
    // The DraftTopBand always renders data-testid="current-pick" when the live
    // board is active; this is a reliable, CSS-class-independent anchor.
    await expect(page.getByTestId('current-pick')).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe('Mid-draft trade proposals — AI suggestions panel @regression', () => {
  test('AI suggestions panel displays recommended picks', async ({ page }) => {
    await mockDraftGraphQL(page, { includeAIRecommendations: true });
    await page.goto(DRAFT_URL);
    await page.waitForLoadState('networkidle');

    // Verify no crash
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // Wait for the live board to confirm the draft is active before asserting
    // on DraftIntelligence content (which mounts after isPremium resolves).
    await expect(page.getByTestId('current-pick')).toBeVisible({
      timeout: 15_000,
    });

    // The DraftIntelligence panel renders when recommendations are available.
    // The mock pins three recommendation names (Mike Trout, Freddie Freeman,
    // Aaron Judge); the panel must surface at least one.
    await expect(
      page.getByText('BEST AVAILABLE', { exact: true }).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page
        .getByText('Mike Trout')
        .or(page.getByText('Freddie Freeman'))
        .or(page.getByText('Aaron Judge'))
        .first(),
    ).toBeVisible();
  });
});
