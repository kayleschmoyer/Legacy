import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import {
  getAvailableDraftPlayersResponse,
  getCurrentDraftPickResponse,
  getDraftPicksResponse,
  leagueByIdResponse,
  leaguePositionsResponse,
  leagueScoringProfileResponse,
  leagueTeamsResponse,
  makeDraftPickResponse,
  mockDraftPlayer,
  userTeamIdResponse,
} from '../mocks/graphql';
import { DraftPage } from '../pages/draft.page';

/**
 * E2E Tests for Draft Selection Workflow
 *
 * Tests the complete draft pick selection flow:
 * 1. User navigates to draft board with an in-progress draft
 * 2. User sees available players and current pick indicator
 * 3. User searches for and selects a player to draft
 * 4. MakeDraftPick mutation fires with correct data
 * 5. UI updates to reflect the pick (history, available players, turn)
 *
 * All tests are hermetic — GraphQL responses are mocked via route.fulfill().
 */

// ── Mock data ──────────────────────────────────────────────────────

const TEST_LEAGUE_ID = 1;

const availablePlayers = [
  mockDraftPlayer({
    id: 100,
    firstName: 'Mike',
    lastName: 'Trout',
    eligiblePositions: ['CF'],
  }),
  mockDraftPlayer({
    id: 101,
    firstName: 'Shohei',
    lastName: 'Ohtani',
    eligiblePositions: ['DH'],
  }),
  mockDraftPlayer({
    id: 102,
    firstName: 'Aaron',
    lastName: 'Judge',
    eligiblePositions: ['RF'],
  }),
  mockDraftPlayer({
    id: 103,
    firstName: 'Mookie',
    lastName: 'Betts',
    eligiblePositions: ['SS'],
  }),
  mockDraftPlayer({
    id: 104,
    firstName: 'Ronald',
    lastName: 'Acuna',
    eligiblePositions: ['RF'],
  }),
];

// ── Helpers ────────────────────────────────────────────────────────

interface GraphQLBody {
  operationName?: string;
  query?: string;
  variables?: Record<string, unknown>;
}

/**
 * Set up hermetic GraphQL route for draft board scenarios.
 * Tracks makeDraftPick mutations for assertions.
 */
