/**
 * Admin Console E2E Tests (LS-606)
 *
 * Covers the Admin Console at /admin:
 *  - Access controls (non-admin is redirected)
 *  - User management section (search, user list, impersonate button)
 *  - JWT Decoder section
 *
 * Uses `adminTest` fixture which sets an admin-level JWT in localStorage.
 * All GraphQL queries are mocked.
 */

import {
  adminTest,
  createCustomAuthTest,
  expect,
  test,
} from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  filterUsers,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/** Non-admin user: global storageState JWT has accessLevel 'admin',
 *  so we need a custom fixture with accessLevel 'none' for redirect tests. */
const nonAdminTest = createCustomAuthTest('user@test.com', 'none');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock Data
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
  {
    __typename: 'User',
    id: 3,
    email: 'bob@example.com',
    username: 'bob',
    accessLevel: 'none',
  },
];

async function mockAdminGraphQL(
  page: import('@playwright/test').Page,
  opts: { usersError?: boolean } = {},
): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route) => {
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
    const search = typeof variables.search === 'string' ? variables.search : '';
    const matchedUsers = filterUsers(MOCK_USERS, search);

    if (op === 'getuserscount') {
      // GetUsersCount feeds the "Total Users" stat / search-result count.
      // Previously unmocked (LS-7703). Honors the search variable.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { usersCount: matchedUsers.length } }),
      });
    } else if (op === 'admingetusers' || op === 'getallusers') {
      // AdminGetUsers (the users list) and GetAllUsers (the recent-users
      // widget the redesigned AdminPage fires) share the same { users }
      // shape. GetAllUsers was previously unmocked, falling through to the
      // API isolation catch-all and racing the assertions (LS-7703).
      if (opts.usersError) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Database connection error' }],
            data: null,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { users: matchedUsers } }),
        });
      }
    } else if (op === 'getuserbyid') {
      // Return the admin user that matches the adminTest JWT (admin@test.com)
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
    } else if (op === 'impersonateuser') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            impersonateUser: {
              __typename: 'ImpersonateUserResult',
              token: 'mocked.impersonation.token',
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
// Access control tests (uses regular `test` fixture, not adminTest)
// ---------------------------------------------------------------------------

nonAdminTest.describe('Admin Console — access control @critical', () => {
  nonAdminTest(
    'non-admin user is redirected away from /admin',
    async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('load');

      // Non-admin gets redirected to / (redirected by the component's navigate call)
      await expect(page).not.toHaveURL('/admin', { timeout: 10000 });
    },
  );
});

// ---------------------------------------------------------------------------
// Admin Console — navigation
// ---------------------------------------------------------------------------

