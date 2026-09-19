/**
 * E2E Tests: 401/403 Error Responses During an Authenticated Session (LS-2100)
 *
 * Covers gaps identified by the LS-2081 auth/navigation E2E audit:
 *  - A 401 on a GraphQL call mid-session (after the refresh endpoint also
 *    rejects the session) triggers logout and returns the user to the
 *    re-auth gate.
 *  - A 403 / non-admin visit to an admin-only route is blocked — either by
 *    redirect (route-level AdminGuard) or an in-page access-denied message
 *    (page-level check).
 *  - The client-side auth guard reacts to a mid-session auth failure signal
 *    immediately, without requiring a page reload.
 *
 * Distinct from the existing `Session Expiry` suite in auth-flows.spec.ts,
 * which starts a test with an already-expired JWT cookie set *before* the
 * page loads. These tests start from a genuinely authenticated session and
 * force the failure to arrive *during* that session.
 */

import type { Page } from '@playwright/test';
import {
  adminTest,
  createCustomAuthTest,
  expect,
  test,
} from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const unauthorizedGraphQLBody = JSON.stringify({
  errors: [
    {
      message: 'Unauthorized',
      extensions: { code: 'UNAUTHENTICATED' },
    },
  ],
});

/** Force the refresh-jwt endpoint to reject outright — mirrors a
 * definitively-invalidated server-side session (not merely an expired
 * clock), which is what makes the client give up and log out. */
async function rejectRefreshJwt(page: Page) {
  await page.route(
    (url) => url.pathname.endsWith('/refresh-jwt'),
    async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Session expired' }),
      });
    },
  );
}

// ---------------------------------------------------------------------------
// AC1 — 401 during an API call mid-session triggers logout / re-auth
// ---------------------------------------------------------------------------

test.describe('401 during an authenticated API call @regression', () => {
  test('a 401 GraphQL response, with the refresh endpoint also rejecting, logs the user out and shows the re-auth gate', async ({
    page,
  }) => {
    // Confirm the session starts genuinely authenticated.
    await page.goto('/about');
    await page.waitForLoadState('load');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible(
      { timeout: 15000 },
    );

    // From here on, every GraphQL call comes back 401 (session invalidated
    // server-side) and the refresh endpoint refuses to mint a new token —
    // the combination the Apollo error link treats as a definitive
    // rejection, not a transient hiccup.
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: unauthorizedGraphQLBody,
        });
      },
    );
    await rejectRefreshJwt(page);

    // Navigate to a page that fires a GraphQL query while "still logged in".
    await page.goto('/management');
    await page.waitForLoadState('load');

    // The session was cleared client-side and the user is shown the re-auth
    // gate rather than a broken authenticated page.
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/my leagues/i)).not.toBeVisible();
  });

  test('a 401 GraphQL response does NOT log the user out when the refresh endpoint succeeds', async ({
    page,
  }) => {
    // Control case: a transient 401 (e.g. a clock-skew-expired access token)
    // should be silently recovered via the standard refresh-and-retry path
    // rather than forcing a logout — only a rejected refresh should do that.
    await page.goto('/about');
    await page.waitForLoadState('load');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible(
      { timeout: 15000 },
    );

    let firstAttempt = true;
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        if (firstAttempt) {
          firstAttempt = false;
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: unauthorizedGraphQLBody,
          });
          return;
        }
        // Let the retried request fall through to the fixture's baseline mocks.
        await route.fallback();
      },
    );

    // /management fires a GraphQL query (unlike /about, which renders
    // without one) so the 401-then-retry path is actually exercised.
    await page.goto('/management');
    await page.waitForLoadState('load');

    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible(
      { timeout: 15000 },
    );
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// AC2 — 403 / non-admin access to admin-only routes
//
// The route-level redirect case (AdminGuard on /admin, /admin/users) already
// has coverage in admin-console.spec.ts and admin-dashboard.spec.ts. The gap
// this ticket closes is the *other* enforcement style used by /admin/revenue
// and /admin/app-downloads: a page-level accessLevel check that renders an
// in-page access-denied message instead of redirecting (see AdminRevenuePage
// — LS-2100's "should show error or redirect" AC covers both styles).
// ---------------------------------------------------------------------------

const nonAdminTest = createCustomAuthTest('non-admin@test.com', 'none');

nonAdminTest.describe(
  'Admin-only route access for non-admin users @regression',
  () => {
    nonAdminTest(
      'shows an access-denied message to a non-admin user on /admin/revenue',
      async ({ page }) => {
        await page.goto('/admin/revenue');
        await page.waitForLoadState('load');

        // Page-level check: URL does not change, but the restricted content
        // is replaced with an explanatory message rather than rendering the
        // revenue dashboard.
        await expect(page).toHaveURL(/\/admin\/revenue/);
        await expect(page.getByText(/admin access required/i)).toBeVisible({
          timeout: 15000,
        });
      },
    );
  },
);

adminTest.describe(
  'Admin-only route access for admin users @regression',
  () => {
    adminTest(
      'an admin user does not see the access-denied message on /admin/revenue',
      async ({ page }) => {
        await page.route(isGraphQLEndpoint, async (route) => {
          const op = extractOperationName(route).toLowerCase();
          if (op === 'adminrevenuestats') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: {
                  adminRevenueStats: {
                    __typename: 'AdminRevenueStats',
                    totalSubscribers: 0,
                    stripeSubscribers: 0,
                    totalPremiumUsers: 0,
                    totalFreeUsers: 0,
                    totalUsers: 0,
                    conversionRate: 0,
                    newSubscribersThisMonth: 0,
                    mrrCents: 0,
                    arrCents: 0,
                    statusBreakdown: [],
                    subscriberGrowth: [],
                  },
                },
              }),
            });
            return;
          }
          await unmockedGraphQLFallback(route);
        });
        await useTier(page, 'admin');

        await page.goto('/admin/revenue');
        await page.waitForLoadState('load');

        await expect(
          page.getByText(/admin access required/i),
        ).not.toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// AC3 — Auth guard reacts to a mid-session auth failure without a reload
// ---------------------------------------------------------------------------

test.describe('Auth guard mid-session failure handling @regression', () => {
  test('swaps a protected page to the re-auth gate immediately when the session is invalidated mid-session, without a reload', async ({
    page,
  }) => {
    await page.goto('/management');
    await page.waitForLoadState('load');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible(
      { timeout: 15000 },
    );

    // Simulate the server-side rejection signal that the Apollo error link
    // dispatches once silentlyRefreshJwt() gets a definitive 401/403 from
    // the refresh endpoint (apollo-client.ts / jwt-refresh.ts). Dispatching
    // it directly keeps this test hermetic and deterministic while still
    // exercising the real, documented contract between that module and the
    // AuthProvider (useAuth.tsx's `auth:session-expired` listener) — the
    // same mechanism the network-level test above exercises end-to-end.
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    });

    // No navigation/reload — the guard must react to the auth state change
    // reactively and swap the currently-rendered protected page for the
    // re-auth gate in place.
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole('navigation', { name: 'Primary' }),
    ).not.toBeVisible();
  });
});
