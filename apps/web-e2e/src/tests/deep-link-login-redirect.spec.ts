/**
 * Deep Link Preservation & Redirect After Login (LS-2099)
 *
 * EnhancedAuthGuard never navigates the browser when it shows the login gate
 * (see `lib/shared-components/src/features/auth/EnhancedAuthGuard.tsx`) — it
 * swaps in `LoginPage` in place while `window.location.pathname` stays
 * whatever the user originally requested. "Redirect after login" therefore
 * means: the same URL, which showed the login gate a moment ago, renders the
 * originally-requested page's content once `isAuthenticated` flips true — no
 * explicit navigation call to verify, just that the URL never changed and the
 * right content shows up afterward.
 *
 * auth-flows.spec.ts's "Protected Routes" block only proves the login gate
 * *appears* on a deep link; it never completes a login and checks what
 * happens next. This spec closes that gap: navigate straight to a protected,
 * non-root deep link, complete the button-click login flow (reusing the
 * hermetic GSI + /google mocks from login-completion.spec.ts), and assert
 * the browser is still on that deep link showing its real content — not the
 * landing page and not a bounce to `/`.
 *
 * Hermetic — GSI, the /google OAuth exchange, and every GraphQL operation are
 * mocked via `route.fulfill()`; nothing reaches a live backend.
 */

import { type Page } from '@playwright/test';
import { expect, unauthTest } from '../fixtures/auth-enhanced';
import {
  isGraphQLEndpoint,
  unmockedGraphQLFallback,
} from '../mocks/graphql/router';
import { E2EJwtUtil } from '../utils/jwt';

// ---------------------------------------------------------------------------
// GSI mock (button-click authorization code flow) — same mechanism as
// login-completion.spec.ts: initCodeClient().requestCode() immediately fires
// the callback with a fake auth code, simulating the user completing the
// Google consent popup without a real account or network call.
// ---------------------------------------------------------------------------

const GSI_MOCK_WITH_HOOKS = [
  'window.google = { accounts: {',
  '  id: {',
  '    initialize: function() {},',
  '    renderButton: function() {},',
  '    prompt: function() {},',
  '    cancel: function() {},',
  '  },',
  '  oauth2: {',
  '    initCodeClient: function(config) {',
  '      return {',
  '        requestCode: function() {',
  '          if (config.callback) config.callback({ code: "fake-auth-code" });',
  '        },',
  '      };',
  '    },',
  '  },',
  '}};',
].join('\n');

async function routeGsiMock(page: Page): Promise<void> {
  await page.route('**/accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: GSI_MOCK_WITH_HOOKS,
    }),
  );
}

/** Mock the /google OAuth code-exchange endpoint with a successful login. */
async function routeGoogleLoginSuccess(page: Page): Promise<void> {
  const jwt = E2EJwtUtil.generateJwt({ email: 'user@test.com' });

  await page.route('http://localhost:5001/google', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jwt,
        csrfToken: 'e2e-csrf-token',
        user: {
          id: 1,
          email: 'user@test.com',
          username: 'testuser',
          accessLevel: 'none',
        },
      }),
    }),
  );
}

/**
 * The Profile Settings page fires `GetUserById` (and the ambient
 * `MyIdentities` query) once authenticated. Mock the one operation the
 * heading assertion depends on and cascade everything else to the shared
 * baseline fallback (LS-7960) instead of swallowing it with empty data.
 */
async function routeProfileSettingsGraphQL(page: Page): Promise<void> {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as { operationName?: string };

      if (body.operationName === 'GetUserById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              __typename: 'Query',
              user: {
                __typename: 'User',
                id: 1,
                username: 'testuser',
                email: 'user@test.com',
                avatarUrl: null,
                accessLevel: 'none',
                subscriptionTier: null,
                themePreference: null,
              },
            },
          }),
        });
        return;
      }

      await unmockedGraphQLFallback(route);
    },
  );
}

// ---------------------------------------------------------------------------
// Deep link preservation and redirect after login
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Deep link preservation and redirect after login @critical',
  () => {
    unauthTest.beforeEach(async ({ page }) => {
      await routeGsiMock(page);
      await routeProfileSettingsGraphQL(page);
    });

    unauthTest(
      'navigating directly to a protected deep link, then logging in, lands back on that deep link (LS-2099)',
      async ({ page }) => {
        await routeGoogleLoginSuccess(page);

        // Deep link: a protected, non-root route the user attempted directly —
        // not one they navigated to from within the app.
        await page.goto('/profile/settings');
        await page.waitForLoadState('load');

        // Auth guard intercepts: the login gate renders, but the URL is left
        // exactly as the user typed it (no eager bounce to "/" or "/login").
        const loginButton = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(loginButton).toBeVisible({ timeout: 15000 });
        await expect(page).toHaveURL(/\/profile\/settings$/);

        // Complete the login.
        await loginButton.click();
        await expect(loginButton).not.toBeVisible({ timeout: 10000 });

        // Redirected "back" to the originally attempted URL — in this SPA,
        // that means the URL never left /profile/settings and now renders the
        // real page instead of the login gate.
        await expect(page).toHaveURL(/\/profile\/settings$/);
        await expect(
          page.getByRole('heading', { name: 'Profile Settings' }),
        ).toBeVisible({ timeout: 15000 });

        // Confirm it's the actual Profile Settings page, not the marketing
        // landing page that would render at the wrong destination.
        await expect(page.getByText(/claim your dynasty/i)).not.toBeVisible();
      },
    );

    unauthTest(
      'a failed login leaves the user on the originally requested deep link, still showing the login gate',
      async ({ page }) => {
        await page.route('http://localhost:5001/google', (route) =>
          route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({
              message: 'User not authorized for this application',
            }),
          }),
        );

        await page.goto('/profile/settings');
        await page.waitForLoadState('load');

        const loginButton = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(loginButton).toBeVisible({ timeout: 15000 });
        await loginButton.click();

        // Login failed — the deep link must not be lost: still the same URL,
        // still showing the login gate so the user can retry.
        await expect(page.getByText(/access denied/i)).toBeVisible({
          timeout: 10000,
        });
        await expect(page).toHaveURL(/\/profile\/settings$/);
        await expect(loginButton).toBeVisible({ timeout: 5000 });
      },
    );
  },
);
