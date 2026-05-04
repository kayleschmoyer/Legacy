/**
 * Trade Block Management — E2E Tests (LS-610)
 *
 * Covers LeagueTradeBlock on the League Trades tab:
 *   /baseball/league/:id/trades
 *
 * (LS-4171: V2 moved Trade Block from the league overview to the dedicated
 * Trades tab — see apps/web/src/pages/baseball/league-detail-v2/tabs/Trades.tsx.)
 *
 *   - "Trade Block" heading is displayed
 *   - Empty state: "No players on the trade block"
 *   - Players listed when trade block has entries
 *   - Count badge shows correct number of available players
 *   - "AVAILABLE" badge on other teams' players
 *   - "Remove" button on user's own team players
 *   - "Show more" button when more than 5 players
 *   - Error state when query fails
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Test League',
    description: 'E2E trade block test league',
    owner: 1,
    maxRosterSize: 25,
    draftStatus: 'completed',
    currentMatchup: null,
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
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
    secondaryColor: null,
    inviteCode: 'TRADE999',
    userMembership: { teamId: 1 },
    minCareerGames: 50,
    minCareerSeasons: 3,
    waiverType: 'standard',
    gamesPerMatchup: 5,
    spStartsPerMatchup: 1,
    totalMatchups: 10,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    frozenAt: null,
    lmNote: null,
    ...overrides,
  };
}

function makeTradeBlockEntry(
  id: number,
  teamId: number,
  firstName: string,
  lastName: string,
  askingPrice: string | null = null,
) {
  return {
    __typename: 'TeamMember',
    id,
    teamId,
    playerId: id * 100,
    onTradeBlock: true,
    askingPrice,
    player: {
      __typename: 'Player',
      firstName,
      lastName,
    },
  };
}

const MOCK_TRADE_BLOCK_EMPTY: never[] = [];

const MOCK_TRADE_BLOCK_WITH_PLAYERS = [
  makeTradeBlockEntry(1, 1, 'Mike', 'Johnson', '2nd round pick'), // user's team (teamId=1)
  makeTradeBlockEntry(2, 2, 'Chris', 'Davis', 'Top 10 pitcher'), // other team with price
  makeTradeBlockEntry(3, 2, 'Jake', 'Smith'), // other team, no price
];

const MOCK_TRADE_BLOCK_MANY = [
  makeTradeBlockEntry(1, 1, 'Mike', 'Johnson'),
  makeTradeBlockEntry(2, 2, 'Chris', 'Davis'),
  makeTradeBlockEntry(3, 2, 'Jake', 'Smith'),
  makeTradeBlockEntry(4, 3, 'Tom', 'Wilson'),
  makeTradeBlockEntry(5, 3, 'Brad', 'Evans'),
  makeTradeBlockEntry(6, 4, 'Ryan', 'Brown'), // 6th — should trigger "Show more"
];

// ── GraphQL Mock Setup ────────────────────────────────────────────────────────

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: {
    league?: ReturnType<typeof makeLeague>;
    tradeBlock?: ReturnType<typeof makeTradeBlockEntry>[];
    tradeBlockError?: boolean;
    onSetTradeBlock?: () => unknown;
  } = {},
) {
  const {
    league = makeLeague(),
    tradeBlock = MOCK_TRADE_BLOCK_EMPTY,
    tradeBlockError = false,
    onSetTradeBlock,
  } = opts;

  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as { operationName?: string };
      const op = body.operationName ?? '';

      if (op === 'GetLeagueById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league } }),
        });
        return;
      }
      if (op === 'GetLeagueTradeBlock') {
        if (tradeBlockError) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: null,
              errors: [{ message: 'Failed to load trade block' }],
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTradeBlock: tradeBlock } }),
        });
        return;
      }
      if (op === 'SetTradeBlock') {
        const result = onSetTradeBlock?.() ?? { success: true };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { setTradeBlock: result } }),
        });
        return;
      }
      if (op === 'GetLeagueTeams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: [] } }),
        });
        return;
      }
      if (op === 'GetPositionsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leaguePositions: [] } }),
        });
        return;
      }
      if (op === 'GetUserTeamId') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
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

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Trade Block Management @regression', () => {
  test('should display Trade Block heading', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/trades');

    // V2 wraps LeagueTradeBlock in a <Section title="Trade Block">, which
    // renders an <h3>; the inner LeagueTradeBlock card also renders the text
    // "Trade Block". Target the section heading specifically.
    await expect(
      page.getByRole('heading', { name: 'Trade Block', exact: true }),
    ).toBeVisible();
  });

  test('should show empty state when no players on trade block', async ({
    page,
  }) => {
    await setupGraphQL(page, { tradeBlock: MOCK_TRADE_BLOCK_EMPTY });
    await page.goto('/baseball/league/1/trades');

    await expect(page.getByText('No players on the trade block')).toBeVisible();
    await expect(
      page.getByText('Use the roster page to list players for trade.'),
    ).toBeVisible();
  });

  test('should list players when trade block has entries', async ({ page }) => {
    await setupGraphQL(page, {
      tradeBlock: MOCK_TRADE_BLOCK_WITH_PLAYERS,
    });
    await page.goto('/baseball/league/1/trades');

    await expect(page.getByText('Mike Johnson')).toBeVisible();
    await expect(page.getByText('Chris Davis')).toBeVisible();
    await expect(page.getByText('Jake Smith')).toBeVisible();
  });

  test('should display count badge with number of available players', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      tradeBlock: MOCK_TRADE_BLOCK_WITH_PLAYERS,
    });
    await page.goto('/baseball/league/1/trades');

    await expect(page.getByText('3 available')).toBeVisible();
  });

  test('should display AVAILABLE badge for other teams players', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      tradeBlock: MOCK_TRADE_BLOCK_WITH_PLAYERS,
    });
    await page.goto('/baseball/league/1/trades');

    const availableBadges = page.getByText('AVAILABLE');
    await expect(availableBadges.first()).toBeVisible();
  });

  test('should display Remove button for user own team players', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      tradeBlock: MOCK_TRADE_BLOCK_WITH_PLAYERS,
    });
    await page.goto('/baseball/league/1/trades');

    // Mike Johnson is on teamId=1 (user's team), should have Remove button
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();
  });

  test('should show Show more button when more than 5 players', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      tradeBlock: MOCK_TRADE_BLOCK_MANY,
    });
    await page.goto('/baseball/league/1/trades');

    await expect(
      page.getByRole('button', { name: /show.*more/i }),
    ).toBeVisible();
  });

  test('should expand list when Show more is clicked', async ({ page }) => {
    await setupGraphQL(page, {
      tradeBlock: MOCK_TRADE_BLOCK_MANY,
    });
    await page.goto('/baseball/league/1/trades');

    // 6th player should not be visible before expansion
    await expect(page.getByText('Ryan Brown')).not.toBeVisible();

    // Click show more
    await page.getByRole('button', { name: /show.*more/i }).click();

    // Now 6th player should be visible
    await expect(page.getByText('Ryan Brown')).toBeVisible();
  });

  test('should display asking price when set', async ({ page }) => {
    await setupGraphQL(page, {
      tradeBlock: MOCK_TRADE_BLOCK_WITH_PLAYERS,
    });
    await page.goto('/baseball/league/1/trades');

    await expect(page.getByText('Asking: 2nd round pick')).toBeVisible();
    await expect(page.getByText('Asking: Top 10 pitcher')).toBeVisible();
  });

  test('should show Set Price button for own team players', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      tradeBlock: [makeTradeBlockEntry(1, 1, 'Mike', 'Johnson')],
    });
    await page.goto('/baseball/league/1/trades');

    await expect(page.getByRole('button', { name: 'Set Price' })).toBeVisible();
  });

  test('should show Edit Price button when price is already set', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      tradeBlock: MOCK_TRADE_BLOCK_WITH_PLAYERS,
    });
    await page.goto('/baseball/league/1/trades');

    // Mike Johnson (own team) has an asking price, so button should say "Edit Price"
    await expect(
      page.getByRole('button', { name: 'Edit Price' }),
    ).toBeVisible();
  });

  test('should send askingPrice when user sets a price via Set Price flow', async ({
    page,
  }) => {
    // Start with an own-team player that has no price
    const ownPlayer = makeTradeBlockEntry(1, 1, 'Mike', 'Johnson');

    // Track mutation calls
    const mutationCalls: Record<string, unknown>[] = [];

    await setupGraphQL(page, {
      tradeBlock: [ownPlayer],
      onSetTradeBlock: () => {
        return {
          __typename: 'TeamMember',
          ...ownPlayer,
          askingPrice: '1st round pick',
        };
      },
    });

    // Additionally intercept to capture variables
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route, request) => {
        const body = request.postDataJSON() as {
          operationName?: string;
          variables?: Record<string, unknown>;
        };
        if (body.operationName === 'SetTradeBlock') {
          mutationCalls.push(body.variables ?? {});
        }
        await route.fallback();
      },
    );

    await page.goto('/baseball/league/1/trades');

    // Click "Set Price" button
    await page.getByRole('button', { name: 'Set Price' }).click();

    // Fill in the asking price input
    const priceInput = page.getByRole('textbox');
    await priceInput.fill('1st round pick');

    // Click Save
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify the mutation was called with askingPrice
    expect(mutationCalls.length).toBeGreaterThanOrEqual(1);
    const lastCall = mutationCalls[mutationCalls.length - 1];
    expect(lastCall).toMatchObject({
      teamMemberId: 1,
      onTradeBlock: true,
      askingPrice: '1st round pick',
    });
  });

  test('should display error state when query fails', async ({ page }) => {
    await setupGraphQL(page, { tradeBlockError: true });
    await page.goto('/baseball/league/1/trades');

    await expect(page.getByText('Failed to load trade block.')).toBeVisible();
  });
});
