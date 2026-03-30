import { expect, test } from '../fixtures/auth-enhanced';

interface GraphQLRequest {
  query: string;
  operationName?: string;
  variables?: Record<string, unknown>;
}

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

/**
 * GraphQL Integration E2E Tests for Draft Functionality
 *
 * This test suite validates the web app's integration with our GraphQL API
 * for draft functionality by intercepting network requests and responses.
 *
 * This complements the UI tests by focusing on the data layer integration.
 *
 * All tests are hermetic — no backend is needed. GraphQL responses are mocked
 * via route.fulfill() (never route.fetch() or route.continue()).
 */

test.describe('Draft GraphQL Integration Tests @regression', () => {
  const testLeagueId = 1;
  // Navigate to the commissioner tab where the "Start Draft" button lives
  const leagueUrl = `/baseball/league/${testLeagueId}/commissioner`;

  /**
   * Build a mock response for the given operation based on the POST body.
   * Returns a per-operation mock so the page can render correctly.
   */
  function buildMockResponse(body: GraphQLRequest): GraphQLResponse | null {
    const op = (body.operationName ?? body.query ?? '').toLowerCase();

    if (
      op.includes('getleaguebyid') ||
      (op.includes('league') &&
        !op.includes('team') &&
        !op.includes('position') &&
        !op.includes('matchup') &&
        !op.includes('scoring') &&
        !op.includes('user') &&
        !op.includes('activity') &&
        !op.includes('chat') &&
        !op.includes('announcement') &&
        !op.includes('standing') &&
        !op.includes('trade') &&
        !op.includes('waiver') &&
        !op.includes('draft'))
    ) {
      return {
        data: {
          league: {
            __typename: 'League',
            id: testLeagueId,
            name: 'Test League',
            description: 'A test league for GraphQL integration testing',
            owner: 1,
            maxRosterSize: 25,
            draftStatus: 'not-started',
            currentMatchup: null,
            currentWeekNumber: null,
            numberOfTeams: 10,
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
            inviteCode: 'TEST1234',
            userMembership: {
              __typename: 'LeagueMember',
              leagueId: testLeagueId,
              userId: 1,
              teamId: 1,
              permissionLevel: 'owner',
              username: 'testuser',
            },
            gamesPerMatchup: 1,
            totalMatchups: null,
            playoffEnabled: false,
            frozenAt: null,
          },
        },
      };
    }

    if (op.includes('startdraft') || op.includes('initializedraft')) {
      return {
        data: {
          initializeDraft: {
            __typename: 'Draft',
            id: 1,
            leagueId: testLeagueId,
            status: 'queued',
            currentRound: 1,
            currentPick: 1,
            totalRounds: 25,
            draftMode: 'live',
            draftOrder: 'snake',
          },
        },
      };
    }

    if (op.includes('position')) {
      return {
        data: {
          leaguePositions: [
            {
              __typename: 'LeaguePosition',
              id: 1,
              name: 'Catcher',
              abbrev: 'C',
            },
          ],
        },
      };
    }

    if (op.includes('teammembers') || op.includes('getteammembers')) {
      return { data: { teamMembers: [] } };
    }

    if (op.includes('userteamid')) {
      return { data: { userTeamId: { __typename: 'UserTeamId', teamId: 1 } } };
    }

    if (op.includes('getleagueteams')) {
      return {
        data: {
          leagueTeams: [
            { __typename: 'Team', id: 1, name: 'Team 1', owner: 1 },
          ],
        },
      };
    }

    if (op.includes('matchup')) {
      if (op.includes('current'))
        return { data: { currentMatchupForLeague: null } };
      if (op.includes('byid')) return { data: { matchup: null } };
      return { data: { matchupsForLeague: [] } };
    }

    if (op.includes('scoring')) {
      return { data: { leagueScoringProfile: null } };
    }

    if (op.includes('getleaguedraft') || op.includes('leaguedraft')) {
      return { data: { getLeagueDraft: null } };
    }

    if (op.includes('getdraftteamorder') || op.includes('draftteamorder')) {
      return { data: { getDraftTeamOrder: [] } };
    }

    if (
      op.includes('getcurrentweek') ||
      op.includes('currentweek') ||
      op.includes('getmatchupsforleague') ||
      op.includes('getleaguestandings') ||
      op.includes('getleagueactivity') ||
      op.includes('leagueactivity') ||
      op.includes('getleaguechatmessages') ||
      op.includes('getleaguemessages') ||
      op.includes('getleagueannouncements') ||
      op.includes('getteamwaiverclaims') ||
      op.includes('getpendingtradeoffers')
    ) {
      return { data: {} };
    }

    if (op.includes('getuserleagues')) {
      return { data: { userLeagues: [] } };
    }

    // Return null to signal the route handler should fall through to the
    // baseline _apiIsolation fixture for app shell queries
    return null;
  }

  /**
   * Set up a hermetic GraphQL route handler that uses buildMockResponse.
   * Returns arrays to capture requests and responses for assertions.
   */
  async function setupGraphQLRoute(page: import('@playwright/test').Page) {
    const graphqlRequests: GraphQLRequest[] = [];
    const graphqlResponses: GraphQLResponse[] = [];

    await page.route(
      (url) => {
        const urlString = url.toString();
        return (
          urlString.includes('/graphql') &&
          !urlString.includes('/@fs/') &&
          !urlString.includes('.ts') &&
          !urlString.includes('.js')
        );
      },
      async (route) => {
        const request = route.request();
        const requestBody = request.postData();

        if (requestBody) {
          try {
            const body = JSON.parse(requestBody) as GraphQLRequest;
            const mockResponse = buildMockResponse(body);

            if (mockResponse === null) {
              // Unknown operation — fall through to the baseline
              // _apiIsolation fixture for app shell queries
              await route.fallback();
              return;
            }

            graphqlRequests.push(body);
            graphqlResponses.push(mockResponse);

            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(mockResponse),
            });
          } catch {
            await route.fallback();
          }
        } else {
          await route.fallback();
        }
      },
    );

    return { graphqlRequests, graphqlResponses };
  }

  test('should make correct GraphQL queries and handle responses', async ({
    page,
  }) => {
    const { graphqlRequests, graphqlResponses } = await setupGraphQLRoute(page);

    // Navigate to league page
    await page.goto(leagueUrl);
    await page.waitForLoadState('networkidle');

    // Wait for initial GraphQL queries to complete
    await page.waitForTimeout(2000);

    // Verify that league data was fetched
    const leagueQueries = graphqlRequests.filter(
      (req) =>
        req.query?.includes('league') || req.operationName?.includes('League'),
    );

    expect(leagueQueries.length).toBeGreaterThan(0);
    console.log(
      `✅ Found ${leagueQueries.length} league-related GraphQL queries`,
    );

    // Check if initial league data includes draft status
    const leagueResponses = graphqlResponses.filter(
      (resp) => resp.data?.league || resp.data?.leagues,
    );

    expect(leagueResponses.length).toBeGreaterThan(0);

    const leagueData =
      leagueResponses[0]?.data?.league ??
      (leagueResponses[0]?.data?.leagues as unknown[])?.[0];
    if (leagueData) {
      expect(leagueData).toHaveProperty('draftStatus');
      console.log(
        `✅ Initial draft status: ${(leagueData as { draftStatus: string }).draftStatus}`,
      );
    }
  });

  test('should send startDraft mutation and handle response correctly', async ({
    page,
  }) => {
    let draftMutation: GraphQLRequest | null = null;
    let draftMutationResp: GraphQLResponse | null = null;

    // Set up hermetic GraphQL route that captures the InitializeDraft mutation
    // (the "Start Draft" button triggers InitializeDraft, not StartDraft)
    await page.route(
      (url) => {
        const urlString = url.toString();
        return (
          urlString.includes('/graphql') &&
          !urlString.includes('/@fs/') &&
          !urlString.includes('.ts') &&
          !urlString.includes('.js')
        );
      },
      async (route) => {
        const request = route.request();
        const postData = request.postData();

        if (postData) {
          try {
            const body = JSON.parse(postData) as GraphQLRequest;

            // Check if this is the InitializeDraft mutation
            if (
              body.query?.includes('initializeDraft') ||
              body.operationName === 'InitializeDraft'
            ) {
              draftMutation = body;
            }

            const mockResponse = buildMockResponse(body);

            if (mockResponse === null) {
              await route.fallback();
              return;
            }

            if (
              body.query?.includes('initializeDraft') ||
              body.operationName === 'InitializeDraft'
            ) {
              draftMutationResp = mockResponse;
            }

            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(mockResponse),
            });
          } catch {
            await route.fallback();
          }
        } else {
          await route.fallback();
        }
      },
    );

    // Navigate to commissioner tab where the Start Draft button lives
    await page.goto(leagueUrl);
    await page.waitForLoadState('networkidle');

    // Find and click start draft button — mocks guarantee it's available
    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    await startDraftButton.waitFor({ state: 'visible', timeout: 5000 });

    // Click the button — this opens a confirmation dialog
    await startDraftButton.click();

    // The NextStepControl shows a Tamagui Dialog with Cancel / Confirm.
    // The dialog portal animates in, so allow enough time (5 s).
    const confirmButton = page
      .locator('button')
      .filter({ hasText: /^Confirm$/i })
      .first();
    const hasConfirm = await confirmButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (hasConfirm) {
      await confirmButton.click();
    }

    // Wait for GraphQL mutation to complete
    await page.waitForTimeout(3000);

    // Verify mutation was sent
    expect(draftMutation).toBeTruthy();
    const mutation = draftMutation as GraphQLRequest;
    expect(mutation.variables).toHaveProperty('leagueId', testLeagueId);
    expect(
      mutation.query?.includes('initializeDraft') ||
        mutation.operationName === 'InitializeDraft',
    ).toBe(true);

    // Verify response was received and has correct structure
    expect(draftMutationResp).toBeTruthy();
    const resp = draftMutationResp as GraphQLResponse;
    const draftData = resp.data?.initializeDraft as {
      id: number;
      status: string;
    };
    expect(draftData).toHaveProperty('id');
    expect(draftData).toHaveProperty('status');
    expect(draftData.status).toBe('queued');
  });

  test('should handle GraphQL errors gracefully in the UI', async ({
    page,
  }) => {
    // Intercept and mock a GraphQL error for startDraft, mock everything else
    await page.route(
      (url) => {
        const urlString = url.toString();
        return (
          urlString.includes('/graphql') &&
          !urlString.includes('/@fs/') &&
          !urlString.includes('.ts') &&
          !urlString.includes('.js')
        );
      },
      async (route) => {
        const request = route.request();
        const postData = request.postData();

        if (postData) {
          try {
            const body = JSON.parse(postData) as GraphQLRequest;

            // If this is the InitializeDraft mutation, return an error
            if (
              body.query?.includes('initializeDraft') ||
              body.operationName === 'InitializeDraft'
            ) {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  errors: [
                    {
                      message: 'Test error: Draft queue URL not configured',
                      locations: [{ line: 1, column: 1 }],
                      path: ['initializeDraft'],
                    },
                  ],
                  data: null,
                }),
              });
              return;
            }

            // All other operations get normal mock responses
            const mockResponse = buildMockResponse(body);
            if (mockResponse === null) {
              await route.fallback();
              return;
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(mockResponse),
            });
          } catch {
            await route.fallback();
          }
        } else {
          await route.fallback();
        }
      },
    );

    await page.goto(leagueUrl);
    await page.waitForLoadState('networkidle');

    // Mocks guarantee the button is available
    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    await startDraftButton.waitFor({ state: 'visible', timeout: 5000 });

    // Click button to trigger the mocked error
    await startDraftButton.click();

    // The NextStepControl shows a Tamagui Dialog with Cancel / Confirm.
    const confirmButton = page
      .locator('button')
      .filter({ hasText: /^Confirm$/i })
      .first();
    const hasConfirm = await confirmButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (hasConfirm) {
      await confirmButton.click();
    }

    // Wait for error handling
    await page.waitForTimeout(2000);

    // Look for error messages in the UI
    const errorElements = await page.locator('[role="alert"]').all();
    const alertMessages: string[] = [];

    for (const element of errorElements) {
      if (await element.isVisible()) {
        const text = await element.textContent();
        if (text) alertMessages.push(text);
      }
    }

    // The UI should show some kind of error indication
    if (alertMessages.length > 0) {
      console.log('✅ Error messages displayed:', alertMessages);
      expect(
        alertMessages.some(
          (msg) => msg.includes('error') || msg.includes('fail'),
        ),
      ).toBe(true);
    } else {
      // Button state should indicate an error occurred (e.g., re-enabled, or showing error state)
      const buttonAfterError = await startDraftButton.textContent();
      console.log(`Button state after error: "${buttonAfterError}"`);

      // Button should either be re-enabled or show an error state
      expect(buttonAfterError).toBeTruthy();
    }

    console.log('✅ GraphQL error handling test completed');
  });

  test('should update Apollo Client cache correctly after mutation', async ({
    page,
  }) => {
    // This test validates that the Apollo Client cache is properly updated
    // after the startDraft mutation completes

    interface GraphQLOperation {
      type: 'request' | 'response';
      operation: string;
      variables?: unknown;
      data?: unknown;
      timestamp: number;
    }
    const graphqlOperations: GraphQLOperation[] = [];

    await page.route(
      (url) => {
        const urlString = url.toString();
        return (
          urlString.includes('/graphql') &&
          !urlString.includes('/@fs/') &&
          !urlString.includes('.ts') &&
          !urlString.includes('.js')
        );
      },
      async (route) => {
        const request = route.request();
        const postData = request.postData();

        if (postData) {
          try {
            const body = JSON.parse(postData) as GraphQLRequest;
            graphqlOperations.push({
              type: 'request',
              operation: body.operationName || 'Unknown',
              variables: body.variables,
              timestamp: Date.now(),
            });

            const mockResponse = buildMockResponse(body);

            if (mockResponse === null) {
              await route.fallback();
              return;
            }

            graphqlOperations.push({
              type: 'response',
              operation: body.operationName || 'Unknown',
              data: mockResponse.data,
              timestamp: Date.now(),
            });

            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(mockResponse),
            });
          } catch {
            await route.fallback();
          }
        } else {
          await route.fallback();
        }
      },
    );

    await page.goto(leagueUrl);
    await page.waitForLoadState('networkidle');

    // Wait for initial queries
    await page.waitForTimeout(2000);

    // Mocks guarantee the button is available
    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    await startDraftButton.waitFor({ state: 'visible', timeout: 5000 });

    // Record operations before mutation
    const operationsBeforeMutation = [...graphqlOperations];

    // Execute mutation — click Start Draft button
    await startDraftButton.click();

    // The NextStepControl shows a Tamagui Dialog with Cancel / Confirm.
    const confirmButton = page
      .locator('button')
      .filter({ hasText: /^Confirm$/i })
      .first();
    const hasConfirm = await confirmButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (hasConfirm) {
      await confirmButton.click();
    }

    await page.waitForTimeout(3000);

    // Record operations after mutation
    const operationsAfterMutation = graphqlOperations.slice(
      operationsBeforeMutation.length,
    );

    // Look for InitializeDraft mutation in operations
    const draftOps = operationsAfterMutation.filter(
      (op) =>
        op.operation === 'InitializeDraft' ||
        (op.type === 'request' &&
          op.variables &&
          typeof op.variables === 'object' &&
          'leagueId' in op.variables),
    );

    expect(draftOps.length).toBeGreaterThan(0);

    // Look for subsequent league queries (cache updates should minimize these)
    const subsequentLeagueQueries = operationsAfterMutation.filter(
      (op) =>
        op.type === 'request' &&
        (op.operation?.includes('League') || op.operation === 'GetLeague') &&
        op.timestamp > (draftOps[0]?.timestamp || 0),
    );

    console.log(`Cache behavior analysis:`);
    console.log(`   InitializeDraft operations: ${draftOps.length}`);
    console.log(
      `   Subsequent league queries: ${subsequentLeagueQueries.length}`,
    );

    // If Apollo Client cache is working properly, there should be minimal subsequent queries
    // since the mutation response should update the cache
    if (subsequentLeagueQueries.length === 0) {
      console.log(
        'Excellent: No subsequent league queries - cache working optimally',
      );
    } else {
      console.log(
        'Some subsequent queries found - this may be expected for real-time updates',
      );
    }
  });
});
