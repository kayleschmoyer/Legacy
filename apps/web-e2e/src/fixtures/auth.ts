import { test as base, expect } from './auth-enhanced';
import { extractOperationName } from './shared-mocks';

import { userLeaguesResponse } from '../mocks/graphql';
import { mockDraft } from '../mocks/graphql/draft.mocks';
import {
  leagueByIdResponse,
  updateLeagueBrandingResponse,
} from '../mocks/graphql/league.mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/**
 * Auth fixture for tests that need an authenticated user with league data.
 *
 * Extends auth-enhanced (which has _apiIsolation with shared baseline mocks).
 * This layer adds:
 *   1. OAuth login endpoint mock
 *   2. Authenticated-user overrides (GetUserLeagues returns a league)
 *   3. Mutation mocks for InitializeDraft and UpdateLeagueBranding
 *   4. Stateful GetLeagueById mock — draftStatus flips to 'queued' after InitializeDraft
 *
 * For unmocked operations, route.fallback() passes to the _apiIsolation
 * baseline. If the baseline doesn't have the operation either, the test
 * fails with a clear error message.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Track draft status so GetLeagueById returns the updated value after
    // the StartDraft mutation is received.
    let draftStatus: 'not-started' | 'queued' | 'in-progress' | 'completed' =
      'not-started';

    // Mock OAuth login endpoint
    await page.route('**/oauth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            id: 1,
            email: 'test@example.com',
            username: 'testuser',
            name: 'Test User',
            accessLevel: 'admin',
          },
          token: 'mock-test-token',
        }),
      });
    });

    // Authenticated-user overrides + mutation mocks.
    // Only handles operations that differ from the _apiIsolation baseline;
    // everything else falls through via route.fallback().
    await page.route(isGraphQLEndpoint, async (route) => {
      // Match on the exact operationName — substring checks on the raw POST
      // body matched siblings like `getUserLeaguesById` /
      // `getUserLeagueSummaries` and routed them through the wrong handler.
      const op = extractOperationName(route).toLowerCase();

      if (op === 'getuserleagues') {
        // Override baseline (which returns empty) → return one league
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(userLeaguesResponse()),
        });
      } else if (op === 'initializedraft') {
        // Flip stateful draftStatus so subsequent GetLeagueById calls
        // return the updated value (critical for persistence tests).
        draftStatus = 'queued';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              initializeDraft: mockDraft({
                status: 'queued',
                leagueId: 1,
              }),
            },
          }),
        });
      } else if (op === 'getleaguebyid') {
        // Return league with current (possibly mutated) draftStatus
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(leagueByIdResponse({ draftStatus })),
        });
      } else if (op === 'updateleaguebranding') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(updateLeagueBrandingResponse()),
        });
      } else {
        // Unknown operation → fall through to _apiIsolation baseline
        await route.fallback();
      }
    });

    await use(page);
  },
});

export { expect };
