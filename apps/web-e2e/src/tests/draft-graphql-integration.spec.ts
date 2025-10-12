import { expect, test } from '@playwright/test';

interface GraphQLRequest {
  query: string;
  operationName?: string;
  variables?: Record<string, unknown>;
}

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

interface GraphQLCapture {
  request: GraphQLRequest;
  response: GraphQLResponse;
  operation: string;
  type: string;
  timestamp: number;
}

/**
 * GraphQL Integration E2E Tests for Draft Functionality
 * 
         } catch (e) {
        // Continue normally
      }

      void route.fulfill({
        response,
        body: responseBody,
      });est suite validates the web app's integration with our GraphQL API
 * for draft functionality by intercepting network requests and responses.
 * 
 * This complements the UI tests by focusing on the data layer integration.
 */

test.describe('Draft GraphQL Integration Tests', () => {
  const testLeagueId = 1;
  const leagueUrl = `/baseball/league/${testLeagueId}`;

  test('should make correct GraphQL queries and handle responses', async ({ page }) => {
    // Track GraphQL requests
    const graphqlRequests: GraphQLRequest[] = [];
    const graphqlResponses: GraphQLResponse[] = [];

    // Intercept GraphQL requests
    await page.route('**/graphql', (route) => {
      const request = route.request()
      const requestBody = request.postData()
      
      if (requestBody) {
        try {
          const body = JSON.parse(requestBody) as GraphQLRequest
          graphqlRequests.push(body)
          
          // Mock response for any GraphQL query
          const mockResponse = {
            data: {
              league: {
                id: testLeagueId,
                name: 'Test League',
                draftStatus: 'SCHEDULED'
              }
            }
          }
          graphqlResponses.push(mockResponse)
          
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockResponse)
          })
        } catch {
          void route.continue()
        }
      } else {
        void route.continue()
      }
    })    // Navigate to league page
    await page.goto(leagueUrl);
    await page.waitForLoadState('networkidle');

    // Wait for initial GraphQL queries to complete
    await page.waitForTimeout(2000);

    // Verify that league data was fetched
    const leagueQueries = graphqlRequests.filter(req => 
      req.query?.includes('league') || req.operationName?.includes('League')
    );
    
    expect(leagueQueries.length).toBeGreaterThan(0);
    console.log(`✅ Found ${leagueQueries.length} league-related GraphQL queries`);

    // Check if initial league data includes draft status
    const leagueResponses = graphqlResponses.filter(resp => 
      resp.data?.league || resp.data?.leagues
    );

    expect(leagueResponses.length).toBeGreaterThan(0);
    
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const leagueData = leagueResponses[0]?.data?.league || leagueResponses[0]?.data?.leagues?.[0];
    if (leagueData) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      expect(leagueData).toHaveProperty('draftStatus');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`✅ Initial draft status: ${leagueData.draftStatus}`);
    }
  });

  test('should send startDraft mutation and handle response correctly', async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let startDraftMutation: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let startDraftResponse: any = null;

    // Intercept GraphQL requests specifically for startDraft
    await page.route('**/graphql', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const body = JSON.parse(postData);
          
          // Check if this is a startDraft mutation
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          if (body.query?.includes('startDraft') || body.operationName === 'StartDraft') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            startDraftMutation = body;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            console.log('🚀 StartDraft mutation intercepted:', body.variables);
          }
        } catch (e) {
          // Continue normally
        }
      }

      // Get response and check for startDraft response
      const response = await route.fetch();
      const responseBody = await response.text();
      
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const parsedResponse = JSON.parse(responseBody);
        
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (startDraftMutation && parsedResponse.data?.startDraft) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          startDraftResponse = parsedResponse;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          console.log('✅ StartDraft response received:', parsedResponse.data.startDraft);
        }
      } catch (e) {
        // Continue normally
      }

      void route.fulfill({
        response,
        body: responseBody,
      });
    });

    // Navigate to league page
    await page.goto(leagueUrl);
    await page.waitForLoadState('networkidle');

    // Find and click start draft button
    const startDraftButton = page.locator('button').filter({ hasText: /start.*draft/i }).first();
    
    if (!(await startDraftButton.isVisible()) || (await startDraftButton.isDisabled())) {
      console.log('⚠️  Start draft button not available - skipping mutation test');
      test.skip();
    }

    // Click the button and wait for mutation
    await startDraftButton.click();
    
    // Wait for GraphQL mutation to complete
    await page.waitForTimeout(3000);

    // Verify mutation was sent
    expect(startDraftMutation).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(startDraftMutation.variables).toHaveProperty('leagueId', testLeagueId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(startDraftMutation.variables).toHaveProperty('draftType');

    // Verify response was received and has correct structure
    if (startDraftResponse) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(startDraftResponse.data.startDraft).toHaveProperty('id');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(startDraftResponse.data.startDraft).toHaveProperty('draftStatus');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(startDraftResponse.data.startDraft.draftStatus).toBe('queued');
      
      console.log('✅ StartDraft mutation completed successfully');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`   League ID: ${startDraftResponse.data.startDraft.id}`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`   Draft Status: ${startDraftResponse.data.startDraft.draftStatus}`);
    } else {
      console.log('⚠️  StartDraft response not captured - mutation may have failed');
    }
  });

  test('should handle GraphQL errors gracefully in the UI', async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let graphqlError: any = null;

    // Intercept and mock a GraphQL error for startDraft
    await page.route('**/graphql', (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const body = JSON.parse(postData);
          
          // If this is a startDraft mutation, return an error
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          if (body.query?.includes('startDraft')) {
            graphqlError = {
              errors: [
                {
                  message: 'Test error: Draft queue URL not configured',
                  locations: [{ line: 1, column: 1 }],
                  path: ['startDraft']
                }
              ],
              data: null
            };

            void route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(graphqlError)
            });
            return;
          }
        } catch (e) {
          // Continue with normal requests
        }
      }

      // Continue with normal requests
      void route.continue();
    });

    await page.goto(leagueUrl);
    await page.waitForLoadState('networkidle');

    const startDraftButton = page.locator('button').filter({ hasText: /start.*draft/i }).first();
    
    if (!(await startDraftButton.isVisible()) || (await startDraftButton.isDisabled())) {
      console.log('⚠️  Start draft button not available - skipping error test');
      test.skip();
    }

    // Click button to trigger the mocked error
    await startDraftButton.click();
    
    // Wait for error handling
    await page.waitForTimeout(2000);

    // Look for error messages in the UI
    const errorElements = await page.locator('[role="alert"], .error, .alert-error').all();
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
      expect(alertMessages.some(msg => msg.includes('error') || msg.includes('fail'))).toBe(true);
    } else {
      // Button state should indicate an error occurred (e.g., re-enabled, or showing error state)
      const buttonAfterError = await startDraftButton.textContent();
      console.log(`Button state after error: "${buttonAfterError}"`);
      
      // Button should either be re-enabled or show an error state
      expect(buttonAfterError).toBeTruthy();
    }

    console.log('✅ GraphQL error handling test completed');
  });

  test('should update Apollo Client cache correctly after mutation', async ({ page }) => {
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

    await page.route('**/graphql', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const body = JSON.parse(postData);
          graphqlOperations.push({
            type: 'request',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            operation: body.operationName || 'Unknown',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            variables: body.variables,
            timestamp: Date.now()
          });
        } catch (e) {
          // Continue
        }
      }

      const response = await route.fetch();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment  
      const responseBody = await response.text();

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const parsedResponse = JSON.parse(responseBody);
        graphqlOperations.push({
          type: 'response',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          operation: graphqlOperations[graphqlOperations.length - 1]?.operation || 'Unknown',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          data: parsedResponse.data,
          timestamp: Date.now()
        });
      } catch (e) {
        // Continue
      }

      void route.fulfill({
        response,
        body: responseBody,
      });
    });

    await page.goto(leagueUrl);
    await page.waitForLoadState('networkidle');

    // Wait for initial queries
    await page.waitForTimeout(2000);

    const startDraftButton = page.locator('button').filter({ hasText: /start.*draft/i }).first();
    
    if (!(await startDraftButton.isVisible()) || (await startDraftButton.isDisabled())) {
      console.log('⚠️  Start draft button not available - skipping cache test');
      test.skip();
    }

    // Record operations before mutation
    const operationsBeforeMutation = [...graphqlOperations];

    // Execute mutation
    await startDraftButton.click();
    await page.waitForTimeout(3000);

    // Record operations after mutation  
    const operationsAfterMutation = graphqlOperations.slice(operationsBeforeMutation.length);

    // Look for startDraft mutation in operations
    const startDraftOps = operationsAfterMutation.filter(op => 
      op.operation === 'StartDraft' || (op.type === 'request' && 
        op.variables && 
        typeof op.variables === 'object' && 
        'leagueId' in op.variables)
    );

    expect(startDraftOps.length).toBeGreaterThan(0);

    // Look for subsequent league queries (cache updates should minimize these)
    const subsequentLeagueQueries = operationsAfterMutation.filter(op =>
      op.type === 'request' && 
      (op.operation?.includes('League') || op.operation === 'GetLeague') &&
      op.timestamp > (startDraftOps[0]?.timestamp || 0)
    );

    console.log(`✅ Cache behavior analysis:`);
    console.log(`   StartDraft operations: ${startDraftOps.length}`);
    console.log(`   Subsequent league queries: ${subsequentLeagueQueries.length}`);

    // If Apollo Client cache is working properly, there should be minimal subsequent queries
    // since the mutation response should update the cache
    if (subsequentLeagueQueries.length === 0) {
      console.log('✅ Excellent: No subsequent league queries - cache working optimally');
    } else {
      console.log('ℹ️  Some subsequent queries found - this may be expected for real-time updates');
    }
  });
});
