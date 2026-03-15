import { test as base, expect } from './auth-enhanced';

import { startDraftResponse, userLeaguesResponse } from '../mocks/graphql';
import { updateLeagueBrandingResponse } from '../mocks/graphql/league.mocks';

/**
 * Auth fixture for tests that need an authenticated user with league data.
 *
 * Extends auth-enhanced (which has _apiIsolation with shared baseline mocks).
 * This layer adds:
 *   1. OAuth login endpoint mock
 *   2. Authenticated-user overrides (GetUserLeagues returns a league)
 *   3. Mutation mocks for StartDraft and UpdateLeagueBranding
 *
 * For unmocked operations, route.fallback() passes to the _apiIsolation
 * baseline. If the baseline doesn't have the operation either, the test
 * fails with a clear error message.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Mock OAuth login endpoint
    await page.route('**/oauth/login', (route) => {
      void route.fulfill({
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
      (route) => {
        const postData = route.request().postData()?.toLowerCase() ?? '';

        if (postData.includes('getuserleagues')) {
          // Override baseline (which returns empty) → return one league
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(userLeaguesResponse()),
          });
        } else if (postData.includes('startdraft')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(startDraftResponse({ draftStatus: 'queued' })),
          });
        } else if (postData.includes('updateleaguebranding')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(updateLeagueBrandingResponse()),
          });
        } else {
          // Unknown operation → fall through to _apiIsolation baseline
          void route.fallback();
        }
      },
    );

    await use(page);
  },
});

export { expect };
