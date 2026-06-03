/**
 * Admin Cross-Platform Parity E2E Tests (LS-5314)
 *
 * Verifies that the Admin Console has consistent UX and security on:
 *  - Desktop web (1280×800)
 *  - Mobile web (375×812 — simulates Android/iOS browser viewport)
 *
 * Covered scenarios:
 *  - Access control (non-admin redirect) works on both viewports
 *  - Admin Console heading, users section, and key actions render on mobile
 *  - Impersonate button is present and functional on mobile viewport
 *  - JWT Decoder is accessible on mobile viewport
 *  - User search works on mobile viewport
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
// Viewports
// ---------------------------------------------------------------------------

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

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

async function mockAdminGraphQL(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();

    if (op === 'admingetusers' || op === 'getusers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { users: MOCK_USERS } }),
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
// Non-admin fixture
// ---------------------------------------------------------------------------

const nonAdminTest = createCustomAuthTest('user@test.com', 'none');

// ---------------------------------------------------------------------------
// Access control — consistent across viewports
// ---------------------------------------------------------------------------

nonAdminTest.describe(
  'Admin cross-platform parity — access control @critical',
  () => {
    for (const [label, viewport] of [
      ['desktop', DESKTOP_VIEWPORT],
      ['mobile', MOBILE_VIEWPORT],
    ] as const) {
      nonAdminTest(
        `non-admin is redirected on ${label} viewport`,
        async ({ page }) => {
          await page.setViewportSize(viewport);
          await page.route(isGraphQLEndpoint, async (route) => {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ data: { users: [] } }),
            });
          });

          await page.goto('/admin');
          await page.waitForLoadState('load');

          await expect(page).not.toHaveURL('/admin', { timeout: 10_000 });
        },
      );
    }
  },
);

// ---------------------------------------------------------------------------
// Page structure — desktop vs mobile parity
// ---------------------------------------------------------------------------

adminTest.describe(
  'Admin cross-platform parity — page structure @smoke',
  () => {
    for (const [label, viewport] of [
      ['desktop', DESKTOP_VIEWPORT],
      ['mobile', MOBILE_VIEWPORT],
    ] as const) {
      adminTest(
        `shows Admin Console heading on ${label} viewport`,
        async ({ page }) => {
          await page.setViewportSize(viewport);
          await mockAdminGraphQL(page);
          await page.goto('/admin');
          await page.waitForLoadState('load');

          await expect(page.getByText('Admin Console')).toBeVisible();
        },
      );

      adminTest(
        `shows Users section on ${label} viewport`,
        async ({ page }) => {
          await page.setViewportSize(viewport);
          await mockAdminGraphQL(page);
          await page.goto('/admin');
          await page.waitForLoadState('load');

          await expect(
            page.getByText('Users', { exact: true }).first(),
          ).toBeVisible();
        },
      );

      adminTest(
        `shows Revenue Analytics link on ${label} viewport`,
        async ({ page }) => {
          await page.setViewportSize(viewport);
          await mockAdminGraphQL(page);
          await page.goto('/admin');
          await page.waitForLoadState('load');

          await expect(page.getByText('Revenue Analytics')).toBeVisible();
        },
      );
    }
  },
);

// ---------------------------------------------------------------------------
// User management — mobile parity
// ---------------------------------------------------------------------------

adminTest.describe(
  'Admin cross-platform parity — user management on mobile @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await mockAdminGraphQL(page);
      await page.goto('/admin');
      await page.waitForLoadState('load');
    });

    adminTest('shows user list on mobile viewport', async ({ page }) => {
      await expect(page.getByText('alice@example.com')).toBeVisible();
      await expect(page.getByText('bob@example.com')).toBeVisible();
    });

    adminTest(
      'shows Impersonate button for non-admin users on mobile',
      async ({ page }) => {
        await expect(
          page.getByRole('button', { name: /impersonate/i }).first(),
        ).toBeVisible();
      },
    );

    adminTest(
      'does not show Impersonate button for admin users on mobile',
      async ({ page }) => {
        // Only alice and bob (non-admin) get Impersonate buttons
        const impersonateButtons = page.getByRole('button', {
          name: /impersonate/i,
        });
        await expect(impersonateButtons).toHaveCount(2);
      },
    );

    adminTest('user search works on mobile viewport', async ({ page }) => {
      const searchInput = page.getByPlaceholder(
        /search by name, email, or id/i,
      );
      await expect(searchInput).toBeVisible();

      await searchInput.fill('alice');
      await expect(page.getByText('alice@example.com')).toBeVisible();
      await expect(page.getByText('bob@example.com')).not.toBeVisible();
    });

    adminTest(
      'shows "No users found" on mobile when search has no matches',
      async ({ page }) => {
        const searchInput = page.getByPlaceholder(
          /search by name, email, or id/i,
        );
        await searchInput.fill('zzz-no-match');
        await expect(page.getByText(/no users found/i)).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// JWT Decoder — mobile parity
// ---------------------------------------------------------------------------

adminTest.describe(
  'Admin cross-platform parity — JWT Decoder on mobile @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await mockAdminGraphQL(page);
      await page.goto('/admin');
      await page.waitForLoadState('load');
    });

    adminTest('JWT Decoder heading is visible on mobile', async ({ page }) => {
      await expect(page.getByText('JWT Decoder')).toBeVisible();
    });

    adminTest(
      'JWT Decoder expands and Decode button is accessible on mobile',
      async ({ page }) => {
        await page.getByText('JWT Decoder').click();
        await expect(
          page.getByRole('button', { name: /^decode$/i }),
        ).toBeVisible();
      },
    );

    adminTest('decodes a valid JWT on mobile viewport', async ({ page }) => {
      await page.getByText('JWT Decoder').click();
      await expect(page.getByPlaceholder(/paste jwt here/i)).toBeVisible();

      const testJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
        'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      await page.getByPlaceholder(/paste jwt here/i).fill(testJwt);
      await page.getByRole('button', { name: /^decode$/i }).click();

      await expect(page.getByText('Payload', { exact: true })).toBeVisible();
      await expect(page.getByText('Header', { exact: true })).toBeVisible();
    });

    adminTest(
      'shows error for invalid JWT on mobile viewport',
      async ({ page }) => {
        await page.getByText('JWT Decoder').click();
        await expect(page.getByPlaceholder(/paste jwt here/i)).toBeVisible();

        await page.getByPlaceholder(/paste jwt here/i).fill('not-a-valid-jwt');
        await page.getByRole('button', { name: /^decode$/i }).click();

        await expect(page.getByText(/Invalid JWT/i)).toBeVisible();
      },
    );
  },
);
