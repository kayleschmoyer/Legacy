import { adminTest, createCustomAuthTest, expect, test } from '../fixtures/auth-enhanced';
import { E2EAuth, E2EJwtUtil } from '../utils/jwt';

/**
 * Example E2E tests demonstrating CLI JWT usage patterns
 */

// Regular user tests using the default auth fixture
test.describe('Regular User Tests', () => {
  test('should access user dashboard with generated JWT', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Verify authentication worked
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    await expect(page.locator('text=user@test.com')).toBeVisible();
  });

  test('should be denied admin features', async ({ page }) => {
    await page.goto('/admin');
    
    // Should redirect or show access denied
    await expect(page.locator('text=Access Denied')).toBeVisible();
  });
});

// Admin tests using the admin fixture
adminTest.describe('Admin User Tests', () => {
  adminTest('should access admin dashboard', async ({ page }) => {
    await page.goto('/admin');
    
    // Verify admin access
    await expect(page.locator('[data-testid="admin-panel"]')).toBeVisible();
    await expect(page.locator('text=admin@test.com')).toBeVisible();
  });

  adminTest('should manage users', async ({ page }) => {
    await page.goto('/admin/users');
    
    await expect(page.locator('[data-testid="user-management"]')).toBeVisible();
  });
});

// Custom user tests for specific scenarios
const leagueManagerTest = createCustomAuthTest('league-manager@test.com', 'none');

leagueManagerTest.describe('League Manager Tests', () => {
  leagueManagerTest('should create a new league', async ({ page }) => {
    await page.goto('/leagues/create');
    
    await page.fill('[data-testid="league-name"]', 'Test League');
    await page.click('[data-testid="create-league-btn"]');
    
    await expect(page.locator('text=League created successfully')).toBeVisible();
  });
});

// Dynamic JWT generation within tests
test.describe('Dynamic JWT Tests', () => {
  test('should handle multiple user sessions', async ({ page }) => {
    // Start with one user
    const firstUserJwt = E2EJwtUtil.generateJwt({ 
      email: 'user1@test.com', 
      accessLevel: 'none' 
    });
    
    await page.addInitScript((token: string) => {
      window.localStorage.setItem('auth_jwt', token);
    }, firstUserJwt);
    
    await page.goto('/dashboard');
    await expect(page.locator('text=user1@test.com')).toBeVisible();
    
    // Switch to admin user
    const adminJwt = E2EAuth.generateAdminJwt();
    
    await page.evaluate((token: string) => {
      window.localStorage.setItem('auth_jwt', token);
      window.location.reload();
    }, adminJwt);
    
    await expect(page.locator('text=admin@test.com')).toBeVisible();
    await expect(page.locator('[data-testid="admin-menu"]')).toBeVisible();
  });

  test('should handle JWT expiration', async ({ page }) => {
    // Generate a short-lived JWT
    const shortLivedJwt = E2EJwtUtil.generateJwt({ 
      email: 'expire-test@test.com', 
      expiration: '1s' // Very short for testing
    });
    
    await page.addInitScript((token: string) => {
      window.localStorage.setItem('auth_jwt', token);
    }, shortLivedJwt);
    
    await page.goto('/dashboard');
    
    // Wait for token to expire
    await page.waitForTimeout(2000);
    
    // Try to access a protected route
    await page.goto('/protected');
    
    // Should redirect to login or show unauthorized
    await expect(page.locator('text=Please log in')).toBeVisible();
  });
});

// JWT validation tests
test.describe('JWT Validation', () => {
  test('should validate JWT format', ({ page }) => {
    const jwt = E2EAuth.generateUserJwt();
    
    // Test the utility functions
    expect(E2EJwtUtil.isValidJwtFormat(jwt)).toBe(true);
    
    const payload = E2EJwtUtil.decodeJwtPayload(jwt);
    expect(payload.email).toBe('user@test.com');
    expect(payload.accessLevel).toBe('none');
  });

  test('should handle multiple test users', ({ page }) => {
    const jwts = E2EJwtUtil.generateTestJwts('30m');
    
    // Verify we got JWTs for all user types
    expect(jwts.admin).toBeTruthy();
    expect(jwts.regularUser).toBeTruthy();
    expect(jwts.leagueCreator).toBeTruthy();
    expect(jwts.participant).toBeTruthy();
    
    // Each should be a valid JWT
    Object.values(jwts).forEach(jwt => {
      expect(E2EJwtUtil.isValidJwtFormat(jwt)).toBe(true);
    });
  });
});

// Performance test with JWT generation
test.describe('JWT Performance', () => {
  test('should generate JWTs efficiently', ({ page }) => {
    const startTime = Date.now();
    
    // Generate multiple JWTs
    const jwts = [
      E2EJwtUtil.generateJwt({ email: 'perf1@test.com' }),
      E2EJwtUtil.generateJwt({ email: 'perf2@test.com' }),
      E2EJwtUtil.generateJwt({ email: 'perf3@test.com' })
    ];
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Generated 3 JWTs in ${duration}ms`);
    
    // Should be reasonably fast (adjust threshold as needed)
    expect(duration).toBeLessThan(10000); // 10 seconds max
    
    // All JWTs should be valid
    jwts.forEach(jwt => {
      expect(E2EJwtUtil.isValidJwtFormat(jwt)).toBe(true);
    });
  });
});
