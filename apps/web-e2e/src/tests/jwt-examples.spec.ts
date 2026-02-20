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

test.describe('Regular User Tests', () => {
  test('should load authenticated page without seeing login', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The auth guard should NOT display the login page
    await expect(page.locator('text=Sign in with Google')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Admin tests — overrides storageState with an admin JWT
// ---------------------------------------------------------------------------

adminTest.describe('Admin User Tests', () => {
  adminTest(
    'should load authenticated page with admin JWT',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Should not see login page
      await expect(page.locator('text=Sign in with Google')).not.toBeVisible();
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

leagueManagerTest.describe('League Manager Tests', () => {
  leagueManagerTest(
    'should load authenticated page with custom user JWT',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Should not see login page
      await expect(page.locator('text=Sign in with Google')).not.toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// Unauthenticated tests — verifies login page shows when no JWT
// ---------------------------------------------------------------------------

unauthTest.describe('Unauthenticated Tests', () => {
  unauthTest(
    'should show login page when not authenticated',
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Without a JWT, the auth guard should show the login page
      await expect(page.locator('text=Sign in with Google')).toBeVisible({
        timeout: 10000,
      });
    },
  );
});

// ---------------------------------------------------------------------------
// Dynamic JWT generation within tests
// ---------------------------------------------------------------------------

test.describe('Dynamic JWT Tests', () => {
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
    await page.waitForLoadState('networkidle');

    // Inject a different JWT and reload
    const adminJwt = E2EAuth.generateAdminJwt('1h');

    await page.evaluate((token: string) => {
      window.localStorage.setItem('auth_jwt', token);
      window.location.reload();
    }, adminJwt);

    await page.waitForLoadState('networkidle');

    // Should still be authenticated (not showing login)
    await expect(page.locator('text=Sign in with Google')).not.toBeVisible();
  });

  test('should show login after JWT expires', async ({
    page,
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

    // Inject a JWT that expires in 1 second
    const shortLivedJwt = E2EJwtUtil.generateJwt({
      email: 'expire-test@test.com',
      expiration: '1s',
    });

    await page.evaluate((token: string) => {
      window.localStorage.setItem('auth_jwt', token);
    }, shortLivedJwt);

    // Wait long enough for the JWT to expire (1s expiry + margin)
    await page.waitForTimeout(3000);

    // Reload — the app should detect the expired token
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Auth guard should redirect to login since token is expired
    await expect(page.locator('text=Sign in with Google')).toBeVisible({
      timeout: 15000,
    });
  });
});

// ---------------------------------------------------------------------------
// JWT utility validation tests (no browser interaction needed)
// ---------------------------------------------------------------------------

test.describe('JWT Validation', () => {
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
