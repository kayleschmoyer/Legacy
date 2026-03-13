/**
 * Admin Dashboard E2E Tests (LS-679)
 *
 * Covers /admin:
 *   - Admin Console heading and layout
 *   - Users section with search and user cards
 *   - JWT decoder tool
 *   - Revenue Analytics link
 *   - Redirect of non-admin users
 *
 * All GraphQL responses are mocked so no live backend is required.
 * Admin tests use adminTest fixture; redirect test uses createCustomAuthTest.
 */

import {
  test as _test,
  adminTest,
  createCustomAuthTest,
  expect,
} from '../fixtures/auth-enhanced';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_USERS = [
  {
    __typename: 'User',
    id: 1,
    email: 'admin@legacysports.com',
    username: 'admin',
    accessLevel: 'admin',
    subscriptionTier: 'premium',
    avatarUrl: null,
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    __typename: 'User',
    id: 2,
    email: 'alice@example.com',
    username: 'alice',
    accessLevel: 'none',
    subscriptionTier: 'free',
    avatarUrl: null,
    createdAt: '2024-02-01T00:00:00Z',
  },
  {
    __typename: 'User',
    id: 3,
    email: 'bob@example.com',
    username: 'bob',
    accessLevel: 'none',
    subscriptionTier: 'premium',
    avatarUrl: null,
    createdAt: '2024-03-01T00:00:00Z',
  },
];

/** Sets up GraphQL mocks for the Admin page */
async function mockAdminGraphQL(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (
        postData.includes('admingetusers') ||
        postData.includes('adminusers') ||
        postData.includes('getusers')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { users: MOCK_USERS },
          }),
        });
      } else if (postData.includes('impersonateuser')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              impersonateUser: {
                __typename: 'AuthPayload',
                token: 'mock-jwt-token',
              },
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [
              {
                message:
                  'Unhandled admin GraphQL operation in admin-dashboard.spec.ts mockAdminGraphQL',
                extensions: { postDataSnippet: postData.slice(0, 200) },
              },
            ],
          }),
        });
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Tests: Page structure @smoke
// ---------------------------------------------------------------------------

adminTest.describe('Admin Dashboard – page structure @smoke', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');
  });

  adminTest('loads the admin page without errors', async ({ page }) => {
    await expect(page).toHaveURL('/admin');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  adminTest('shows Admin Console heading', async ({ page }) => {
    await expect(page.getByText('Admin Console')).toBeVisible({
      timeout: 15000,
    });
  });

  adminTest('shows admin dashboard description', async ({ page }) => {
    await expect(
      page.getByText(/manage users and impersonate accounts/i),
    ).toBeVisible({ timeout: 15000 });
  });

  adminTest('shows Revenue Analytics link', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /revenue analytics/i }),
    ).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: Users section @critical
// ---------------------------------------------------------------------------

adminTest.describe('Admin Dashboard – users section @critical', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');
    // Wait for users to load
    await expect(page.getByText('alice@example.com')).toBeVisible({
      timeout: 15000,
    });
  });

  adminTest('shows Users section with user count badge', async ({ page }) => {
    await expect(page.getByText('Users')).toBeVisible({ timeout: 10000 });
    // Badge shows number of users (3 in mock)
    await expect(page.getByText('3')).toBeVisible({ timeout: 10000 });
  });

  adminTest('shows user email addresses', async ({ page }) => {
    await expect(page.getByText('alice@example.com')).toBeVisible();
    await expect(page.getByText('bob@example.com')).toBeVisible();
  });

  adminTest('shows user usernames', async ({ page }) => {
    await expect(page.getByText('alice')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('bob')).toBeVisible({ timeout: 10000 });
  });

  adminTest('shows search input for filtering users', async ({ page }) => {
    await expect(
      page.getByPlaceholder(/search by name, email, or id/i),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: User search @critical
// ---------------------------------------------------------------------------

adminTest.describe('Admin Dashboard – user search @critical', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');
    await expect(page.getByText('alice@example.com')).toBeVisible({
      timeout: 15000,
    });
  });

  adminTest(
    'filters users by email when typing in search',
    async ({ page }) => {
      const searchInput = page.getByPlaceholder(
        /search by name, email, or id/i,
      );
      await searchInput.fill('alice');

      await expect(page.getByText('alice@example.com')).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByText('bob@example.com')).not.toBeVisible();
    },
  );

  adminTest(
    'shows "No users found" when search has no matches',
    async ({ page }) => {
      const searchInput = page.getByPlaceholder(
        /search by name, email, or id/i,
      );
      await searchInput.fill('nonexistentuser99999');

      await expect(page.getByText(/no users found/i)).toBeVisible({
        timeout: 5000,
      });
    },
  );

  adminTest('clears filter when search input is cleared', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search by name, email, or id/i);
    await searchInput.fill('alice');
    await expect(page.getByText('bob@example.com')).not.toBeVisible();

    await searchInput.clear();
    await expect(page.getByText('bob@example.com')).toBeVisible({
      timeout: 5000,
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: JWT decoder @regression
// ---------------------------------------------------------------------------

adminTest.describe('Admin Dashboard – JWT decoder @regression', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');
    await expect(page.getByText('Admin Console')).toBeVisible({
      timeout: 15000,
    });
  });

  adminTest('shows JWT decoder UI', async ({ page }) => {
    // The JWT decoder is in a collapsible accordion — expand it first
    const jwtDecoderSectionToggle = page.getByRole('button', {
      name: /jwt decoder/i,
    });
    await expect(jwtDecoderSectionToggle).toBeVisible({ timeout: 10000 });
    await jwtDecoderSectionToggle.click();

    // After expanding, the Decode button should be visible
    const decodeButton = page.getByRole('button', { name: /decode/i });
    await expect(decodeButton).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: Access control (redirect non-admins) @regression
// ---------------------------------------------------------------------------

const nonAdminTest = createCustomAuthTest('nonadmin@test.com', 'none');

nonAdminTest.describe('Admin Dashboard – access control @regression', () => {
  nonAdminTest(
    'redirects non-admin users away from /admin',
    async ({ page }) => {
      // Return a minimal response so the page does not hit the real backend
      await page.route(isGraphQLEndpoint, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              adminGetUsers: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
        });
      });

      await page.goto('/admin');

      // Non-admin users should be redirected away from /admin
      const adminConsole = page.getByText('Admin Console');
      await expect(page).not.toHaveURL(/\/admin/, { timeout: 10000 });
      await expect(adminConsole).not.toBeVisible();
    },
  );
});

// Suppress 'unused variable' lint error for the _test import kept for reference
void _test;
