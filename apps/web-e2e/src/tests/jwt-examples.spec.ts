import {
  adminTest,
  createCustomAuthTest,
  expect,
  test,
  unauthTest,
} from '../fixtures/auth-enhanced';
import { E2EAuth, E2EJwtUtil } from '../utils/jwt';

/**
 * E2E tests demonstrating JWT authentication patterns.
 *
 * Authentication is provided by the global-setup storageState. These tests
 * exercise the fixture-level overrides for admin, custom-user, and
 * unauthenticated scenarios.
 */

// ---------------------------------------------------------------------------
// Regular user tests — uses default storageState (admin JWT from global setup)
// ---------------------------------------------------------------------------

test.describe('Regular User Tests @regression', () => {
  test('should load authenticated page without seeing login', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    // The auth guard should NOT display the landing page
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Admin tests — overrides storageState with an admin JWT
// ---------------------------------------------------------------------------

adminTest.describe('Admin User Tests @regression', () => {
  adminTest(
    'should load authenticated page with admin JWT',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      // Should not see landing page
      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).not.toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// Custom user tests
// ---------------------------------------------------------------------------

const leagueManagerTest = createCustomAuthTest(
  'league-manager@test.com',
  'none',
);

leagueManagerTest.describe('League Manager Tests @regression', () => {
  leagueManagerTest(
    'should load authenticated page with custom user JWT',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      // Should not see landing page
      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).not.toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// Unauthenticated tests — verifies login page shows when no JWT
// ---------------------------------------------------------------------------

unauthTest.describe('Unauthenticated Tests @regression', () => {
  unauthTest(
    'should show landing page when not authenticated',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      // Without a JWT, the auth guard should show the landing page
      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({
        timeout: 10000,
      });
    },
  );
});

// ---------------------------------------------------------------------------
// Dynamic JWT generation within tests
// ---------------------------------------------------------------------------

test.describe('Dynamic JWT Tests @regression', () => {
  test('should switch user identity mid-test', async ({
    page,
    browserName,
  }) => {
    // WebKit blocks localStorage access via page.evaluate — SecurityError
    test.skip(
      browserName === 'webkit',
      'WebKit blocks localStorage in e2e context',
    );

    // Start with the default storageState user
    await page.goto('/');
    await page.waitForLoadState('load');

    // Inject a different JWT and reload
    const adminJwt = E2EAuth.generateAdminJwt('1h');

    await page.evaluate((token: string) => {
      window.localStorage.setItem('auth_jwt', token);
      window.location.reload();
    }, adminJwt);

    await page.waitForLoadState('load');

    // Should still be authenticated (not showing landing page)
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).not.toBeVisible();
  });

  test('should show login after auth state is cleared', async ({
    page,
    context,
    browserName,
  }) => {
    // WebKit blocks localStorage access via page.evaluate — SecurityError
    test.skip(
      browserName === 'webkit',
      'WebKit blocks localStorage in e2e context',
    );

    // Must navigate to the app first so page.evaluate operates on the
    // correct origin's localStorage (not about:blank)
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Clear all auth state: cookies (ls_jwt, ls_csrf) and localStorage
    // (ls_user_profile, ls_token_expiry). The auth guard uses HttpOnly
    // cookies, not the auth_jwt localStorage key.
    await context.clearCookies();
    await page.evaluate(() => {
      window.localStorage.clear();
    });

    // Reload — the auth guard should show the login page
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Auth guard should redirect to login since tokens are gone
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).toBeVisible({
      timeout: 15000,
    });
  });
});

// ---------------------------------------------------------------------------
// JWT utility validation tests (no browser interaction needed)
// ---------------------------------------------------------------------------

test.describe('JWT Validation @regression', () => {
  test('should validate JWT format', () => {
    const jwt = E2EAuth.generateUserJwt('5m');

    expect(E2EJwtUtil.isValidJwtFormat(jwt)).toBe(true);

    const payload = E2EJwtUtil.decodeJwtPayload(jwt);
    expect(payload.email).toBe('user@test.com');
    expect(payload.accessLevel).toBe('none');
  });

  test('should generate JWTs for all test user types', () => {
    const jwts = E2EJwtUtil.generateTestJwts('30m');

    expect(jwts.admin).toBeTruthy();
    expect(jwts.regularUser).toBeTruthy();
    expect(jwts.leagueCreator).toBeTruthy();
    expect(jwts.participant).toBeTruthy();

    // Each should be a valid JWT
    for (const jwt of Object.values(jwts)) {
      expect(E2EJwtUtil.isValidJwtFormat(jwt)).toBe(true);
    }
  });

  test('should generate JWTs with correct payloads', () => {
    const adminJwt = E2EAuth.generateAdminJwt('5m');
    const adminPayload = E2EJwtUtil.decodeJwtPayload(adminJwt);
    expect(adminPayload.email).toBe('admin@test.com');
    expect(adminPayload.accessLevel).toBe('admin');

    const userJwt = E2EAuth.generateUserJwt('5m');
    const userPayload = E2EJwtUtil.decodeJwtPayload(userJwt);
    expect(userPayload.email).toBe('user@test.com');
    expect(userPayload.accessLevel).toBe('none');
  });
});
