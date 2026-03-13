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

import { adminTest, expect, test } from '../fixtures/auth-enhanced';

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
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('admingetusers')) {
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
          body: JSON.stringify({ data: { users: MOCK_USERS } }),
        });
      }
    } else if (postData.includes('impersonateuser')) {
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
      await route.fallback();
    }
  });
}

// ---------------------------------------------------------------------------
// Access control tests (uses regular `test` fixture, not adminTest)
// ---------------------------------------------------------------------------

test.describe('Admin Console — access control @critical', () => {
  test('non-admin user is redirected away from /admin', async ({ page }) => {
    // Regular `test` fixture uses a user@test.com JWT with accessLevel 'none'
    await page.goto('/admin');
    await page.waitForLoadState('load');

    // Non-admin gets redirected to / (redirected by the component's navigate call)
    await expect(page).not.toHaveURL('/admin', { timeout: 10000 });
  });
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

    await expect(page.getByText('Admin Console')).toBeVisible({
      timeout: 30000,
    });
  });

  adminTest('shows "Revenue Analytics" link', async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');

    await expect(page.getByText('Revenue Analytics')).toBeVisible({
      timeout: 30000,
    });
  });
});

// ---------------------------------------------------------------------------
// Users section
// ---------------------------------------------------------------------------

adminTest.describe('Admin Console — Users section @critical', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');
  });

  adminTest('shows "Users" section accordion', async ({ page }) => {
    await expect(page.getByText('Users')).toBeVisible({ timeout: 30000 });
  });

  adminTest('shows regular user alice in the user list', async ({ page }) => {
    await expect(page.getByText('alice')).toBeVisible({ timeout: 30000 });
  });

  adminTest('shows regular user bob in the user list', async ({ page }) => {
    await expect(page.getByText('bob')).toBeVisible({ timeout: 30000 });
  });

  adminTest('shows user email addresses', async ({ page }) => {
    await expect(page.getByText('alice@example.com')).toBeVisible({
      timeout: 30000,
    });
  });

  adminTest(
    'shows "admin" access badge for the admin user',
    async ({ page }) => {
      await expect(
        page.getByText('admin', { exact: true }).first(),
      ).toBeVisible({
        timeout: 30000,
      });
    },
  );

  adminTest(
    'shows "Impersonate" button for non-admin users',
    async ({ page }) => {
      await expect(
        page.getByRole('button', { name: /impersonate/i }).first(),
      ).toBeVisible({ timeout: 30000 });
    },
  );

  adminTest(
    'does not show Impersonate button for other admin users',
    async ({ page }) => {
      // AdminUser (id:1) is admin — should not have an Impersonate button
      const userCards = page.locator('text=AdminUser').first();
      await expect(userCards).toBeVisible({ timeout: 30000 });

      // The admin user row should not have an Impersonate button adjacent to it
      // (Only 2 non-admin users, so exactly 2 Impersonate buttons total)
      const impersonateButtons = page.getByRole('button', {
        name: /impersonate/i,
      });
      await expect(impersonateButtons).toHaveCount(2, { timeout: 10000 });
    },
  );
});

// ---------------------------------------------------------------------------
// Users section — search
// ---------------------------------------------------------------------------

adminTest.describe('Admin Console — user search @regression', () => {
  adminTest('filters users by username search', async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');
    await expect(page.getByText('alice')).toBeVisible({ timeout: 30000 });

    // Type "bob" in search box
    await page.getByPlaceholder(/search by name, email, or id/i).fill('bob');

    // alice should be hidden; bob should remain
    await expect(page.getByText('bob')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('alice')).not.toBeVisible({ timeout: 5000 });
  });

  adminTest(
    'shows "No users found" when search matches nothing',
    async ({ page }) => {
      await mockAdminGraphQL(page);
      await page.goto('/admin');
      await page.waitForLoadState('load');
      await expect(page.getByText('alice')).toBeVisible({ timeout: 30000 });

      await page
        .getByPlaceholder(/search by name, email, or id/i)
        .fill('zzz-no-match');

      await expect(page.getByText('No users found')).toBeVisible({
        timeout: 5000,
      });
    },
  );
});

// ---------------------------------------------------------------------------
// Users section — error state
// ---------------------------------------------------------------------------

adminTest.describe('Admin Console — users error state @regression', () => {
  adminTest('shows error message when user query fails', async ({ page }) => {
    await mockAdminGraphQL(page, { usersError: true });
    await page.goto('/admin');
    await page.waitForLoadState('load');

    await expect(page.getByText(/Failed to load users/i)).toBeVisible({
      timeout: 30000,
    });
  });
});

// ---------------------------------------------------------------------------
// JWT Decoder section
// ---------------------------------------------------------------------------

adminTest.describe('Admin Console — JWT Decoder @critical', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminGraphQL(page);
    await page.goto('/admin');
    await page.waitForLoadState('load');
  });

  adminTest('shows "JWT Decoder" section heading', async ({ page }) => {
    await expect(page.getByText('JWT Decoder')).toBeVisible({
      timeout: 30000,
    });
  });

  adminTest(
    'JWT Decoder accordion is collapsed by default',
    async ({ page }) => {
      // defaultOpen={false} means its body is hidden by default
      await expect(page.getByPlaceholder(/paste jwt here/i)).not.toBeVisible({
        timeout: 5000,
      });
    },
  );

  adminTest(
    'clicking JWT Decoder header expands the section',
    async ({ page }) => {
      await page.getByText('JWT Decoder').click();
      await expect(page.getByPlaceholder(/paste jwt here/i)).toBeVisible({
        timeout: 10000,
      });
    },
  );

  adminTest(
    'shows "Decode" button when JWT Decoder is open',
    async ({ page }) => {
      await page.getByText('JWT Decoder').click();
      await expect(page.getByRole('button', { name: /^decode$/i })).toBeVisible(
        { timeout: 10000 },
      );
    },
  );

  adminTest(
    'decodes a valid JWT and shows Payload section',
    async ({ page }) => {
      await page.getByText('JWT Decoder').click();
      await expect(page.getByPlaceholder(/paste jwt here/i)).toBeVisible({
        timeout: 10000,
      });

      // A well-formed but not cryptographically signed example JWT
      const testJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
        'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      await page.getByPlaceholder(/paste jwt here/i).fill(testJwt);
      await page.getByRole('button', { name: /^decode$/i }).click();

      await expect(page.getByText('Payload')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Header')).toBeVisible({ timeout: 5000 });
    },
  );

  adminTest('shows error for invalid JWT input', async ({ page }) => {
    await page.getByText('JWT Decoder').click();
    await expect(page.getByPlaceholder(/paste jwt here/i)).toBeVisible({
      timeout: 10000,
    });

    await page.getByPlaceholder(/paste jwt here/i).fill('not-a-valid-jwt');
    await page.getByRole('button', { name: /^decode$/i }).click();

    await expect(page.getByText(/Invalid JWT/i)).toBeVisible({ timeout: 5000 });
  });
});
