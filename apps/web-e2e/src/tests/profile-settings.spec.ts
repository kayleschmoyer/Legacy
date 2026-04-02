/**
 * Profile Settings Page — E2E Tests (LS-677)
 *
 * Covers the Profile Settings page at /profile/settings:
 *   - Page loads and displays heading
 *   - Profile section: username, email, access level, user id fields
 *   - Info banner includes text: "Email and profile photo are managed through your Google account"
 *   - App Avatar section present
 *   - Account & Security section: sign-in method, session status
 *   - Session/Danger zone: Sign Out button present
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_USER_DATA = {
  __typename: 'Query',
  user: {
    __typename: 'User',
    id: 1,
    username: 'testuser',
    email: 'testuser@example.com',
    avatarUrl: null,
    accessLevel: 'user',
  },
};

// ── GraphQL Mock Setup ────────────────────────────────────────────────────────

async function setupProfileGraphQL(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as { operationName?: string };

      if (body.operationName === 'GetUserById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: MOCK_USER_DATA }),
        });
        return;
      }

      if (body.operationName === 'UpdateUserAvatar') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              updateUserAvatar: {
                __typename: 'User',
                id: 1,
                avatarUrl: 'https://example.com/avatar.png',
              },
            },
          }),
        });
        return;
      }

      // Default mock — return empty data for any unhandled GraphQL operations
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    },
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Profile Settings Page @smoke', () => {
  test('should load and display the Profile Settings heading', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');
    await expect(
      page.getByRole('heading', { name: 'Profile Settings' }),
    ).toBeVisible();
  });

  test('should display the Profile section with user information', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    // Profile section heading
    await expect(
      page.getByText('Profile', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Your public identity on Legacy Sports'),
    ).toBeVisible();
  });

  test('should display username field', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    const usernameLabel = page.getByText('Username', { exact: true });
    await expect(usernameLabel).toBeVisible();
  });

  test('should display email field', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    const emailLabel = page.getByText('Email', { exact: true });
    await expect(emailLabel).toBeVisible();
  });

  test('should display User ID field', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    const userIdLabel = page.getByText('User ID');
    await expect(userIdLabel).toBeVisible();
  });

  test('should display info banner about Google-managed profile', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await expect(
      page.getByText(
        /Email and profile photo are managed through your Google account/,
      ),
    ).toBeVisible();
  });

  test('should display App Avatar section', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await expect(page.getByText('App Avatar')).toBeVisible();
    await expect(
      page.getByText(/Choose a custom avatar displayed in chat/),
    ).toBeVisible();
  });

  test('should display Account & Security section', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await expect(page.getByText('Account & Security')).toBeVisible();
    await expect(page.getByText('Sign-in Method')).toBeVisible();
    await expect(page.getByText('Google OAuth')).toBeVisible();
  });

  test('should display active session indicator', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await expect(
      page.getByText('Session', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Active', { exact: true }).first(),
    ).toBeVisible();
  });

  test('should display Sign Out button', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    const signOutButton = page.getByRole('button', { name: /sign out/i });
    await expect(signOutButton).toBeVisible();
  });

  test('should display sign out description text', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await expect(
      page.getByText(
        /You will be signed out of your Legacy Sports account and redirected to the login page/,
      ),
    ).toBeVisible();
  });

  test('should display Access Level field', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await expect(page.getByText('Access Level')).toBeVisible();
  });

  test('should display page meta description', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await expect(
      page.getByText(/Manage your account information and preferences/),
    ).toBeVisible();
  });
});
