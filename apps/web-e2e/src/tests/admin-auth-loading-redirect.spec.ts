/**
 * Admin Auth Loading and Unauthorized Redirect E2E Tests (LS-5313, LS-2105)
 *
 * Covers the auth-gating behavior at /admin:
 *   - Non-admin users are redirected away from /admin
 *   - Unauthenticated users are redirected to the sign-in page at /admin
 *   - Admin users land on the admin page (not redirected)
 *   - A user whose JWT still claims admin but whose server-side access was
 *     revoked sees an access-denied toast before being redirected
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
import { extractOperationName, useTier } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const nonAdminTest = createCustomAuthTest('nonadmin@example.com', 'none');

// A JWT with accessLevel: 'admin' — needed so the route-level `AdminGuard`
// (apps/web/src/app/app.tsx) lets the request through to AdminPage at all.
// AdminGuard checks only the client-side JWT claim and redirects silently
// (no toast) for any non-admin JWT, so it's the *client* JWT's accessLevel,
// not the server's, that decides whether AdminPage ever mounts.
const demotedAdminTest = createCustomAuthTest(
  'demoted-admin@example.com',
  'admin',
);

/**
 * Mocks `GetUserById` to report a server-side `accessLevel` of `'none'` —
 * simulating an admin whose access was revoked after their JWT was issued.
 * AdminGuard's stale JWT still says "admin" and lets them through, but
 * AdminPage's own server-truth check (`useGetUserByIdQuery`) catches the
 * mismatch and shows the access-denied toast before redirecting.
 */
async function mockDemotedAdminGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const opName = extractOperationName(route).toLowerCase();
    if (opName === 'getuserbyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            user: {
              __typename: 'User',
              id: 1,
              email: 'demoted-admin@example.com',
              username: 'demoted-admin',
              name: 'Demoted Admin',
              accessLevel: 'none',
              avatarUrl: null,
              subscriptionTier: 'premium',
              themePreference: null,
            },
          },
        }),
      });
    } else {
      // The JWT's accessLevel is still 'admin', so AdminPage's other
      // admin-only queries (GetUsersCount, GetAllUsers) are unskipped and
      // fire briefly before the server-truth check redirects — fulfill them
      // with empty data so no request escapes to the network.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    }
  });
}

async function mockAdminGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const opName = extractOperationName(route).toLowerCase();
    if (opName === 'admingetusers') {
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
  // Flip the current user to admin via the shared entitlement fixture (LS-8058).
  // Registered after the admin route so its GetUserById handler runs first
  // (Playwright LIFO); every other admin op cascades back to the handler above.
  await useTier(page, 'admin');
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
// Access-denied toast — server-side revoked admin @critical
// ---------------------------------------------------------------------------

demotedAdminTest.describe(
  'Admin /admin — server-revoked admin access @critical',
  () => {
    demotedAdminTest(
      'authenticated user whose server access was revoked sees an access-denied toast before the redirect (LS-2105)',
      async ({ page }) => {
        await mockDemotedAdminGraphQL(page);

        // Race the toast assertion against navigation rather than awaiting
        // `goto` first — the toast renders for only ~2.5s before AdminPage
        // navigates away, so by the time a hard navigation resolves on
        // `load`, it can already have come and gone.
        const navigation = page.goto('/admin');

        const toast = page.getByRole('alert').filter({
          hasText: "You don't have access to admin tools.",
        });
        await expect(toast).toBeVisible({ timeout: 10000 });

        await navigation;
        await expect(page).toHaveURL('/', { timeout: 10000 });
      },
    );
  },
);

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

  unauthTest(
    'unauthenticated user lands on the sign-in page at /admin (LS-2105)',
    async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('load');

      await expect(page).toHaveURL('/admin');
      await expect(page.getByTestId('login-title')).toBeVisible({
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
