/**
 * Authentication Flow E2E Tests
 *
 * Covers: login page display, protected route enforcement, session expiry,
 * and logout — both programmatic and via the profile dropdown UI.
 */

import { test as base } from '@playwright/test';
import { sign } from 'jsonwebtoken';
import { adminTest, expect, test, unauthTest } from '../fixtures/auth-enhanced';

/** Dev-only fallback secret — matches global-setup.ts and auth-enhanced.ts. */
const DEV_JWT_SECRET = 'dev-jwt-secret-key-not-for-production-use-only';

/** Create a JWT whose `exp` is already in the past (expired 1 hour ago). */
function signExpiredJwt(): string {
  const secret = process.env.JWT_SECRET ?? DEV_JWT_SECRET;
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      id: 1,
      email: 'user@test.com',
      username: 'testuser',
      accessLevel: 'none',
      iat: now - 7200, // issued 2 hours ago
      exp: now - 3600, // expired 1 hour ago
    },
    secret,
    { algorithm: 'HS256' },
  );
}

/** Custom fixture that loads an expired JWT into localStorage. */
const expiredSessionTest = base.extend({
  storageState: async ({}, use) => {
    await use({
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:4200',
          localStorage: [{ name: 'auth_jwt', value: signExpiredJwt() }],
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
    'shows the Sign in with Google button when not authenticated',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByRole('button', { name: /sign in with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  unauthTest('displays the welcome login title', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/welcome to legacy sports/i)).toBeVisible({
      timeout: 15000,
    });
  });

  unauthTest(
    'does not render the app navigation when unauthenticated',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // The main nav links should not be present — the auth guard replaces
      // the entire app with the login page.
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
    '/players/stats',
    '/management',
    '/profile/settings',
    '/preferences',
    '/about',
    '/help',
  ];

  for (const route of routes) {
    unauthTest(
      `shows login page on ${route} when not authenticated`,
      async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        await expect(
          page.getByRole('button', { name: /sign in with google/i }),
        ).toBeVisible({ timeout: 15000 });
      },
    );
  }
});

// ---------------------------------------------------------------------------
// Authenticated Access — authenticated user bypasses the login gate
// ---------------------------------------------------------------------------

test.describe('Authenticated Access @critical', () => {
  test('does not show the login page for an authenticated user', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /sign in with google/i }),
    ).not.toBeVisible();
  });

  test('renders the primary navigation for an authenticated user', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('networkidle');

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
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByRole('button', { name: /sign in with google/i }),
      ).not.toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Session Expiry — expired JWT triggers the login gate
// ---------------------------------------------------------------------------

expiredSessionTest.describe('Session Expiry @critical', () => {
  expiredSessionTest(
    'shows login page when the stored JWT has expired',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByRole('button', { name: /sign in with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  expiredSessionTest(
    'shows login page on a protected route with an expired JWT',
    async ({ page }) => {
      await page.goto('/baseball');
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByRole('button', { name: /sign in with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  expiredSessionTest(
    'does not show authenticated app content with an expired JWT',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // The primary nav should not be present — auth guard shows login page.
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
    await page.waitForLoadState('networkidle');

    // Confirm we are authenticated.
    await expect(
      page.getByRole('button', { name: /sign in with google/i }),
    ).not.toBeVisible();

    // Simulate logout by removing the JWT from localStorage.
    await page.evaluate(() => {
      window.localStorage.removeItem('auth_jwt');
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // The auth guard should now show the login page.
    await expect(
      page.getByRole('button', { name: /sign in with google/i }),
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
    await page.waitForLoadState('networkidle');

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
      await page.waitForLoadState('networkidle');

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

      // After logout, the auth guard shows the login page.
      await expect(
        page.getByRole('button', { name: /sign in with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );
});
