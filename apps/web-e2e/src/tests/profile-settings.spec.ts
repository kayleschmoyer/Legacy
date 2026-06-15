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
import {
  isGraphQLEndpoint,
  unmockedGraphQLFallback,
} from '../mocks/graphql/router';

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_USER_DATA = {
  __typename: 'Query',
  user: {
    __typename: 'User',
    id: 1,
    username: 'testuser',
    email: 'e2e-test@legacysports.dev',
    avatarUrl: null,
    accessLevel: 'none',
    subscriptionTier: null,
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

      // Cascade unhandled operations (e.g. the ambient MyIdentities query the
      // ProfileSettingsPage fires on load) to the _apiIsolation baseline
      // fixture instead of swallowing them with empty data, which would crash
      // the page (LS-7960).
      await unmockedGraphQLFallback(route);
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
// LS-7825: Linked Identities section — canonical email management
// ---------------------------------------------------------------------------

const MOCK_IDENTITIES_GOOGLE_CANONICAL = [
  {
    __typename: 'UserIdentity',
    id: 1,
    provider: 'google',
    providerEmail: 'e2e-test@legacysports.dev',
    providerEmailVerified: true,
    providerUsername: null,
    providerAvatar: null,
    linkedAt: '2026-01-01T00:00:00Z',
  },
];

const MOCK_IDENTITIES_MULTI = [
  {
    __typename: 'UserIdentity',
    id: 1,
    provider: 'google',
    providerEmail: 'e2e-test@legacysports.dev',
    providerEmailVerified: true,
    providerUsername: null,
    providerAvatar: null,
    linkedAt: '2026-01-01T00:00:00Z',
  },
  {
    __typename: 'UserIdentity',
    id: 2,
    provider: 'discord',
    providerEmail: 'testuser@discord.example.com',
    providerEmailVerified: true,
    providerUsername: 'testuser#1234',
    providerAvatar: null,
    linkedAt: '2026-02-01T00:00:00Z',
  },
];

async function setupProfileGraphQLWithIdentities(
  page: import('@playwright/test').Page,
  identities = MOCK_IDENTITIES_GOOGLE_CANONICAL,
) {
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

      if (body.operationName === 'MyIdentities') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { myIdentities: identities } }),
        });
        return;
      }

      if (body.operationName === 'SetCanonicalEmail') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              setCanonicalEmail: {
                __typename: 'SetCanonicalEmailResult',
                changed: true,
                user: {
                  __typename: 'User',
                  id: 1,
                  email: 'testuser@discord.example.com',
                  username: 'testuser',
                  avatarUrl: null,
                  accessLevel: 'none',
                  subscriptionTier: null,
                  themePreference: null,
                },
              },
            },
          }),
        });
        return;
      }

      await unmockedGraphQLFallback(route);
    },
  );
}

