/**
 * Authentication Flow E2E Tests
 *
 * Covers: login page display, protected route enforcement, session expiry,
 * and logout — both programmatic and via the profile dropdown UI.
 */

import { adminTest, expect, test, unauthTest } from '../fixtures/auth-enhanced';
import { E2E_SIGNING_SECRET, signE2EJwt } from '../utils/jwt';

/** Read the base URL that Playwright is actually using (set in playwright.config.ts). */
const E2E_ORIGIN = `http://localhost:${process.env.E2E_PORT || 4280}`;

/** Create a JWT whose `exp` is already in the past (expired 1 hour ago). */
function signExpiredJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  return signE2EJwt(
    {
      id: 1,
      email: 'user@test.com',
      username: 'testuser',
      accessLevel: 'none',
      iat: now - 7200, // issued 2 hours ago
      exp: now - 3600, // expired 1 hour ago
    },
    E2E_SIGNING_SECRET,
  );
}

/** Custom fixture that loads an expired JWT into cookies + stale profile. */
const expiredSessionTest = test.extend({
  storageState: async ({}, use) => {
    const jwt = signExpiredJwt();
    const expiry = Math.floor(Date.now() / 1000) - 3600; // already expired
    await use({
      cookies: [
        {
          name: 'ls_jwt',
          value: jwt,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const,
          expires: -1, // expired
        },
        {
          name: 'ls_csrf',
          value: 'e2e-csrf-token',
          domain: 'localhost',
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax' as const,
          expires: -1,
        },
      ],
      origins: [
        {
          origin: E2E_ORIGIN,
          localStorage: [
            {
              name: 'ls_user_profile',
              value: JSON.stringify({
                id: 1,
                email: 'expired@test.com',
                username: 'expired',
                accessLevel: 'none',
              }),
            },
            { name: 'ls_token_expiry', value: String(expiry) },
          ],
        },
      ],
    });
  },
});

// ---------------------------------------------------------------------------
// Login Flow — unauthenticated user sees the login gate
// ---------------------------------------------------------------------------

unauthTest.describe('Login Flow @critical', () => {
  unauthTest(
    'shows the Continue with Google button when not authenticated',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  unauthTest('displays the landing page headline', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(page.getByText(/build your dynasty/i)).toBeVisible({
      timeout: 15000,
    });
  });

  unauthTest(
    'does not render the app navigation when unauthenticated',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      // The main nav links should not be present — the auth guard replaces
      // the entire app with the landing page.
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).not.toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// Protected Routes — all app routes require authentication
// ---------------------------------------------------------------------------

unauthTest.describe('Protected Routes @critical', () => {
  const routes = [
    '/',
    '/baseball',
    '/players',
    '/players/stats',
    '/management',
    '/profile/settings',
    '/preferences',
    '/help',
  ];

  for (const route of routes) {
    unauthTest(
      `shows landing page on ${route} when not authenticated`,
      async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15000 });
      },
    );
  }
});

// ---------------------------------------------------------------------------
// Public Routes — accessible without authentication (LS-3566, LS-3563, LS-3561)
// ---------------------------------------------------------------------------

unauthTest.describe('Public Routes @critical', () => {
  unauthTest(
    'shows About page content on /about when not authenticated',
    async ({ page }) => {
      await page.goto('/about');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('heading', { name: /about legacy sports/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  unauthTest(
    'shows Scoreboard page content on /scoreboard when not authenticated',
    async ({ page }) => {
      await page.goto('/scoreboard');
      await page.waitForLoadState('load');

      await expect(page.getByTestId('scoreboard-heading')).toBeVisible({
        timeout: 15000,
      });
    },
  );

  unauthTest(
    'shows Pricing page content on /pricing when not authenticated',
    async ({ page }) => {
      await page.goto('/pricing');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('heading', { name: /the plan that fits/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  unauthTest(
    'redirects /faq to /pricing for unauthenticated users (LS-3557)',
    async ({ page }) => {
      await page.goto('/faq');
      await page.waitForLoadState('load');

      await expect(page).toHaveURL(/\/pricing/);
      await expect(
        page.getByRole('heading', { name: /the plan that fits/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );
});

// ---------------------------------------------------------------------------
// Authenticated Access — authenticated user bypasses the login gate
// ---------------------------------------------------------------------------

test.describe('Authenticated Access @critical', () => {
  test('does not show the landing page for an authenticated user', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).not.toBeVisible();
  });

  test('renders the primary navigation for an authenticated user', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible(
      { timeout: 15000 },
    );
  });

  test('authenticated user can navigate between protected routes', async ({
    page,
  }) => {
    const routes = ['/about', '/baseball', '/players/stats'];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).not.toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Session Expiry — expired JWT triggers the login gate
// ---------------------------------------------------------------------------

expiredSessionTest.describe('Session Expiry @critical', () => {
  expiredSessionTest(
    'shows landing page when the stored JWT has expired',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  expiredSessionTest(
    'shows landing page on a protected route with an expired JWT',
    async ({ page }) => {
      await page.goto('/baseball');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  expiredSessionTest(
    'does not show authenticated app content with an expired JWT',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      // The primary nav should not be present — auth guard shows landing page.
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).not.toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// Logout Flow — clearing the auth token returns to the login gate
// ---------------------------------------------------------------------------

test.describe('Logout Flow @regression', () => {
  test('clearing the JWT from localStorage triggers re-authentication', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit blocks localStorage access via page.evaluate — SecurityError',
    );

    await page.goto('/');
    await page.waitForLoadState('load');

    // Confirm we are authenticated.
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).not.toBeVisible();

    // Simulate logout by clearing auth state from localStorage and cookies.
    await page.evaluate(() => {
      window.localStorage.removeItem('ls_user_profile');
      window.localStorage.removeItem('ls_token_expiry');
      document.cookie = 'ls_csrf=; Max-Age=0; Path=/';
    });

    await page.reload();
    await page.waitForLoadState('load');

    // The auth guard should now show the landing page.
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// Logout via Profile Dropdown UI — using adminTest for deterministic username
// ---------------------------------------------------------------------------

adminTest.describe('Profile Dropdown Logout @regression', () => {
  adminTest('profile dropdown contains a Sign Out option', async ({ page }) => {
    // Navigate to a stable authenticated page.
    await page.goto('/about');
    await page.waitForLoadState('load');

    // The profile button shows the username "admin" on desktop viewports.
    const profileButton = page
      .getByRole('banner')
      .getByRole('button')
      .filter({ hasText: /admin/i });

    await expect(profileButton).toBeVisible({ timeout: 15000 });
    await profileButton.click();

    // The Sign Out menu item should now be visible inside the dropdown.
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({
      timeout: 10000,
    });
  });

  adminTest(
    'clicking Sign Out returns user to the login gate',
    async ({ page, browserName }) => {
      test.skip(
        browserName === 'webkit',
        'WebKit blocks localStorage access in this context',
      );

      await page.goto('/about');
      await page.waitForLoadState('load');

      // Open the profile dropdown.
      const profileButton = page
        .getByRole('banner')
        .getByRole('button')
        .filter({ hasText: /admin/i });

      await expect(profileButton).toBeVisible({ timeout: 15000 });
      await profileButton.click();

      // Click Sign Out.
      const signOutButton = page.getByRole('button', { name: /sign out/i });
      await expect(signOutButton).toBeVisible({ timeout: 10000 });
      await signOutButton.click();

      // After logout, the auth guard shows the landing page.
      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );
});
