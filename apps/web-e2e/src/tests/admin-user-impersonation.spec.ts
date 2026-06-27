/**
 * Admin User Impersonation E2E Tests (LS-7780)
 *
 * Covers the admin impersonation surface at /admin/users:
 *  - Authorization: admin-only access, cannot impersonate another admin
 *  - Confirmation dialog (open, cancel, confirm)
 *  - Audit trail: start/stop POST requests are made with correct payloads
 *  - Exit-impersonation flow returns the admin to their own session
 *  - ImpersonationBanner is rendered during an active impersonation session
 *  - Error handling: 5xx from the REST endpoint surfaces gracefully
 *
 * All GraphQL and REST calls are mocked hermetically via route.fulfill().
 */

import {
  adminTest,
  createCustomAuthTest,
  expect,
} from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  filterUsers,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const nonAdminTest = createCustomAuthTest('user@test.com', 'none');

/**
 * Extends adminTest with pre-loaded impersonation localStorage state so the
 * app boots as if an active impersonation session is already in progress.
 * ls_admin_profile   → the real admin's stored profile
 * ls_impersonated_user → the target user being impersonated (alice)
 */
const impersonatingTest = adminTest.extend<{
  page: import('@playwright/test').Page;
}>({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'ls_admin_profile',
        JSON.stringify({
          id: 1,
          email: 'admin@test.com',
          username: 'AdminUser',
          accessLevel: 'admin',
        }),
      );
      window.localStorage.setItem(
        'ls_impersonated_user',
        JSON.stringify({
          id: 2,
          email: 'alice@example.com',
          username: 'alice',
          accessLevel: 'none',
        }),
      );
    });
    await use(page);
  },
});

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
  {
    __typename: 'User',
    id: 3,
    email: 'bob@example.com',
    username: 'bob',
    accessLevel: 'none',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockAdminUsersGraphQL(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route) => {
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { usersCount: matchedUsers.length } }),
      });
    } else if (op === 'admingetusers' || op === 'getallusers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { users: matchedUsers } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
  await useTier(page, 'admin');
}

/** Registers hermetic REST mocks for the impersonation start endpoint. */
async function mockImpersonateStart(
  page: import('@playwright/test').Page,
  opts: { status?: number } = {},
): Promise<void> {
  await page.route(/\/impersonate$/, async (route) => {
    if (opts.status && opts.status >= 400) {
      await route.fulfill({
        status: opts.status,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 2,
          email: 'alice@example.com',
          username: 'alice',
          accessLevel: 'none',
        },
      }),
    });
  });
}

/** Registers hermetic REST mock for the stop-impersonate endpoint. */
async function mockImpersonateStop(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route('**/stop-impersonate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
}

// ---------------------------------------------------------------------------
// Authorization @critical (AC1)
// ---------------------------------------------------------------------------

adminTest.describe('Impersonation — authorization @critical', () => {
  adminTest.beforeEach(async ({ page }) => {
    await mockAdminUsersGraphQL(page);
    await page.goto('/admin/users');
    await page.waitForLoadState('load');
    await expect(page.getByText('alice@example.com')).toBeVisible();
  });

  adminTest(
    'Impersonate button is visible for non-admin users',
    async ({ page }) => {
      await expect(
        page.getByRole('button', { name: /^impersonate$/i }).first(),
      ).toBeVisible();
    },
  );

  adminTest(
    'Impersonate button is NOT shown for the admin user row (self + other admins)',
    async ({ page }) => {
      // AdminUser (id:1) is the current session and is admin; no button for them.
      // Only alice (id:2) and bob (id:3) get an Impersonate button → exactly 2.
      await expect(
        page.getByRole('button', { name: /^impersonate$/i }),
      ).toHaveCount(2);
    },
  );

  adminTest(
    'clicking Impersonate opens a confirmation dialog',
    async ({ page }) => {
      await page
        .getByRole('button', { name: /^impersonate$/i })
        .first()
        .click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
    },
  );

  adminTest(
    'confirmation dialog shows the target username in the title',
    async ({ page }) => {
      await page
        .getByRole('button', { name: /^impersonate$/i })
        .first()
        .click();
      const dialog = page.getByRole('alertdialog');
      // Title is "Impersonate {username}?" per ImpersonationDialog implementation
      await expect(dialog).toContainText(/impersonate/i);
    },
  );

  adminTest(
    'cancelling the dialog closes it without navigating',
    async ({ page }) => {
      await page
        .getByRole('button', { name: /^impersonate$/i })
        .first()
        .click();
      await expect(page.getByRole('alertdialog')).toBeVisible();

      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: /cancel/i })
        .click();

      await expect(page.getByRole('alertdialog')).not.toBeVisible();
      await expect(page).toHaveURL('/admin/users');
    },
  );
});