test.describe('Profile Settings Page — Linked Identities (LS-7825) @regression', () => {
  test('renders the Linked Identities section', async ({ page }) => {
    await setupProfileGraphQLWithIdentities(page);
    await page.goto('/profile/settings');
    await expect(
      page.getByTestId('profile-linked-identities-section'),
    ).toBeVisible();
    await expect(page.getByText('Linked Identities')).toBeVisible();
  });

  test('shows the canonical identity with a "Primary email" badge', async ({
    page,
  }) => {
    await setupProfileGraphQLWithIdentities(page);
    await page.goto('/profile/settings');
    await expect(page.getByText('Primary email')).toBeVisible();
    // Scope to the section — bare getByText('Google') also matches the
    // info banner and the "Google OAuth" sign-in method row.
    await expect(
      page
        .getByTestId('profile-linked-identities-section')
        .getByText('Google', { exact: true }),
    ).toBeVisible();
  });

  test('shows "Set as primary" button for a verified non-canonical identity', async ({
    page,
  }) => {
    await setupProfileGraphQLWithIdentities(page, MOCK_IDENTITIES_MULTI);
    await page.goto('/profile/settings');
    await expect(page.getByText('Set as primary')).toBeVisible();
  });

  test('shows "Disconnect" button for non-local providers', async ({
    page,
  }) => {
    await setupProfileGraphQLWithIdentities(page, MOCK_IDENTITIES_MULTI);
    await page.goto('/profile/settings');
    const disconnectButtons = page.getByText('Disconnect');
    await expect(disconnectButtons.first()).toBeVisible();
  });

  test('clicking "Set as primary" calls SetCanonicalEmail mutation', async ({
    page,
  }) => {
    let mutationCalled = false;
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route, request) => {
        const body = request.postDataJSON() as {
          operationName?: string;
          variables?: { identityId?: number };
        };

        if (body.operationName === 'GetUserById') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: MOCK_USER_DATA }),
          });
          return;
        }

        if (body.operationName === 'MyIdentities') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { myIdentities: MOCK_IDENTITIES_MULTI },
            }),
          });
          return;
        }

        if (body.operationName === 'SetCanonicalEmail') {
          mutationCalled = true;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                setCanonicalEmail: {
                  __typename: 'SetCanonicalEmailResult',
                  changed: true,
                  user: {
                    ...MOCK_USER_DATA.user,
                    email: 'testuser@discord.example.com',
                  },
                },
              },
            }),
          });
          return;
        }

        await unmockedGraphQLFallback(route);
      },
    );

    await page.goto('/profile/settings');
    // EditButton is a Tamagui styled() component, which does not forward
    // data-testid in the web build — locate by accessible role + name. Only
    // the non-canonical verified identity (discord, id 2) renders the button.
    const setAsPrimaryBtn = page.getByRole('button', {
      name: 'Set as primary',
    });
    await expect(setAsPrimaryBtn).toBeVisible();
    await setAsPrimaryBtn.click();
    await expect.poll(() => mutationCalled, { timeout: 5000 }).toBe(true);
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
// LS-7833: Two-Factor Authentication section — enable/disable 2FA flow
// ---------------------------------------------------------------------------