async function setupDraftRoute(
  page: import('@playwright/test').Page,
  options: {
    draftStatus?: 'in-progress' | 'completed';
    isMyPick?: boolean;
    availablePlayers?: typeof availablePlayers;
    pickHistory?: Array<{
      id: number;
      round: number;
      pickNumber: number;
      overallPick: number;
      teamId: number;
      playerId: number;
      playerName: string;
    }>;
  } = {},
) {
  const {
    draftStatus = 'in-progress',
    isMyPick = true,
    pickHistory = [],
  } = options;
  const players = options.availablePlayers ?? availablePlayers;

  const capturedMutations: GraphQLBody[] = [];

  await page.route(
    (url) => {
      const s = url.toString();
      return (
        s.includes('/graphql') &&
        !s.includes('/@fs/') &&
        !s.includes('.ts') &&
        !s.includes('.js')
      );
    },
    async (route) => {
      const postData = route.request().postData();
      if (!postData) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: '[E2E] Missing POST body' }],
            data: null,
          }),
        });
        return;
      }

      let body: GraphQLBody;
      try {
        body = JSON.parse(postData) as GraphQLBody;
      } catch {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: '[E2E] Invalid JSON' }],
            data: null,
          }),
        });
        return;
      }

      const op = body.operationName ?? '';

      // Draft queries — use exact operationName matching
      // The live draft board uses GetLiveDraftLeagueDraft which calls
      // the getLeagueDraft resolver — the response data key must be
      // "getLeagueDraft", not "getDraft".
      if (
        op === 'GetDraft' ||
        op === 'GetLiveDraftLeagueDraft' ||
        op === 'GetLeagueDraft'
      ) {
        const draft = {
          __typename: 'Draft',
          id: 1,
          leagueId: TEST_LEAGUE_ID,
          status: draftStatus,
          currentRound: 1,
          currentPick: 1,
          totalRounds: 25,
          draftMode: 'live',
          draftOrder: 'snake',
          selectionMethod: 'standard',
          playerPool: 'all',
          pickTimeLimitSeconds: 60,
          scheduledAt: null,
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getLeagueDraft: draft } }),
        });
        return;
      }

      if (op === 'GetCurrentDraftPick') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            getCurrentDraftPickResponse(
              isMyPick
                ? {
                    teamId: 1,
                    round: 1,
                    pickNumber: 1,
                    overallPick: 1,
                    isComplete: false,
                  }
                : {
                    teamId: 2,
                    round: 1,
                    pickNumber: 2,
                    overallPick: 2,
                    isComplete: false,
                  },
            ),
          ),
        });
        return;
      }

      if (op === 'GetDraftPicks') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            getDraftPicksResponse(
              pickHistory.map((p) => ({
                id: p.id,
                round: p.round,
                pickNumber: p.pickNumber,
                overallPick: p.overallPick,
                teamId: p.teamId,
                playerId: p.playerId,
                player: {
                  id: p.playerId,
                  firstName: p.playerName.split(' ')[0],
                  lastName: p.playerName.split(' ').slice(1).join(' '),
                },
              })),
            ),
          ),
        });
        return;
      }

      if (op === 'GetAvailableDraftPlayers') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(getAvailableDraftPlayersResponse(players)),
        });
        return;
      }

      if (op === 'MakeDraftPick') {
        capturedMutations.push(body);
        const playerId = (body.variables?.playerId as number) ?? 100;
        const player = players.find((p) => p.id === playerId);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makeDraftPickResponse({
              id: pickHistory.length + 1,
              round: 1,
              pickNumber: pickHistory.length + 1,
              overallPick: pickHistory.length + 1,
              teamId: 1,
              playerId,
              player: player
                ? {
                    id: player.id,
                    firstName: player.firstName,
                    lastName: player.lastName,
                  }
                : { id: playerId, firstName: 'Unknown', lastName: 'Player' },
            }),
          ),
        });
        return;
      }

      if (op === 'GetDraftTeamOrder') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              getDraftTeamOrder: [
                { teamId: 1, teamName: 'Team 1', draftOrder: 1 },
                { teamId: 2, teamName: 'Team 2', draftOrder: 2 },
              ],
            },
          }),
        });
        return;
      }

      if (op === 'GetDraftTeamAutoPickStatuses') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getDraftTeamAutoPickStatuses: [] },
          }),
        });
        return;
      }

      if (op === 'GetMyDraftQueue') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMyDraftQueue: [] } }),
        });
        return;
      }

      if (op === 'GetDraftRecommendations') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getDraftRecommendations: [] } }),
        });
        return;
      }

      if (op === 'GetMyDraftTeamAutoPick') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMyDraftTeamAutoPick: false } }),
        });
        return;
      }

      // League queries (needed for page chrome)
      if (op === 'GetLeagueById' || op === 'GetLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(leagueByIdResponse({ draftStatus })),
        });
        return;
      }

      if (op === 'GetLeagueTeams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(leagueTeamsResponse()),
        });
        return;
      }

      if (op === 'GetLeaguePositions') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(leaguePositionsResponse()),
        });
        return;
      }

      if (op === 'GetUserTeamId') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(userTeamIdResponse()),
        });
        return;
      }

      if (op === 'GetLeagueScoringProfile') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(leagueScoringProfileResponse()),
        });
        return;
      }

      if (op === 'GetUserById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              user: {
                __typename: 'User',
                id: 1,
                email: 'test@example.com',
                username: 'testuser',
                name: 'Test User',
                accessLevel: 'none',
              },
            },
          }),
        });
        return;
      }

      if (op === 'GetUserLeagues') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userLeagues: [] } }),
        });
        return;
      }

      if (op === 'GetTeamMembers') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { teamMembers: [] } }),
        });
        return;
      }

      if (op === 'NudgeExpiredDraftPick') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { nudgeExpiredDraftPick: true } }),
        });
        return;
      }

      // Fall through to the baseline _apiIsolation fixture for ambient
      // queries (getUnreadNotificationCount, getUserById, etc.)
      await unmockedGraphQLFallback(route);
    },
  );

  return { capturedMutations };
}

// ── Tests ──────────────────────────────────────────────────────────

