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
 *   - Accessibility: logo alt text, <main> landmark, <nav> landmark (LS-3507)
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_USER_DATA = {
  __typename: 'Query',
  user: {
    __typename: 'User',
    id: 1,
    username: 'testuser',
    email: 'testuser@example.com',
    avatarUrl: null,
    accessLevel: 'none',
    subscriptionTier: null,
    discordId: null,
    discordUsername: null,
    themePreference: null,
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

// ---------------------------------------------------------------------------
// LS-4912: Appearance / theme switcher must be reachable from
// /profile/settings — including on mobile, where the desktop user-profile
// dropdown (which carries its own theme picker) is not rendered. Users on
// mobile reach this page via the bottom-bar "You" tab and had no way to
// change theme before this fix.
// ---------------------------------------------------------------------------

test.describe('Profile Settings Page — appearance @regression', () => {
  test('renders Appearance section with all three theme options', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    await expect(page.getByText('Appearance')).toBeVisible();
    // The theme options are Tamagui styled `role="radio"` buttons. Tamagui does
    // not forward `data-testid` on these (it does forward role/aria-*), so the
    // accessible name (aria-label="<Label> theme") is the stable locator — the
    // same role-based approach dark-mode.spec.ts uses for the preferences chips.
    await expect(
      page.getByRole('radio', { name: 'Light theme' }),
    ).toBeVisible();
    await expect(
      page.getByRole('radio', { name: 'System theme' }),
    ).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Dark theme' })).toBeVisible();
  });

  test('theme can be changed on mobile (412x784 viewport)', async ({
    page,
  }) => {
    // Match the reporter's viewport from LS-4912 exactly.
    await page.setViewportSize({ width: 412, height: 784 });
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    const light = page.getByRole('radio', { name: 'Light theme' });
    const dark = page.getByRole('radio', { name: 'Dark theme' });

    await expect(light).toBeVisible();
    await light.click();
    await expect(light).toHaveAttribute('aria-checked', 'true');

    await dark.click();
    await expect(dark).toHaveAttribute('aria-checked', 'true');
    await expect(light).toHaveAttribute('aria-checked', 'false');
  });

  test('theme radio group follows ARIA roving-tabindex model', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');

    const light = page.getByRole('radio', { name: 'Light theme' });
    const system = page.getByRole('radio', { name: 'System theme' });
    const dark = page.getByRole('radio', { name: 'Dark theme' });

    // Select Light so we have a known starting point.
    await light.click();
    await expect(light).toHaveAttribute('aria-checked', 'true');

    // Only the checked option is in the tab order.
    await expect(light).toHaveAttribute('tabindex', '0');
    await expect(system).toHaveAttribute('tabindex', '-1');
    await expect(dark).toHaveAttribute('tabindex', '-1');

    // ArrowRight moves selection (and focus) to System.
    await light.focus();
    await page.keyboard.press('ArrowRight');
    await expect(system).toHaveAttribute('aria-checked', 'true');
    await expect(system).toHaveAttribute('tabindex', '0');
    await expect(light).toHaveAttribute('tabindex', '-1');
    await expect(system).toBeFocused();

    // ArrowLeft wraps back to Light from System.
    await page.keyboard.press('ArrowLeft');
    await expect(light).toHaveAttribute('aria-checked', 'true');
    await expect(light).toBeFocused();

    // End jumps to the last option (Dark).
    await page.keyboard.press('End');
    await expect(dark).toHaveAttribute('aria-checked', 'true');
    await expect(dark).toBeFocused();
  });
});

// ---------------------------------------------------------------------------
// LS-3507: Accessibility regression — /profile/settings
//
// An automated scan flagged an empty alt attribute on the logo image and
// missing <main> / <nav> landmarks on /profile/settings. These tests lock in
// the correct accessible markup so a future regression is caught immediately.
// ---------------------------------------------------------------------------

test.describe('Profile Settings Page — accessibility @regression', () => {
  test('logo image has non-empty alt text', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');
    await page.waitForLoadState('load');

    const logo = page.getByTestId('header-logo');
    await expect(logo).toBeAttached({ timeout: 15_000 });
    const alt = await logo.getAttribute('alt');
    expect(alt).toBeTruthy();
    expect((alt ?? '').trim().length).toBeGreaterThan(0);
  });

  test('page has a <main> landmark', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');
    await page.waitForLoadState('load');

    await expect(page.getByRole('main')).toBeVisible({ timeout: 15_000 });
  });

  test('page has a primary navigation landmark', async ({ page }) => {
    await setupProfileGraphQL(page);
    await page.goto('/profile/settings');
    await page.waitForLoadState('load');

    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible(
      { timeout: 15_000 },
    );
  });
});

// ---------------------------------------------------------------------------
// LS-3506: /profile/settings is a protected route. Unauthenticated users must
// NOT see the profile settings content. EnhancedAuthGuard renders the login
// page in-place at the requested URL (no redirect). An automated audit crawler
// visited https://legacy-fantasy.com/profile/settings unauthenticated and
// mis-reported it as broken — these tests lock in the unauthenticated behaviour
// so a regression cannot go undetected.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Profile Settings — unauthenticated visitor @regression',
  () => {
    unauthTest(
      'stays at /profile/settings and shows login page for unauthenticated user',
      async ({ page }) => {
        await page.goto('/profile/settings');
        await page.waitForLoadState('load');

        // EnhancedAuthGuard renders the login page in-place — no redirect to /.
        await expect(page).toHaveURL('/profile/settings', { timeout: 15_000 });
      },
    );

    unauthTest(
      'shows sign-in CTA for unauthenticated user at /profile/settings',
      async ({ page }) => {
        await page.goto('/profile/settings');
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      'does not show Profile Settings content for unauthenticated user',
      async ({ page }) => {
        await page.goto('/profile/settings');
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('heading', { name: /profile settings/i }),
        ).not.toBeVisible();
      },
    );
  },
);
