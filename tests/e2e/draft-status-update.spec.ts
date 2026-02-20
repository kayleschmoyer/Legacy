import { test, expect } from '@playwright/test';
import { E2EAuth, E2EJwtUtil } from '../../apps/web-e2e/src/utils/jwt';

/**
 * E2E Test for Draft Status Updates
 *
 * This test verifies that starting a draft correctly updates the league draft status
 * from 'not-started' to 'queued' and that the change persists across GraphQL queries.
 *
 * Uses CLI-generated JWTs for authentication and direct GraphQL API calls.
 */

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT || 'http://localhost:3001/graphql';

// Test timeout extended for database operations
test.setTimeout(60000);

test.describe('Draft Status Update Verification', () => {
  let testLeagueId: number;
  let adminJwt: string;
  let userJwt: string;
  let isGraphQLAvailable = false;

  test.beforeAll(async () => {
    console.log('ðŸ”§ Setting up test authentication...');

    // Generate JWTs for testing
    adminJwt = E2EAuth.generateAdminJwt('1h');
    userJwt = E2EAuth.generateUserJwt('1h');

    console.log('âœ… Generated test JWTs');
    console.log('   Admin JWT:', adminJwt.substring(0, 30) + '...');
    console.log('   User JWT:', userJwt.substring(0, 30) + '...');

    // Check if GraphQL endpoint is available
    try {
      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userJwt}`,
        },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      isGraphQLAvailable = response.ok;
      if (isGraphQLAvailable) {
        console.log('âœ… GraphQL server is available at', GRAPHQL_ENDPOINT);
      } else {
        console.log(
          'âš ï¸  GraphQL server returned non-OK status:',
          response.status,
        );
      }
    } catch (error) {
      console.log('âš ï¸  GraphQL server not available:', GRAPHQL_ENDPOINT);
      console.log(
        '   Error:',
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  /**
   * Helper function to make authenticated GraphQL requests
   */
  async function makeGraphQLRequest(
    query: string,
    variables: any = {},
    jwt: string = userJwt,
  ): Promise<any> {
    console.log(
      `ðŸ“¡ Making GraphQL request with JWT: ${jwt.substring(0, 20)}...`,
    );

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}\n${errorText}`,
      );
    }

    const result = await response.json();

    if (result.errors) {
      console.error('âŒ GraphQL errors:', result.errors);
      throw new Error(`GraphQL error: ${result.errors[0].message}`);
    }

    return result;
  }

  /**
   * Create a test league for draft testing
   */
  async function createTestLeague(): Promise<number> {
    const createLeagueMutation = `
      mutation CreateTestLeague($input: CreateLeagueInput!) {
        createLeague(input: $input) {
          id
          name
          draftStatus
          owner
        }
      }
    `;

    const leagueInput = {
      name: `Test League for Draft ${Date.now()}`,
      maxRosterSize: 25,
    };

    console.log('ðŸŸï¸  Creating test league...');
    const result = await makeGraphQLRequest(
      createLeagueMutation,
      { input: leagueInput },
      adminJwt,
    );

    const league = result.data.createLeague;
    console.log('âœ… Created test league:', league);

    return league.id;
  }

  /**
   * Get league details including draft status
   */
  async function getLeagueDetails(leagueId: number, jwt: string = userJwt) {
    const query = `
      query GetLeague($id: Int!) {
        league(id: $id) {
          id
          name
          draftStatus
          owner
          maxRosterSize
        }
      }
    `;

    console.log(`ðŸ” Fetching league ${leagueId} details...`);
    const result = await makeGraphQLRequest(query, { id: leagueId }, jwt);

    const league = result.data.league;
    console.log(`ðŸ“Š League ${leagueId} status:`, {
      id: league.id,
      name: league.name,
      draftStatus: league.draftStatus,
      owner: league.owner,
    });

    return league;
  }

  /**
   * Add the test user to the league as a member
   */
  async function addUserToLeague(leagueId: number, userId: number = 1) {
    const addMemberMutation = `
      mutation AddLeagueMember($input: CreateLeagueMemberInput!) {
        addLeagueMember(input: $input) {
          leagueId
          userId
          permissionLevel
        }
      }
    `;

    const memberInput = {
      leagueId: leagueId,
      userId: userId,
      permissionLevel: 'commissioner',
    };

    console.log(`ðŸ‘¥ Adding user ${userId} to league ${leagueId}...`);
    const result = await makeGraphQLRequest(
      addMemberMutation,
      { input: memberInput },
      adminJwt,
    );

    console.log('âœ… Added user to league:', result.data.addLeagueMember);
    return result.data.addLeagueMember;
  }

  test('should update league draft status from not-started to queued when starting draft', async () => {
    // SKIP-REASON: GraphQL server must be running for E2E tests
    // TODO: Document how to start GraphQL server in test setup (LS-64)
    if (!isGraphQLAvailable) {
      console.log(
        'âš ï¸  Skipping test - GraphQL server not available:',
        GRAPHQL_ENDPOINT,
      );
      test.skip();
      return;
    }

    console.log('\nðŸš€ TEST: Draft Status Update Verification');
    console.log('=====================================');

    // Step 1: Create a test league
    testLeagueId = await createTestLeague();
    expect(testLeagueId).toBeGreaterThan(0);

    // Step 2: Add user to league so they can start a draft
    await addUserToLeague(testLeagueId, 1);

    // Step 3: Verify initial draft status is 'not-started'
    const initialLeague = await getLeagueDetails(testLeagueId);
    expect(initialLeague.draftStatus).toBe('not-started');
    console.log('âœ… Initial draft status confirmed: not-started');

    // Step 4: Start the draft
    const startDraftMutation = `
      mutation StartDraft($leagueId: Int!, $draftMode: String, $selectionMethod: String, $draftOrder: String) {
        startDraft(leagueId: $leagueId, draftMode: $draftMode, selectionMethod: $selectionMethod, draftOrder: $draftOrder) {
          id
          name
          draftStatus
          owner
        }
      }
    `;

    console.log('ðŸŽ¯ Starting draft...');
    const draftResult = await makeGraphQLRequest(startDraftMutation, {
      leagueId: testLeagueId,
      draftMode: 'automated',
      selectionMethod: 'random',
      draftOrder: 'snake',
    });

    const draftedLeague = draftResult.data.startDraft;
    console.log('ðŸ“Š Draft mutation response:', draftedLeague);

    // Step 5: Verify the mutation response shows updated status
    expect(draftedLeague.id).toBe(testLeagueId);
    expect(draftedLeague.draftStatus).toBe('queued');
    console.log('âœ… Draft mutation returned correct status: queued');

    // Step 6: CRITICAL TEST - Query the league again to verify persistence
    console.log('ðŸ” Verifying draft status persistence...');

    // Add a small delay to ensure any async operations complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const persistedLeague = await getLeagueDetails(testLeagueId);

    // This is the key assertion - the status should persist
    expect(persistedLeague.draftStatus).toBe('queued');
    console.log('âœ… Draft status persisted correctly: queued');

    // Step 7: Additional verification with multiple queries
    console.log('ðŸ”„ Testing multiple consecutive queries...');

    for (let i = 1; i <= 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500)); // Small delay between queries

      const verificationLeague = await getLeagueDetails(testLeagueId);
      expect(verificationLeague.draftStatus).toBe('queued');

      console.log(`   âœ… Query ${i}/3: Draft status still queued`);
    }

    console.log('\nðŸŽ‰ ALL TESTS PASSED!');
    console.log('Draft status update and persistence verified successfully.');
  });

  test('should handle draft start with different user permissions', async () => {
    // SKIP-REASON: GraphQL server must be running for E2E tests
    // TODO: Add environment setup documentation for local GraphQL server (LS-64)
    if (!isGraphQLAvailable) {
      console.log('âš ï¸  Skipping test - GraphQL server not available');
      test.skip();
      return;
    }

    console.log('\nðŸ” TEST: Draft Start Permission Testing');
    console.log('======================================');

    // Create a fresh league for this test
    const permissionTestLeagueId = await createTestLeague();

    // Verify initial status
    const initialLeague = await getLeagueDetails(
      permissionTestLeagueId,
      adminJwt,
    );
    expect(initialLeague.draftStatus).toBe('not-started');

    // Test: Admin should be able to start draft (they're the owner)
    const startDraftMutation = `
      mutation StartDraft($leagueId: Int!, $draftMode: String, $selectionMethod: String, $draftOrder: String) {
        startDraft(leagueId: $leagueId, draftMode: $draftMode, selectionMethod: $selectionMethod, draftOrder: $draftOrder) {
          id
          draftStatus
        }
      }
    `;

    console.log('ðŸ‘‘ Testing admin draft start...');
    const adminDraftResult = await makeGraphQLRequest(
      startDraftMutation,
      {
        leagueId: permissionTestLeagueId,
        draftMode: 'live',
        selectionMethod: 'standard',
        draftOrder: 'snake',
      },
      adminJwt,
    );

    expect(adminDraftResult.data.startDraft.draftStatus).toBe('queued');
    console.log('âœ… Admin successfully started draft');

    // Verify persistence
    const finalLeague = await getLeagueDetails(
      permissionTestLeagueId,
      adminJwt,
    );
    expect(finalLeague.draftStatus).toBe('queued');
    console.log('âœ… Admin draft status change persisted');
  });

  test('should validate draft type parameter', async () => {
    // SKIP-REASON: GraphQL server must be running for E2E tests
    // TODO: Add pre-test validation to check GraphQL availability before running suite (LS-64)
    if (!isGraphQLAvailable) {
      console.log('âš ï¸  Skipping test - GraphQL server not available');
      test.skip();
      return;
    }

    console.log('\nðŸ“‹ TEST: Draft Type Validation');
    console.log('==============================');

    // Create a test league
    const validationTestLeagueId = await createTestLeague();
    await addUserToLeague(validationTestLeagueId, 1);

    const startDraftMutation = `
      mutation StartDraft($leagueId: Int!, $draftMode: String, $selectionMethod: String, $draftOrder: String) {
        startDraft(leagueId: $leagueId, draftMode: $draftMode, selectionMethod: $selectionMethod, draftOrder: $draftOrder) {
          id
          draftStatus
        }
      }
    `;

    // Test valid draft types
    const validSelectionMethods = ['random', 'standard', 'auction'];

    for (const selectionMethod of validSelectionMethods) {
      console.log(`âœ… Testing valid draft type: ${selectionMethod}`);

      // Reset league status (in a real system, you'd have a reset mutation)
      // For this test, we'll just verify the mutation accepts the type

      try {
        const result = await makeGraphQLRequest(startDraftMutation, {
          leagueId: validationTestLeagueId,
          selectionMethod: selectionMethod,
        });

        expect(result.data.startDraft.draftStatus).toBe('queued');
        console.log(`   âœ… ${selectionMethod} accepted and processed`);

        // Only test the first valid type to avoid status conflicts
        break;
      } catch (error) {
        console.error(`   âŒ ${selectionMethod} failed:`, error);
        throw error;
      }
    }

    // Test invalid draft type
    console.log('ðŸš« Testing invalid draft type...');

    try {
      await makeGraphQLRequest(startDraftMutation, {
        leagueId: validationTestLeagueId,
        selectionMethod: 'invalid-selection-method',
      });

      // If we get here, the test should fail
      expect(false).toBe(true); // Force failure
    } catch (error) {
      // This is expected - invalid draft type should be rejected
      console.log('   âœ… Invalid draft type correctly rejected');
      expect(error.message).toContain('Invalid draft type');
    }
  });

  // Cleanup function (optional)
  test.afterAll(async () => {
    console.log('\nðŸ§¹ Cleaning up test data...');

    if (testLeagueId && adminJwt) {
      try {
        // In a real system, you might have a cleanup mutation
        // For now, just log the league ID for manual cleanup if needed
        console.log(
          `ðŸ—‘ï¸  Test league created: ${testLeagueId} (cleanup may be needed)`,
        );
      } catch (error) {
        console.warn('âš ï¸  Could not clean up test league:', error);
      }
    }

    console.log('âœ… Test cleanup completed');
  });
});