test.describe('Draft Selection Workflow @regression', () => {
  test('should display draft board with available players when draft is in-progress', async ({
    page,
  }) => {
    await setupDraftRoute(page);
    const draftPage = new DraftPage(page);

    await draftPage.goto(TEST_LEAGUE_ID);
    await draftPage.expectBoardVisible();

    // Player pool should be visible with available players
    await expect(draftPage.playerPool).toBeVisible({ timeout: 5000 });

    // Current pick indicator should show it's the user's turn
    await expect(draftPage.currentPick).toBeVisible({ timeout: 5000 });
  });

  test('should allow searching for players in the draft pool', async ({
    page,
  }) => {
    await setupDraftRoute(page);
    const draftPage = new DraftPage(page);

    await draftPage.goto(TEST_LEAGUE_ID);
    await draftPage.expectBoardVisible();

    // Search for a specific player
    await draftPage.searchPlayer('Trout');

    // Verify search input has the value
    await expect(draftPage.playerSearch).toHaveValue('Trout');
  });

  test('should send makeDraftPick mutation when drafting a player', async ({
    page,
  }) => {
    const { capturedMutations } = await setupDraftRoute(page, {
      isMyPick: true,
    });
    const draftPage = new DraftPage(page);

    await draftPage.goto(TEST_LEAGUE_ID);
    await draftPage.expectBoardVisible();

    // Use the DraftPage helper to find the draft button
    await expect(draftPage.draftPlayerButton.first()).toBeVisible({
      timeout: 5000,
    });
    await draftPage.draftPlayerButton.first().click();
    await page.waitForTimeout(1000);

    // Verify the makeDraftPick mutation was captured
    const pickMutations = capturedMutations.filter(
      (m) =>
        m.operationName?.toLowerCase().includes('makedraftpick') ||
        m.query?.toLowerCase().includes('makedraftpick'),
    );

    expect(pickMutations.length).toBeGreaterThan(0);
  });

  test("should show correct turn indicator when it is not the user's turn", async ({
    page,
  }) => {
    await setupDraftRoute(page, { isMyPick: false });
    const draftPage = new DraftPage(page);

    await draftPage.goto(TEST_LEAGUE_ID);
    await draftPage.expectBoardVisible();

    // Current pick should be visible but show another team's turn
    await expect(draftPage.currentPick).toBeVisible({ timeout: 5000 });

    // Draft/pick buttons should be disabled or hidden when it's not the user's turn
    const isVisible = await draftPage.draftPlayerButton
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (isVisible) {
      // If visible, should be disabled
      await expect(draftPage.draftPlayerButton.first()).toBeDisabled();
    } else {
      // Button is hidden — that's the expected behavior when it's not the user's turn
      await expect(draftPage.draftPlayerButton.first()).not.toBeVisible();
    }
  });

  test('should display pick history after picks are made', async ({ page }) => {
    // Set up with existing pick history
    await setupDraftRoute(page, {
      pickHistory: [
        {
          id: 1,
          round: 1,
          pickNumber: 1,
          overallPick: 1,
          teamId: 2,
          playerId: 101,
          playerName: 'Shohei Ohtani',
        },
      ],
      isMyPick: true,
    });
    const draftPage = new DraftPage(page);

    await draftPage.goto(TEST_LEAGUE_ID);
    await draftPage.expectBoardVisible();

    // Assert pick history shows the previous pick
    const pickHistoryText = page.getByText('Ohtani').first();
    await expect(pickHistoryText).toBeVisible({ timeout: 5000 });
  });

  test('should handle makeDraftPick error gracefully', async ({ page }) => {
    // Set up base mocks first so the fallback route has something to delegate to
    await setupDraftRoute(page, { isMyPick: true });

    // Override with error route — registered after base route so it takes priority
    await page.route(
      (url) => {
        const s = url.toString();
        return (
          s.includes('/graphql') &&
          !s.includes('/@fs/') &&
          !s.includes('.ts') &&
          !s.includes('.js')
        );
      },
      async (route) => {
        const postData = route.request().postData();
        if (!postData) {
          await unmockedGraphQLFallback(route);
          return;
        }

        const body = JSON.parse(postData) as GraphQLBody;
        const op = body.operationName ?? '';

        if (op === 'MakeDraftPick') {
          // Return error for the pick mutation
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              errors: [{ message: 'Player has already been drafted' }],
              data: null,
            }),
          });
          return;
        }

        // For all other operations, delegate to the base route
        await unmockedGraphQLFallback(route);
      },
    );

    const draftPage = new DraftPage(page);
    await draftPage.goto(TEST_LEAGUE_ID);
    await draftPage.expectBoardVisible();

    // Ensure the draft button is visible before clicking
    await expect(draftPage.draftPlayerButton.first()).toBeVisible({
      timeout: 5000,
    });
    await draftPage.draftPlayerButton.first().click();
    await page.waitForTimeout(2000);

    // Look for error indication — either an alert or the page remains functional
    const errorAlert = page.locator('[role="alert"]').first();
    const hasError = await errorAlert
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (hasError) {
      const errorText = await errorAlert.textContent();
      expect(errorText).toBeTruthy();
    }

    // Regardless of error display style, the draft board should still be functional
    await expect(draftPage.draftBoard).toBeVisible();
  });
});
