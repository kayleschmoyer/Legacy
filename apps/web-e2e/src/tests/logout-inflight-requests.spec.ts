/**
 * E2E Tests: Logout Behavior With Pending In-Flight GraphQL Requests (LS-2107)
 *
 * `auth-flows.spec.ts` already covers logout by clearing localStorage directly
 * and logout via the profile dropdown UI, but neither scenario has a GraphQL
 * request still in flight at the moment logout happens. This file closes that
 * gap identified by the LS-2081 auth/navigation E2E audit:
 *
 *  - Sign Out clears client auth state synchronously and shows the login gate
 *    immediately, without waiting for a GraphQL query that is still pending.
 *  - Once that held request finally resolves, its data cannot resurrect the
 *    now-logged-out session.
 *  - A proactive JWT refresh already in flight when the user logs out is
 *    guarded by `useAuth.tsx`'s generation counter (`authGenRef`): the
 *    refresh's `AUTH_SUCCESS`/`TOKEN_UPDATED` dispatch is skipped when it
 *    finally resolves after logout, so it cannot re-authenticate the user.
 *  - Logout reliably clears every auth-related localStorage key, even with a
 *    request still outstanding.
 *
 * See `lib/shared-components/src/features/auth/hooks/useAuth.tsx` `logout()`
 * and `scheduleProactiveRefresh()` for the client-side mechanics under test.
 */

import { adminTest, expect, test } from '../fixtures/pages';
import { extractOperationName } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { E2E_SIGNING_SECRET, signE2EJwt } from '../utils/jwt';
import { buildAuthStorageState } from '../fixtures/auth-enhanced';
import { DESKTOP_VIEWPORT } from '../utils/viewport';

/** Read the auth-related localStorage keys `useAuth.tsx`'s `logout()` must clear. */
async function readAuthStorageKeys(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    profile: window.localStorage.getItem('ls_user_profile'),
    expiry: window.localStorage.getItem('ls_token_expiry'),
    csrf: window.localStorage.getItem('ls_csrf_token'),
  }));
}

// ---------------------------------------------------------------------------
// Sign Out while a GraphQL query is still in flight
// ---------------------------------------------------------------------------