// Route MFA traffic through the static server port so the _apiIsolation
// catch-all (which blocks everything not on port 4280) doesn't swallow
// these requests before the per-test handlers can fulfill them.
const E2E_ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4280}`;
const MFA_STATUS_URL = `${E2E_ORIGIN}/mfa/status`;
const MFA_ENROLL_URL = `${E2E_ORIGIN}/mfa/enroll`;
const MFA_VERIFY_URL = `${E2E_ORIGIN}/mfa/verify-setup`;
const MFA_DISABLE_URL = `${E2E_ORIGIN}/mfa/disable`;

async function setupMfaRoutes(
  page: import('@playwright/test').Page,
  { mfaEnabled }: { mfaEnabled: boolean },
) {
  // Inject the override before any scripts run so getMfaStatus() uses the
  // same origin as the static server (port 4280), bypassing the catch-all.
  await page.addInitScript((origin: string) => {
    window.__e2eOauthProxyUrl = origin;
  }, E2E_ORIGIN);

  await page.route(MFA_STATUS_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mfaEnabled }),
    }),
  );
}

test.describe('Profile Settings — Two-Factor Authentication @regression', () => {
  test('shows the Two-Factor Authentication section', async ({ page }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: false });
    await page.goto('/profile/settings');

    await expect(page.getByText('Two-Factor Authentication')).toBeVisible();
    await expect(
      page.getByText('Add an extra layer of security to your account'),
    ).toBeVisible();
  });

  test('shows Enable 2FA button when MFA is disabled', async ({ page }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: false });
    await page.goto('/profile/settings');

    await expect(page.getByRole('button', { name: /Enable 2FA/i })).toBeVisible(
      { timeout: 10_000 },
    );
    await expect(
      page.getByRole('button', { name: /Disable 2FA/i }),
    ).not.toBeVisible();
  });

  test('shows QR code and verification input after clicking Enable 2FA', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: false });

    await page.route(MFA_ENROLL_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri:
            'otpauth://totp/Legacy%20Sports:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Legacy%20Sports',
        }),
      }),
    );

    await page.goto('/profile/settings');

    const enableBtn = page.getByRole('button', { name: /Enable 2FA/i });
    await expect(enableBtn).toBeVisible({ timeout: 10_000 });
    await enableBtn.click();

    await expect(page.getByTestId('2fa-enroll-flow')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('2fa-code-input')).toBeVisible();
    await expect(page.getByRole('button', { name: /Verify/i })).toBeVisible();
  });

  test('shows enrollment error when verify-setup returns invalid code', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: false });

    await page.route(MFA_ENROLL_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/Legacy%20Sports:user@example.com',
        }),
      }),
    );
    await page.route(MFA_VERIFY_URL, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid code' }),
      }),
    );

    await page.goto('/profile/settings');

    await page.getByRole('button', { name: /Enable 2FA/i }).click();
    await expect(page.getByTestId('2fa-code-input')).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId('2fa-code-input').fill('000000');
    await page.getByRole('button', { name: /Verify/i }).click();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('alert')).toHaveText('Invalid code');
  });

  test('shows Disable 2FA button when MFA is enabled', async ({ page }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: true });
    await page.goto('/profile/settings');

    await expect(
      page.getByRole('button', { name: /Disable 2FA/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('returns to disabled state after disabling 2FA', async ({ page }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: true });

    await page.route(MFA_DISABLE_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      }),
    );

    await page.goto('/profile/settings');

    const disableBtn = page.getByRole('button', { name: /Disable 2FA/i });
    await expect(disableBtn).toBeVisible({ timeout: 10_000 });

    page.once('dialog', (dialog) => void dialog.accept());
    await disableBtn.click();

    // useMfa sets mfaEnabled: false directly on success, so the Enable button
    // should appear without a page reload.
    await expect(page.getByRole('button', { name: /Enable 2FA/i })).toBeVisible(
      { timeout: 10_000 },
    );
  });

  test('flips to Enabled state after successful enrollment with valid code', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: false });

    await page.route(MFA_ENROLL_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri:
            'otpauth://totp/Legacy%20Sports:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Legacy%20Sports',
        }),
      }),
    );
    await page.route(MFA_VERIFY_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      }),
    );

    await page.goto('/profile/settings');

    await page.getByRole('button', { name: /Enable 2FA/i }).click();
    await expect(page.getByTestId('2fa-code-input')).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId('2fa-code-input').fill('123456');
    await page.getByRole('button', { name: /Verify/i }).click();

    // useMfa.verifySetup sets mfaEnabled: true on success — Disable button must appear.
    await expect(
      page.getByRole('button', { name: /Disable 2FA/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: /Enable 2FA/i }),
    ).not.toBeVisible();
  });

  test('full cycle: enables 2FA then disables it in the same session', async ({
    page,
  }) => {
    await setupProfileGraphQL(page);
    await setupMfaRoutes(page, { mfaEnabled: false });

    await page.route(MFA_ENROLL_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri:
            'otpauth://totp/Legacy%20Sports:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Legacy%20Sports',
        }),
      }),
    );
    await page.route(MFA_VERIFY_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      }),
    );
    await page.route(MFA_DISABLE_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      }),
    );

    await page.goto('/profile/settings');

    // — Enable phase —
    await page.getByRole('button', { name: /Enable 2FA/i }).click();
    await expect(page.getByTestId('2fa-code-input')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId('2fa-code-input').fill('123456');
    await page.getByRole('button', { name: /Verify/i }).click();
    await expect(
      page.getByRole('button', { name: /Disable 2FA/i }),
    ).toBeVisible({ timeout: 10_000 });

    // — Disable phase —
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: /Disable 2FA/i }).click();
    await expect(page.getByRole('button', { name: /Enable 2FA/i })).toBeVisible(
      { timeout: 10_000 },
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
