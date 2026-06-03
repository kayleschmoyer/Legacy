/**
 * Admin Hub Navigation E2E Tests (LS-5315)
 *
 * Covers the AdminNavHub on /admin and the /admin/users route:
 *  - Nav cards (Users, Revenue) are visible on /admin
 *  - Clicking Users card navigates to /admin/users
 *  - Clicking Revenue card navigates to /admin/revenue
 *  - AdminUsersPage renders correctly at /admin/users
 *  - Non-admin users are redirected from /admin/users
 *
 * All GraphQL responses are mocked; no live backend required.
 */

import {
  adminTest,
  createCustomAuthTest,
  expect,
} from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_USERS = [
  {
    __typename: 'User',
    id: 1,
    email: 'admin@test.com',
    username: 'AdminUser',
    accessLevel: 'admin',
  },
  {
    __typename: 'User',
    id: 2,
    email: 'alice@example.com',
    username: 'alice',
    accessLevel: 'none',
  },
];

// ---------------------------------------------------------------------------
// Shared mock helper
// ---------------------------------------------------------------------------

async function mockAdminGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();

    if (op === 'admingetusers' || op === 'getallusers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { users: MOCK_USERS } }),
      });
    } else if (op === 'getuserscount') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { usersCount: MOCK_USERS.length } }),
      });
    } else if (op === 'getuserbyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            user: {
              __typename: 'User',
              id: 1,
              email: 'admin@test.com',
              username: 'AdminUser',
              name: 'AdminUser',
              accessLevel: 'admin',
            },
          },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ---------------------------------------------------------------------------
// AdminNavHub on /admin
// ---------------------------------------------------------------------------

adminTest.describe('Admin Hub Navigation — nav cards @smoke', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');
  });

  adminTest('renders Users nav card on the admin hub', async ({ page }) => {
    await expect(page.getByRole('link', { name: /^users$/i })).toBeVisible();
  });

  adminTest('renders Revenue nav card on the admin hub', async ({ page }) => {
    await expect(page.getByRole('link', { name: /^revenue$/i })).toBeVisible();
  });

  adminTest('Users nav card links to /admin/users', async ({ page }) => {
    const usersCard = page.getByRole('link', { name: /^users$/i });
    await expect(usersCard).toHaveAttribute('href', '/admin/users');
  });

  adminTest('Revenue nav card links to /admin/revenue', async ({ page }) => {
    const revenueCard = page.getByRole('link', { name: /^revenue$/i });
    await expect(revenueCard).toHaveAttribute('href', '/admin/revenue');
  });

  adminTest(
    'clicking Users card navigates to /admin/users',
    async ({ page }) => {
      await page.getByRole('link', { name: /^users$/i }).click();
      await page.waitForLoadState('load');
      await expect(page).toHaveURL('/admin/users');
    },
  );

  adminTest(
    'clicking Revenue card navigates to /admin/revenue',
    async ({ page }) => {
      await page.getByRole('link', { name: /^revenue$/i }).click();
      await page.waitForLoadState('load');
      await expect(page).toHaveURL('/admin/revenue');
    },
  );
});

// ---------------------------------------------------------------------------
// AdminUsersPage at /admin/users
// ---------------------------------------------------------------------------

adminTest.describe(
  'Admin Hub Navigation — /admin/users page @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockAdminGraphQL(page);
      await page.goto('/admin/users');
      await page.waitForLoadState('load');
    });

    adminTest('renders AdminUsersPage without errors', async ({ page }) => {
      await expect(page).toHaveURL('/admin/users');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });

    adminTest('shows at least one user record', async ({ page }) => {
      await expect(page.getByText('alice@example.com')).toBeVisible();
    });
  },
);

// ---------------------------------------------------------------------------
// Access control for /admin/users
// ---------------------------------------------------------------------------

const nonAdminTest = createCustomAuthTest('user@test.com', 'none');

nonAdminTest.describe(
  'Admin Hub Navigation — access control @regression',
  () => {
    nonAdminTest(
      'non-admin is redirected away from /admin/users',
      async ({ page }) => {
        await page.route(isGraphQLEndpoint, async (route) => {
          await unmockedGraphQLFallback(route);
        });

        await page.goto('/admin/users');
        await expect(page).not.toHaveURL(/\/admin\/users/, { timeout: 10000 });
      },
    );
  },
);