adminTest.describe(
  'Sign Out with a pending GraphQL request @regression',
  () => {
    adminTest.use({ viewport: DESKTOP_VIEWPORT });

    adminTest(
      'clicking Sign Out shows the login gate immediately, and the still-pending response cannot resurrect the session (LS-2107)',
      async ({ page, browserName }) => {
        test.skip(
          browserName === 'webkit',
          'WebKit blocks localStorage access in this context',
        );

        // Hold the ambient GetUnreadNotificationCount query (fired by the app
        // shell on every authenticated page load) open until the test
        // explicitly releases it, so it is still in flight when Sign Out
        // is clicked below.
        let releasePendingQuery: (() => void) | undefined;
        const pendingQueryHeld = new Promise<void>((resolve) => {
          releasePendingQuery = resolve;
        });
        let pendingQuerySeen = false;
        let pendingQueryHandledResolve: (() => void) | undefined;
        const pendingQueryHandled = new Promise<void>((resolve) => {
          pendingQueryHandledResolve = resolve;
        });

        await page.route(isGraphQLEndpoint, async (route) => {
          const op = extractOperationName(route).toLowerCase();
          if (op === 'getunreadnotificationcount') {
            pendingQuerySeen = true;
            await pendingQueryHeld;
            await route.fallback();
            pendingQueryHandledResolve?.();
            return;
          }
          await route.fallback();
        });

        await page.goto('/about');
        await page.waitForLoadState('load');

        await expect.poll(() => pendingQuerySeen).toBe(true);

        const profileTrigger = page.getByTestId('user-profile-trigger');
        await expect(profileTrigger).toBeVisible({ timeout: 15000 });
        await profileTrigger.click();

        const signOutButton = page.getByTestId('user-profile-menu-signout');
        await expect(signOutButton).toBeVisible({ timeout: 10000 });
        await signOutButton.click();

        // Client state clears synchronously — the login gate appears without
        // waiting for the notification-count query still held open above.
        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15000 });

        // Every auth-related localStorage key is cleared, even with a
        // request still outstanding.
        expect(await readAuthStorageKeys(page)).toEqual({
          profile: null,
          expiry: null,
          csrf: null,
        });

        // Now let the held request resolve. Its (stale) data must not
        // resurrect the authenticated view.
        releasePendingQuery?.();
        await pendingQueryHandled;

        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible();
        await expect(
          page.getByRole('navigation', { name: 'Primary' }),
        ).not.toBeVisible();
        expect(await readAuthStorageKeys(page)).toEqual({
          profile: null,
          expiry: null,
          csrf: null,
        });
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Sign Out while a proactive JWT refresh is in flight
//
// `scheduleProactiveRefresh` fires a background `/refresh-jwt` call 5 minutes
// before the token's `exp`. A JWT expiring within that window (here, 60s)
// makes the timer fire almost immediately instead of requiring a 5-minute
// real-time wait — the same trick `auth-flows.spec.ts`'s "Proactive Token
// Refresh" suite (LS-2097) uses.
// ---------------------------------------------------------------------------

function signNearExpiryJwt(secondsUntilExpiry: number): string {
  const now = Math.floor(Date.now() / 1000);
  return signE2EJwt(
    {
      id: 1,
      email: 'user@test.com',
      username: 'testuser',
      accessLevel: 'none',
      iat: now - 60,
      exp: now + secondsUntilExpiry,
    },
    E2E_SIGNING_SECRET,
  );
}

const nearExpiryTest = test.extend({
  storageState: async ({}, use) => {
    const jwt = signNearExpiryJwt(60);
    await use(buildAuthStorageState(jwt));
  },
});

nearExpiryTest.describe(
  'Sign Out with a pending proactive JWT refresh @regression',
  () => {
    // The profile dropdown (and its Sign Out item) only renders in the
    // desktop nav — mobile viewports use a different drawer — so pin the
    // viewport here the same way the adminTest suite above does.
    nearExpiryTest.use({ viewport: DESKTOP_VIEWPORT });

    nearExpiryTest(
      'a proactive refresh already in flight when the user logs out cannot re-authenticate the session once it resolves (LS-2107)',
      async ({ page, browserName }) => {
        test.skip(
          browserName === 'webkit',
          'WebKit blocks localStorage access in this context',
        );

        let releaseRefresh: (() => void) | undefined;
        const refreshHeld = new Promise<void>((resolve) => {
          releaseRefresh = resolve;
        });
        let refreshRequested = false;
        let refreshHandledResolve: (() => void) | undefined;
        const refreshHandled = new Promise<void>((resolve) => {
          refreshHandledResolve = resolve;
        });

        await page.route('**/refresh-jwt', async (route) => {
          refreshRequested = true;
          await refreshHeld;
          // Cascade to the hermetic baseline handler (api-isolation.ts),
          // which mints a fresh JWT for the still-valid cookie token — the
          // refresh this test proves logout must not act on once it lands.
          await route.fallback();
          refreshHandledResolve?.();
        });

        await page.goto('/about');
        await page.waitForLoadState('load');

        // The token expires in 60s — inside the 5-minute proactive-refresh
        // window — so the refresh fires almost immediately and is now held
        // mid-flight by the route handler above.
        await expect
          .poll(() => refreshRequested, { timeout: 15000 })
          .toBe(true);

        const profileTrigger = page.getByTestId('user-profile-trigger');
        await expect(profileTrigger).toBeVisible({ timeout: 15000 });
        await profileTrigger.click();

        const signOutButton = page.getByTestId('user-profile-menu-signout');
        await expect(signOutButton).toBeVisible({ timeout: 10000 });
        await signOutButton.click();

        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15000 });
        expect(await readAuthStorageKeys(page)).toEqual({
          profile: null,
          expiry: null,
          csrf: null,
        });

        // Let the held refresh resolve with a freshly-minted, valid JWT. The
        // `authGenRef` generation guard in useAuth.tsx must make the app
        // discard this response's AUTH_SUCCESS/TOKEN_UPDATED dispatch since
        // it started before logout() incremented the generation counter.
        releaseRefresh?.();
        await refreshHandled;

        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible();
        await expect(
          page.getByRole('navigation', { name: 'Primary' }),
        ).not.toBeVisible();
        expect(await readAuthStorageKeys(page)).toEqual({
          profile: null,
          expiry: null,
          csrf: null,
        });
      },
    );
  },
);