adminTest.describe('Admin Console — navigation @smoke', () => {
  adminTest('loads the admin console without errors', async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/admin');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  adminTest('shows "Admin Console" heading', async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');

    await expect(page.getByText('Admin Console')).toBeVisible();
  });

  adminTest(
    'shows "Revenue" nav card linking to /admin/revenue',
    async ({ page }) => {
      await mockAdminGraphQL(page);
      await page.goto('/admin');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('link', { name: /revenue/i }).first(),
      ).toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// Users section
// ---------------------------------------------------------------------------

adminTest.describe('Admin Console — Users section @regression', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');
  });

  adminTest('shows "Users" section accordion', async ({ page }) => {
    await expect(
      page.getByText('Users', { exact: true }).first(),
    ).toBeVisible();
  });

  adminTest('shows regular user alice in the user list', async ({ page }) => {
    await expect(page.getByText('alice', { exact: true })).toBeVisible();
  });

  adminTest('shows regular user bob in the user list', async ({ page }) => {
    await expect(page.getByText('bob', { exact: true })).toBeVisible();
  });

  adminTest('shows user email addresses', async ({ page }) => {
    await expect(page.getByText('alice@example.com')).toBeVisible();
  });

  adminTest(
    'shows "admin" access badge for the admin user',
    async ({ page }) => {
      await expect(
        page.getByText('admin', { exact: true }).first(),
      ).toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// User management (/admin/users)
//
// The admin redesign (LS-5315) moved user search, role management, and
// impersonation off /admin onto the dedicated /admin/users management page
// (AdminUsersPage). /admin itself only shows the read-only Recent Signups
// widget, so these tests target /admin/users where the controls now live.
// Search is server-side: typing triggers a debounced GetAllUsers refetch with
// a `search` variable, which the mock filters via filterUsers().
// ---------------------------------------------------------------------------

adminTest.describe('Admin Console — user management @regression', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin/users');
    await page.waitForLoadState('load');
    await expect(page.getByText('alice@example.com')).toBeVisible();
  });

  adminTest(
    'shows "Impersonate" button for non-admin users',
    async ({ page }) => {
      await expect(
        page.getByRole('button', { name: /impersonate/i }).first(),
      ).toBeVisible();
    },
  );

  adminTest(
    'does not show Impersonate button for other admin users',
    async ({ page }) => {
      // AdminUser (id:1) is admin — verify user card is visible.
      // "AdminUser" is a fixture username, not user-facing product copy.
      await expect(
        page.getByText('AdminUser', { exact: true }).first(),
      ).toBeVisible();

      // AdminUser is admin (and the current user) — no Impersonate button.
      // Only alice and bob (non-admin) get one.
      const impersonateButtons = page.getByRole('button', {
        name: /impersonate/i,
      });
      await expect(impersonateButtons).toHaveCount(2);
    },
  );

  adminTest('filters users by username search', async ({ page }) => {
    // Type "bob" in search box — server-side search refetches a filtered list.
    await page.getByPlaceholder(/search by email or username/i).fill('bob');

    // alice should be hidden; bob should remain
    await expect(page.getByText('bob', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText('alice', { exact: true }).first(),
    ).not.toBeVisible();
  });

  adminTest(
    'shows empty state when search matches nothing',
    async ({ page }) => {
      await page
        .getByPlaceholder(/search by email or username/i)
        .fill('zzz-no-match');

      await expect(page.getByText(/no users match your search/i)).toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// User management — error state (/admin/users)
// ---------------------------------------------------------------------------

adminTest.describe('Admin Console — users error state @regression', () => {
  adminTest('shows error message when user query fails', async ({ page }) => {
    await mockAdminGraphQL(page, { usersError: true });
    await page.goto('/admin/users');
    await page.waitForLoadState('load');

    await expect(page.getByText(/Failed to load users/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// JWT Decoder section
// ---------------------------------------------------------------------------

adminTest.describe('Admin Console — JWT Decoder @regression', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');
  });

  adminTest('shows "JWT Decoder" section heading', async ({ page }) => {
    await expect(page.getByText('JWT Decoder')).toBeVisible();
  });

  adminTest(
    'JWT Decoder accordion is collapsed by default',
    async ({ page }) => {
      // defaultOpen={false} means its body is hidden by default
      await expect(page.getByPlaceholder(/paste jwt here/i)).not.toBeVisible();
    },
  );

  adminTest(
    'clicking JWT Decoder header expands the section',
    async ({ page }) => {
      await page.getByText('JWT Decoder').click();
      await expect(page.getByPlaceholder(/paste jwt here/i)).toBeVisible();
    },
  );

  adminTest(
    'shows "Decode" button when JWT Decoder is open',
    async ({ page }) => {
      await page.getByText('JWT Decoder').click();
      await expect(
        page.getByRole('button', { name: /^decode$/i }),
      ).toBeVisible();
    },
  );

  adminTest(
    'decodes a valid JWT and shows Payload section',
    async ({ page }) => {
      await page.getByText('JWT Decoder').click();
      await expect(page.getByPlaceholder(/paste jwt here/i)).toBeVisible();

      // A well-formed but not cryptographically signed example JWT
      const testJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
        'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      await page.getByPlaceholder(/paste jwt here/i).fill(testJwt);
      await page.getByRole('button', { name: /^decode$/i }).click();

      await expect(page.getByText('Payload', { exact: true })).toBeVisible();
      await expect(page.getByText('Header', { exact: true })).toBeVisible();
    },
  );

  adminTest('shows error for invalid JWT input', async ({ page }) => {
    await page.getByText('JWT Decoder').click();
    await expect(page.getByPlaceholder(/paste jwt here/i)).toBeVisible();

    await page.getByPlaceholder(/paste jwt here/i).fill('not-a-valid-jwt');
    await page.getByRole('button', { name: /^decode$/i }).click();

    await expect(page.getByText(/Invalid JWT/i)).toBeVisible();
  });
});
