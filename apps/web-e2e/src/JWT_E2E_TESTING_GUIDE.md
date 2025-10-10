# JWT E2E Testing Guide

This guide explains how to use CLI-generated JWTs in your E2E tests for the Legacy Sports application.

## 🚀 Quick Start

### 1. Basic Test with Default User
```typescript
import { test, expect } from '../fixtures/auth-enhanced';

test('my test', async ({ page }) => {
  // JWT is automatically generated and set for user@test.com
  await page.goto('/dashboard');
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
});
```

### 2. Admin Test
```typescript
import { adminTest, expect } from '../fixtures/auth-enhanced';

adminTest('admin functionality', async ({ page }) => {
  // JWT is automatically generated for admin@test.com with admin access
  await page.goto('/admin');
  await expect(page.locator('[data-testid="admin-panel"]')).toBeVisible();
});
```

### 3. Custom User Test
```typescript
import { createCustomAuthTest, expect } from '../fixtures/auth-enhanced';

const managerTest = createCustomAuthTest('manager@company.com', 'none');

managerTest('manager features', async ({ page }) => {
  // JWT generated for manager@company.com
  await page.goto('/management');
  // ... test logic
});
```

## 🔧 Advanced Usage

### Dynamic JWT Generation
```typescript
import { E2EAuth, E2EJwtUtil } from '../utils/jwt';

test('switch users during test', async ({ page }) => {
  // Start with regular user
  const userJwt = E2EAuth.generateUserJwt('1h');
  await page.addInitScript((token) => {
    localStorage.setItem('auth_jwt', token);
  }, userJwt);
  
  await page.goto('/dashboard');
  // ... test user functionality
  
  // Switch to admin
  const adminJwt = E2EAuth.generateAdminJwt('1h');
  await page.evaluate((token) => {
    localStorage.setItem('auth_jwt', token);
    location.reload();
  }, adminJwt);
  
  // ... test admin functionality
});
```

### Custom JWT Options
```typescript
// Generate JWT with specific expiration
const shortJwt = E2EJwtUtil.generateJwt({
  email: 'test@example.com',
  expiration: '5m',
  accessLevel: 'none'
});

// Generate JWT for admin user
const adminJwt = E2EJwtUtil.generateJwt({
  email: 'admin@example.com',
  expiration: '2h',
  accessLevel: 'admin'
});
```

### Bulk JWT Generation
```typescript
// Generate JWTs for all common test scenarios
const testJwts = E2EJwtUtil.generateTestJwts('1h');

console.log('Available JWTs:', {
  admin: testJwts.admin,
  regularUser: testJwts.regularUser,
  leagueCreator: testJwts.leagueCreator,
  participant: testJwts.participant
});
```

## 🛠 Utility Functions

### JWT Validation
```typescript
import { E2EJwtUtil } from '../utils/jwt';

// Check if JWT has valid format
const isValid = E2EJwtUtil.isValidJwtFormat(jwt);

// Decode JWT payload (without verification)
const payload = E2EJwtUtil.decodeJwtPayload(jwt);
console.log('User:', payload.email, 'Access:', payload.accessLevel);
```

### Quick Auth Setup
```typescript
import { E2EAuth } from '../utils/jwt';

// Setup functions for common scenarios
test('admin setup example', async ({ page }) => {
  await E2EAuth.setupAdminAuth(page);
  // Page now has admin JWT in localStorage
});

test('custom setup example', async ({ page }) => {
  await E2EAuth.setupCustomAuth('custom@user.com', 'admin')(page);
  // Page now has custom user JWT
});
```

## 📋 Common Patterns

### 1. Multi-User League Test
```typescript
test('league with multiple users', async ({ context }) => {
  // Create multiple browser contexts for different users
  const adminPage = await context.newPage();
  await E2EAuth.setupAdminAuth(adminPage);
  
  const userPage = await context.newPage();
  await E2EAuth.setupUserAuth(userPage);
  
  // Admin creates league
  await adminPage.goto('/leagues/create');
  await adminPage.fill('[data-testid="league-name"]', 'Test League');
  await adminPage.click('[data-testid="create-btn"]');
  
  // User joins league
  await userPage.goto('/leagues/join');
  await userPage.click('[data-testid="join-league-btn"]');
  
  // Verify both users see the league
  await expect(adminPage.locator('text=Test League')).toBeVisible();
  await expect(userPage.locator('text=Test League')).toBeVisible();
});
```

### 2. Permission Testing
```typescript
test('verify user permissions', async ({ page }) => {
  const userJwt = E2EAuth.generateUserJwt();
  
  await page.addInitScript((token) => {
    localStorage.setItem('auth_jwt', token);
  }, userJwt);
  
  await page.goto('/admin');
  
  // User should be redirected or see access denied
  await expect(page.locator('text=Access Denied')).toBeVisible();
});
```

### 3. JWT Expiration Testing
```typescript
test('handle expired JWT', async ({ page }) => {
  // Generate very short-lived JWT
  const expiredJwt = E2EJwtUtil.generateJwt({
    email: 'test@example.com',
    expiration: '1s'
  });
  
  await page.addInitScript((token) => {
    localStorage.setItem('auth_jwt', token);
  }, expiredJwt);
  
  await page.goto('/dashboard');
  
  // Wait for expiration
  await page.waitForTimeout(2000);
  
  // Try to access protected resource
  await page.goto('/protected');
  
  // Should require re-authentication
  await expect(page.locator('text=Please log in')).toBeVisible();
});
```

## 🔍 Debugging

### Check JWT in Browser
```typescript
test('debug JWT', async ({ page }) => {
  const jwt = E2EAuth.generateUserJwt();
  
  await page.addInitScript((token) => {
    localStorage.setItem('auth_jwt', token);
    console.log('JWT set:', token);
  }, jwt);
  
  await page.goto('/dashboard');
  
  // Check JWT in browser console
  const storedJwt = await page.evaluate(() => {
    return localStorage.getItem('auth_jwt');
  });
  
  console.log('Stored JWT:', storedJwt);
  
  // Decode and inspect payload
  if (storedJwt) {
    const payload = E2EJwtUtil.decodeJwtPayload(storedJwt);
    console.log('JWT Payload:', payload);
  }
});
```

### CLI Command Debugging
If JWT generation fails, you can run the CLI command manually:
```bash
npx tsx --tsconfig tsconfig.base.json apps/cli/src/main.ts generate-jwt --email test@example.com --exp 1h
```

## 🚨 Best Practices

1. **Use appropriate expiration times**: Short for quick tests (5m), longer for complex workflows (1h)

2. **Generate fresh JWTs per test**: Don't reuse JWTs across tests to avoid token conflicts

3. **Handle CLI failures gracefully**: The fixtures include fallback mock tokens if CLI generation fails

4. **Use specific user emails**: Use descriptive emails like `league-creator@test.com` instead of generic ones

5. **Test both success and failure scenarios**: Include tests for expired JWTs and invalid tokens

6. **Clean up localStorage**: The fixtures handle this automatically, but be aware for manual JWT setup

## 🔧 Configuration

### Environment Variables
The JWT generation respects these environment variables:
- `NODE_ENV=test` - Automatically set by the E2E utilities
- Database connection variables (falls back to mock users if not available)

### CLI Path Configuration
If you need to customize the CLI path, edit `E2EJwtUtil.CLI_PATH` in `utils/jwt.ts`:
```typescript
private static readonly CLI_PATH = path.join(__dirname, '../../../cli/src/main.ts');
```

## 📝 Example Test Suite
See `tests/jwt-examples.spec.ts` for comprehensive examples of all these patterns in action.
