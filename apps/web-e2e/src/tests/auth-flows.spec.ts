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
    'shows the Get Started with Google button when not authenticated',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /get started with google/i }),
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

  unauthTest(
    'Continue with Google button is clickable on /scoreboard when unauthenticated (LS-3564)',
    async ({ page }) => {
      // /scoreboard is a protected route — unauthenticated users see the landing
      // page.  Verify the CTA button is present and can be clicked without errors.
      // The GSI library is mocked in the test environment so the auth flow does
      // not complete, but clicking the button must not throw or crash the page.
      await page.goto('/scoreboard');
      await page.waitForLoadState('load');

      // The hero "Continue with Google" button has aria-label="Get started with
      // Google".  Use getByRole so this test does not depend on CSS selector
      // syntax — the automated functional tester that filed this ticket used an
      // invalid grouped CSS selector `(button:visible, [role="button"]:visible)`
      // which Playwright rejects.
      const ctaButton = page.getByRole('button', {
        name: /get started with google/i,
      });

      await expect(ctaButton).toBeVisible({ timeout: 15000 });

      // Click the button — the GSI mock's requestCode() is a no-op so the auth
      // popup never opens, but the handler must fire and the page must remain
      // stable (no crash, no error boundary).
      await ctaButton.click();

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
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
    '/players/stats',
    '/management',
    '/profile/settings',
    '/preferences',
    '/help',
    '/scoreboard',
  ];

  for (const route of routes) {
    unauthTest(
      `shows landing page on ${route} when not authenticated`,
      async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('button', { name: /get started with google/i }),
        ).toBeVisible({ timeout: 15000 });
      },
    );
  }
});

// ---------------------------------------------------------------------------
// Scoreboard Landing CTA — regression for LS-3565
// Button must show a spinner during OAuth init, then become interactive.
// ---------------------------------------------------------------------------

unauthTest.describe('Scoreboard Landing CTA @regression', () => {
  unauthTest(
    'Get Started Free button shows spinner during OAuth init then CTA text after configure',
    async ({ page }) => {
      // Block the GSI script so we can observe the spinner before configure
      // resolves. We fulfill with an empty script body — the finally block in
      // PublicLandingPage ensures isConfiguring becomes false regardless of
      // whether the GSI library initialised successfully.
      let fulfillGSI!: () => void;
      const gsiBlocked = new Promise<void>((resolve) => {
        fulfillGSI = resolve;
      });

      await page.route('**/accounts.google.com/gsi/client**', async (route) => {
        await gsiBlocked;
        await route.fulfill({
          contentType: 'application/javascript',
          body: '',
        });
      });

      await page.goto('/scoreboard');
      await page.waitForLoadState('load');

      // While the GSI script is still loading the button shows a spinner —
      // the "Get Started Free" text must NOT be visible yet.
      await expect(page.locator('[aria-label="Get started free"]')).toBeVisible(
        { timeout: 15000 },
      );
      await expect(
        page.locator('[role="button"]', { hasText: /get started free/i }),
      ).not.toBeVisible();

      // Unblock the GSI script — configure completes (success or failure) and
      // isConfiguring becomes false via the finally block.
      fulfillGSI();

      // Button must now show the "Get Started Free" label.
      await expect(
        page.locator('[role="button"]', { hasText: /get started free/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );
});

// ---------------------------------------------------------------------------
// Public Routes — accessible without authentication (LS-3566)
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
      page.getByRole('button', { name: /get started with google/i }),
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
        page.getByRole('button', { name: /get started with google/i }),
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
        page.getByRole('button', { name: /get started with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  expiredSessionTest(
    'shows landing page on a protected route with an expired JWT',
    async ({ page }) => {
      await page.goto('/baseball');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /get started with google/i }),
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
      page.getByRole('button', { name: /get started with google/i }),
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
      page.getByRole('button', { name: /get started with google/i }),
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
        page.getByRole('button', { name: /get started with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );
});
