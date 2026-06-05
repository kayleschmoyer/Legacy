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
import {
  extractOperationName,
  filterUsers,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      // Match on the exact operation name (not broad postData substrings,
      // which can collide — e.g. "getuserscount" contains "getusers").
      const op = extractOperationName(route).toLowerCase();
      let variables: { search?: unknown } = {};
      try {
        variables =
          (
            JSON.parse(route.request().postData() ?? '') as {
              variables?: { search?: unknown };
            }
          ).variables ?? {};
      } catch {
        variables = {};
      }
      const search =
        typeof variables.search === 'string' ? variables.search : '';
      const matchedUsers = filterUsers(MOCK_USERS, search);

      if (op === 'getuserbyid') {
        // The redesigned AdminPage gates admin access on a server-side
        // GetUserById lookup (serverUserData?.user?.accessLevel). The baseline
        // mock returns accessLevel 'none', which trips the not-admin redirect
        // away from /admin and races the "Admin Console" assertion. Return the
        // admin identity matching the adminTest JWT so the page stays put.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { user: MOCK_USERS[0] } }),
        });
      } else if (op === 'getuserscount') {
        // GetUsersCount feeds the "Total Users" stat / search-result count.
        // Honor the search variable so /admin/users count reflects the
        // filtered set.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { usersCount: matchedUsers.length } }),
        });
      } else if (op === 'getallusers' || op === 'admingetusers') {
        // Both AdminGetUsers and GetAllUsers (the recent-users list on /admin
        // and the server-side-searched list on /admin/users) resolve to the
        // same { users } shape. GetAllUsers was previously unmocked, falling
        // through to the API isolation catch-all (recorded as an unmocked-op
        // test error + empty data) — the primary admin-dashboard flake source
        // (LS-7703). matchedUsers honors the GetAllUsers `search` variable.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { users: matchedUsers },
          }),
        });
      } else if (op === 'impersonateuser') {
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
        // Fall through to the baseline _apiIsolation fixture for ambient
        // queries (getUnreadNotificationCount, etc.)
        await unmockedGraphQLFallback(route);
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
    await expect(page.getByText('Admin Console')).toBeVisible();
  });

  adminTest('shows admin dashboard description', async ({ page }) => {
    // Redesigned /admin is a dashboard; user management moved to /admin/users.
    await expect(
      page.getByText(/platform overview and developer tools/i),
    ).toBeVisible();
  });

  adminTest(
    'shows Revenue nav card linking to /admin/revenue',
    async ({ page }) => {
      await expect(
        page.getByRole('link', { name: /revenue/i }).first(),
      ).toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// Tests: Users section @regression
// ---------------------------------------------------------------------------

adminTest.describe('Admin Dashboard – users section @regression', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');
    // Wait for users to load
    await expect(page.getByText('alice@example.com')).toBeVisible();
  });

  adminTest('shows Total Users stat with the user count', async ({ page }) => {
    // Redesigned /admin shows a "Total Users" StatCard fed by GetUsersCount.
    await expect(page.getByText('Total Users')).toBeVisible();
    await expect(page.getByText('3', { exact: true }).first()).toBeVisible();
  });

  adminTest('shows recent-signup email addresses', async ({ page }) => {
    await expect(page.getByText('alice@example.com')).toBeVisible();
    await expect(page.getByText('bob@example.com')).toBeVisible();
  });

  adminTest('shows recent-signup usernames', async ({ page }) => {
    await expect(page.getByText('alice', { exact: true })).toBeVisible();
    await expect(page.getByText('bob', { exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: User search @regression
//
// User search lives on the dedicated /admin/users management page
// (AdminUsersPage) after the admin redesign (LS-5315) — /admin itself only
// shows the read-only "Recent Signups" widget. Search is server-side: typing
// triggers a debounced GetAllUsers refetch with a `search` variable, which the
// mock filters via filterUsers().
// ---------------------------------------------------------------------------

adminTest.describe('Admin Dashboard – user search @regression', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin/users');
    await page.waitForLoadState('load');
    // Wait for the user list to render before interacting with search.
    await expect(page.getByText('alice@example.com')).toBeVisible();
  });

  adminTest('shows search input for filtering users', async ({ page }) => {
    await expect(
      page.getByPlaceholder(/search by email or username/i),
    ).toBeVisible();
  });

  adminTest(
    'filters users by email when typing in search',
    async ({ page }) => {
      await page.getByPlaceholder(/search by email or username/i).fill('alice');

      await expect(page.getByText('alice@example.com')).toBeVisible();
      await expect(page.getByText('bob@example.com')).not.toBeVisible();
    },
  );

  adminTest(
    'shows empty state when search has no matches',
    async ({ page }) => {
      await page
        .getByPlaceholder(/search by email or username/i)
        .fill('nonexistentuser99999');

      await expect(page.getByText(/no users match your search/i)).toBeVisible();
    },
  );

  adminTest('clears filter when search input is cleared', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search by email or username/i);
    await searchInput.fill('alice');
    await expect(page.getByText('bob@example.com')).not.toBeVisible();

    await searchInput.clear();
    await expect(page.getByText('bob@example.com')).toBeVisible();
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
    await expect(page.getByText('Admin Console')).toBeVisible();
  });

  adminTest('shows JWT decoder UI', async ({ page }) => {
    // The JWT decoder accordion toggle is a generic element (not a <button>),
    // so locate by the heading inside it and click to expand.
    const jwtDecoderHeading = page.getByRole('heading', {
      name: 'JWT Decoder',
    });
    await expect(jwtDecoderHeading).toBeVisible();
    await jwtDecoderHeading.click();

    // After expanding, the Decode button should be visible
    const decodeButton = page.getByRole('button', { name: /^decode$/i });
    await expect(decodeButton).toBeVisible();
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
