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
  filterUsers,
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

    // Honor the GetAllUsers/GetUsersCount `search` variable so the
    // /admin/users search tests get realistic filtered results.
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

    if (op === 'admingetusers' || op === 'getallusers') {
      // The recent-signups list on /admin (GetAllUsers) and the server-side
      // searched list on /admin/users resolve to the same { users } shape.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { users: matchedUsers } }),
      });
    } else if (op === 'getuserscount') {
      // GetUsersCount feeds the "Total Users" stat and the /admin/users
      // result count; honor the search variable for the filtered set.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { usersCount: matchedUsers.length } }),
      });
    } else if (op === 'getuserbyid') {
      // The redesigned /admin and /admin/users gate admin access on a
      // server-side GetUserById lookup. Return the admin identity matching
      // the adminTest JWT so the not-admin redirect does not fire.
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
    // User management (list, search, impersonation) lives on the dedicated
    // /admin/users page (AdminUsersPage) after the admin redesign (LS-5315) —
    // /admin itself only shows the read-only "Recent Signups" widget.
    adminTest.beforeEach(async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await mockAdminGraphQL(page);
      await page.goto('/admin/users');
      await page.waitForLoadState('load');
      // Wait for the user list to render before interacting with it.
      await expect(page.getByText('alice@example.com')).toBeVisible();
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
      const searchInput = page.getByPlaceholder(/search by email or username/i);
      await expect(searchInput).toBeVisible();

      await searchInput.fill('alice');
      await expect(page.getByText('alice@example.com')).toBeVisible();
      await expect(page.getByText('bob@example.com')).not.toBeVisible();
    });

    adminTest(
      'shows empty state on mobile when search has no matches',
      async ({ page }) => {
        const searchInput = page.getByPlaceholder(
          /search by email or username/i,
        );
        await searchInput.fill('zzz-no-match');
        await expect(
          page.getByText(/no users match your search/i),
        ).toBeVisible();
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
    // The JWT Decoder is the last section on /admin, so its controls sit at the
    // bottom of the page on the mobile viewport, behind the fixed bottom-nav
    // bar. Playwright's default actionability scroll re-aligns a target flush
    // with the viewport bottom (under the bar) right before clicking. Centering
    // the target and then forcing the interaction keeps the click point clear
    // of the bar so the event reaches the control rather than the navigation.
    type LocatorLike = ReturnType<import('@playwright/test').Page['getByText']>;

    async function tapCentered(locator: LocatorLike): Promise<void> {
      await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      // dispatchEvent bypasses pointer hit-testing entirely, so the fixed
      // bottom-nav bar cannot intercept the click; the event still reaches
      // React's onClick / Tamagui onPress handler on (or bubbling up from) the
      // target element.
      await locator.dispatchEvent('click');
    }

    async function fillCentered(
      locator: LocatorLike,
      value: string,
    ): Promise<void> {
      await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await locator.fill(value, { force: true });
    }

    async function openJwtDecoder(
      page: import('@playwright/test').Page,
    ): Promise<void> {
      await tapCentered(page.getByText('JWT Decoder'));
    }

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
        await openJwtDecoder(page);
        await expect(
          page.getByRole('button', { name: /^decode$/i }),
        ).toBeVisible();
      },
    );

    adminTest('decodes a valid JWT on mobile viewport', async ({ page }) => {
      await openJwtDecoder(page);
      await expect(page.getByPlaceholder(/paste jwt here/i)).toBeVisible();

      const testJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
        'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      await fillCentered(page.getByPlaceholder(/paste jwt here/i), testJwt);
      await tapCentered(page.getByRole('button', { name: /^decode$/i }));

      await expect(page.getByText('Payload', { exact: true })).toBeVisible();
      await expect(page.getByText('Header', { exact: true })).toBeVisible();
    });

    adminTest(
      'shows error for invalid JWT on mobile viewport',
      async ({ page }) => {
        await openJwtDecoder(page);
        await expect(page.getByPlaceholder(/paste jwt here/i)).toBeVisible();

        await fillCentered(
          page.getByPlaceholder(/paste jwt here/i),
          'not-a-valid-jwt',
        );
        await tapCentered(page.getByRole('button', { name: /^decode$/i }));

        await expect(page.getByText(/Invalid JWT/i)).toBeVisible();
      },
    );
  },
);
