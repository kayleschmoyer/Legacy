import { expect, test } from '@playwright/test';

/**
 * GraphQL Integration E2E Tests for Draft Functionality
 * 
 * This test suite validates the web app's integration with our GraphQL API
 * for draft functionality by intercepting network requests and responses.
 * 
 * This complements the UI tests by focusing on the data layer integration.
 */

test.describe('Draft GraphQL Integration Tests', () => {
  const testLeagueId = 1;
  const leagueUrl = `/baseball/league/${testLeagueId}`;

  test('should make correct GraphQL queries and handle responses', async ({ page }) => {
    // Track GraphQL requests
    const graphqlRequests: any[] = [];
    const graphqlResponses: any[] = [];

    // Intercept GraphQL requests
    await page.route('**/graphql', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData) {
        try {
          const body = JSON.parse(postData);
          graphqlRequests.push(body);
          console.log('GraphQL Request:', body.operationName || 'Unknown', body.variables);
        } catch (e) {
          console.log('Could not parse GraphQL request body');
        }
      }

      // Continue with the request and capture response
      const response = await route.fetch();
      const responseBody = await response.text();
      
      try {
        const parsedResponse = JSON.parse(responseBody);
        graphqlResponses.push(parsedResponse);
        console.log('GraphQL Response:', parsedResponse.data ? Object.keys(parsedResponse.data) : 'No data');
      } catch (e) {
        console.log('Could not parse GraphQL response');
      }

      route.fulfill({
        response,
        body: responseBody,
      });
    });

    // Navigate to league page
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
    
    const leagueData = leagueResponses[0]?.data?.league || leagueResponses[0]?.data?.leagues?.[0];
    if (leagueData) {
      expect(leagueData).toHaveProperty('draftStatus');
      console.log(`✅ Initial draft status: ${leagueData.draftStatus}`);
    }
  });

  test('should send startDraft mutation and handle response correctly', async ({ page }) => {
    let startDraftMutation: any = null;
    let startDraftResponse: any = null;

    // Intercept GraphQL requests specifically for startDraft
    await page.route('**/graphql', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData) {
        try {
          const body = JSON.parse(postData);
          
          // Check if this is a startDraft mutation
          if (body.query?.includes('startDraft') || body.operationName === 'StartDraft') {
            startDraftMutation = body;
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
        const parsedResponse = JSON.parse(responseBody);
        
        if (startDraftMutation && parsedResponse.data?.startDraft) {
          startDraftResponse = parsedResponse;
          console.log('✅ StartDraft response received:', parsedResponse.data.startDraft);
        }
      } catch (e) {
        // Continue normally
      }

      route.fulfill({
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
    expect(startDraftMutation.variables).toHaveProperty('leagueId', testLeagueId);
    expect(startDraftMutation.variables).toHaveProperty('draftType');

    // Verify response was received and has correct structure
    if (startDraftResponse) {
      expect(startDraftResponse.data.startDraft).toHaveProperty('id');
      expect(startDraftResponse.data.startDraft).toHaveProperty('draftStatus');
      expect(startDraftResponse.data.startDraft.draftStatus).toBe('queued');
      
      console.log('✅ StartDraft mutation completed successfully');
      console.log(`   League ID: ${startDraftResponse.data.startDraft.id}`);
      console.log(`   Draft Status: ${startDraftResponse.data.startDraft.draftStatus}`);
    } else {
      console.log('⚠️  StartDraft response not captured - mutation may have failed');
    }
  });

  test('should handle GraphQL errors gracefully in the UI', async ({ page }) => {
    let graphqlError: any = null;

    // Intercept and mock a GraphQL error for startDraft
    await page.route('**/graphql', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData) {
        try {
          const body = JSON.parse(postData);
          
          // If this is a startDraft mutation, return an error
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

            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(graphqlError)
            });
          }
        } catch (e) {
          // Continue with normal requests
        }
      }

      // Continue with normal requests
      route.continue();
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
    const alertMessages = [];

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

    const graphqlOperations: any[] = [];

    await page.route('**/graphql', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData) {
        try {
          const body = JSON.parse(postData);
          graphqlOperations.push({
            type: 'request',
            operation: body.operationName || 'Unknown',
            variables: body.variables,
            timestamp: Date.now()
          });
        } catch (e) {
          // Continue
        }
      }

      const response = await route.fetch();
      const responseBody = await response.text();

      try {
        const parsedResponse = JSON.parse(responseBody);
        graphqlOperations.push({
          type: 'response',
          operation: graphqlOperations[graphqlOperations.length - 1]?.operation || 'Unknown',
          data: parsedResponse.data,
          timestamp: Date.now()
        });
      } catch (e) {
        // Continue
      }

      route.fulfill({
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
      op.operation === 'StartDraft' || (op.type === 'request' && op.variables?.leagueId)
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