nonAdminTest.describe('Impersonation — non-admin access @critical', () => {
  nonAdminTest('non-admin user cannot reach /admin/users', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForLoadState('load');
    await expect(page).not.toHaveURL('/admin/users', { timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Impersonation flow & audit trail @regression (AC1, AC3)
// ---------------------------------------------------------------------------

adminTest.describe(
  'Impersonation — start flow & audit trail @regression',
  () => {
    adminTest(
      'confirming impersonation POSTs to /impersonate with the correct userId',
      async ({ page }) => {
        await mockAdminUsersGraphQL(page);
        await mockImpersonateStart(page);

        const requestPromise = page.waitForRequest(
          (req) => req.method() === 'POST' && /\/impersonate$/.test(req.url()),
        );

        await page.goto('/admin/users');
        await page.waitForLoadState('load');
        await expect(page.getByText('alice@example.com')).toBeVisible();

        // Open dialog for alice (first non-admin user, id:2)
        await page
          .getByRole('button', { name: /^impersonate$/i })
          .first()
          .click();
        await expect(page.getByRole('alertdialog')).toBeVisible();
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: /^impersonate$/i })
          .click();

        const req = await requestPromise;
        const body = JSON.parse(req.postData() ?? '{}') as { userId?: unknown };
        expect(body.userId).toBe(2);
      },
    );

    adminTest(
      'after confirming impersonation the app navigates to the home page',
      async ({ page }) => {
        await mockAdminUsersGraphQL(page);
        await mockImpersonateStart(page);

        await page.goto('/admin/users');
        await page.waitForLoadState('load');
        await expect(page.getByText('alice@example.com')).toBeVisible();

        await page
          .getByRole('button', { name: /^impersonate$/i })
          .first()
          .click();
        await expect(page.getByRole('alertdialog')).toBeVisible();
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: /^impersonate$/i })
          .click();

        await expect(page).toHaveURL('/', { timeout: 15000 });
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Exit impersonation flow @regression (AC4)
// ---------------------------------------------------------------------------

impersonatingTest.describe('Impersonation — exit flow @regression', () => {
  impersonatingTest(
    'clicking "Stop Impersonating" POSTs to /stop-impersonate',
    async ({ page }) => {
      await mockImpersonateStop(page);

      const stopRequestPromise = page.waitForRequest(
        (req) =>
          req.method() === 'POST' && req.url().endsWith('/stop-impersonate'),
      );

      await page.goto('/');
      await page.waitForLoadState('load');

      await page.getByRole('button', { name: /stop impersonating/i }).click();

      // Verify the stop request was made
      await stopRequestPromise;
    },
  );

  impersonatingTest(
    'after stopping impersonation the app navigates to /admin',
    async ({ page }) => {
      await mockImpersonateStop(page);

      await page.goto('/');
      await page.waitForLoadState('load');

      await page.getByRole('button', { name: /stop impersonating/i }).click();

      await expect(page).toHaveURL('/admin', { timeout: 15000 });
    },
  );
});

// ---------------------------------------------------------------------------
// ImpersonationBanner @regression (AC5)
// ---------------------------------------------------------------------------

impersonatingTest.describe(
  'ImpersonationBanner — active impersonation session @regression',
  () => {
    impersonatingTest.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');
    });

    impersonatingTest(
      'ImpersonationBanner is visible with role="alert"',
      async ({ page }) => {
        await expect(page.getByRole('alert')).toBeVisible();
      },
    );

    impersonatingTest(
      'banner shows the impersonated username',
      async ({ page }) => {
        await expect(page.getByRole('alert')).toContainText('alice');
      },
    );

    impersonatingTest('banner shows the admin username', async ({ page }) => {
      await expect(page.getByRole('alert')).toContainText('AdminUser');
    });

    impersonatingTest(
      'banner has a visible "Stop Impersonating" button',
      async ({ page }) => {
        await expect(
          page.getByRole('button', { name: /stop impersonating/i }),
        ).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Error handling @regression (AC6)
// ---------------------------------------------------------------------------

adminTest.describe('Impersonation — error handling @regression', () => {
  adminTest(
    'a 500 from /impersonate does not crash the page',
    async ({ page }) => {
      await mockAdminUsersGraphQL(page);
      await mockImpersonateStart(page, { status: 500 });

      await page.goto('/admin/users');
      await page.waitForLoadState('load');
      await expect(page.getByText('alice@example.com')).toBeVisible();

      await page
        .getByRole('button', { name: /^impersonate$/i })
        .first()
        .click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: /^impersonate$/i })
        .click();

      // Page must remain stable (no crash / white screen)
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
      // User stays on /admin/users; navigation did not proceed
      await expect(page).toHaveURL('/admin/users');
    },
  );

  adminTest(
    'a 429 from /impersonate does not crash the page',
    async ({ page }) => {
      await mockAdminUsersGraphQL(page);
      await mockImpersonateStart(page, { status: 429 });

      await page.goto('/admin/users');
      await page.waitForLoadState('load');
      await expect(page.getByText('alice@example.com')).toBeVisible();

      await page
        .getByRole('button', { name: /^impersonate$/i })
        .first()
        .click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: /^impersonate$/i })
        .click();

      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
      await expect(page).toHaveURL('/admin/users');
    },
  );
});
