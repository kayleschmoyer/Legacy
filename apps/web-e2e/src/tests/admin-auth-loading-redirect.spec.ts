/**
 * Admin Auth Loading and Unauthorized Redirect E2E Tests (LS-5313)
 *
 * Covers the auth-gating behavior at /admin:
 *   - Non-admin users are redirected away from /admin
 *   - Unauthenticated users are redirected away from /admin
 *   - Admin users land on the admin page (not redirected)
 *
 * The auth loading state (spinner while auth.isLoading) is covered by the
 * unit tests in AdminPage.spec.tsx, which can mock the transient isLoading
 * state reliably without race conditions.
 *
 * Platforms: web, mobile-web (same SPA routes)
 */

import {
  adminTest,
  createCustomAuthTest,
  expect,
  unauthTest,
} from '../fixtures/auth-enhanced';
import { extractOperationName } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const nonAdminTest = createCustomAuthTest('nonadmin@example.com', 'none');

async function mockAdminGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const opName = extractOperationName(route).toLowerCase();
    if (opName === 'getuserbyid') {
      // The redesigned AdminPage gates admin access on a server-side
      // GetUserById lookup (serverUserData?.user?.accessLevel). Return the
      // admin identity matching the adminTest JWT so the not-admin redirect
      // does not fire and the admin lands on /admin.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            user: {
              __typename: 'User',
              id: 1,
              email: 'admin@test.com',
              username: 'admin',
              name: 'admin',
              accessLevel: 'admin',
            },
          },
        }),
      });
    } else if (opName === 'admingetusers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { users: [] } }),
      });
    } else {
      // Fulfill all other GraphQL ops with empty data so no request escapes to
      // the network. The _apiIsolation fixture covers ambient queries via its
      // BASELINE_GRAPHQL_RESPONSES layer, but an explicit fulfill here ensures
      // hermeticity regardless of layer ordering.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Unauthorized redirect — non-admin user @critical
// ---------------------------------------------------------------------------

nonAdminTest.describe('Admin /admin — non-admin redirect @critical', () => {
  nonAdminTest(
    'non-admin user is redirected away from /admin',
    async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('load');

      await expect(page).not.toHaveURL(/\/admin/, { timeout: 10000 });
      await expect(page.getByText('Admin Console')).not.toBeVisible();
    },
  );

  nonAdminTest(
    'non-admin user landing on /admin ends up at /',
    async ({ page }) => {
      await page.goto('/admin');

      await expect(page).toHaveURL('/', { timeout: 10000 });
    },
  );
});

// ---------------------------------------------------------------------------
// Unauthorized redirect — unauthenticated user @critical
// ---------------------------------------------------------------------------

unauthTest.describe('Admin /admin — unauthenticated access @critical', () => {
  unauthTest(
    'unauthenticated user does not see admin content at /admin',
    async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('load');

      // EnhancedAuthGuard renders the login page in-place at /admin without
      // changing the URL — assert that admin-specific content is never shown.
      await expect(page.getByText('Admin Console')).not.toBeVisible({
        timeout: 10000,
      });
    },
  );
});

// ---------------------------------------------------------------------------
// Admin user — NOT redirected @smoke
// ---------------------------------------------------------------------------

adminTest.describe('Admin /admin — admin user access @smoke', () => {
  adminTest('admin user is NOT redirected from /admin', async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/admin');
    await expect(page.getByText('Admin Console')).toBeVisible();
  });

  adminTest(
    'admin user sees admin page without unexpected errors',
    async ({ page }) => {
      await mockAdminGraphQL(page);
      await page.goto('/admin');
      await page.waitForLoadState('load');

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    },
  );
});
